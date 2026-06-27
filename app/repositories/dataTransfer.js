// Full-account export / restore (§6 extension). Walks EVERY collection under
// users/{uid} and round-trips it through a single JSON envelope:
//
//   users/{uid}                                  → settings (the user doc)
//   users/{uid}/bankAccounts/{id}
//   users/{uid}/investments/{id}
//   users/{uid}/months/{monthId}
//   users/{uid}/months/{monthId}/dailyExpenses/{id}
//   users/{uid}/plans/{type}                     ('monthly' | 'yearly')
//   users/{uid}/plans/{type}/versions/{id}
//   users/{uid}/investmentPlan/plan
//   users/{uid}/investmentPlan/plan/versions/{id}
//
// Records cross-reference each other by id (flow→accountId, holdings→fundId,
// pointers→versionId), so restore writes RAW docs at their original paths with
// their original ids — it must NOT go through the repo create() helpers, which
// mint fresh ids. Reads reuse the repos so the data is schema-validated and the
// doc-id is already merged into each record.
import { getDocs, writeBatch, Timestamp } from 'firebase/firestore'
import { db, userDoc, userDocRef, userCollection, stripUndefined } from './base.js'
import { settingsRepo } from './settings.js'
import { bankAccountsRepo } from './bankAccounts.js'
import { investmentsRepo } from './investments.js'
import { monthsRepo } from './months.js'
import { dailyExpensesRepo } from './dailyExpenses.js'
import { plansRepo } from './plans.js'
import { planVersionsRepo } from './planVersions.js'
import { investmentPlanRepo } from './investmentPlan.js'

/** Bump when the envelope shape changes incompatibly. */
export const BACKUP_VERSION = 1
const PLAN_TYPES = ['monthly', 'yearly']
// Firestore caps a batch at 500 writes; commit well under that.
const BATCH_LIMIT = 450

// ── Timestamp-safe (de)serialization ─────────────────────────────────────────
// Firestore Timestamps aren't JSON-serializable and `JSON.stringify` would turn
// them into a lossy/meaningless shape, so tag them and rebuild on the way back.
const TS_TAG = 'firestore/timestamp'

function isTimestamp(v) {
  return v instanceof Timestamp || (v && typeof v.toMillis === 'function' && typeof v.seconds === 'number')
}

/** Deep-copy `value` into a plain JSON-safe tree, tagging Timestamps/Dates. */
export function serialize(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (value instanceof Date) { const t = Timestamp.fromDate(value); return { __type: TS_TAG, seconds: t.seconds, nanoseconds: t.nanoseconds } }
  if (isTimestamp(value)) return { __type: TS_TAG, seconds: value.seconds, nanoseconds: value.nanoseconds }
  if (Array.isArray(value)) return value.map(serialize)
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) { const s = serialize(v); if (s !== undefined) out[k] = s }
    return out
  }
  return value
}

// Firestore Timestamp's valid range; out-of-range args make its constructor throw.
const TS_MIN_SECONDS = -62135596800
const TS_MAX_SECONDS = 253402300800

/** Inverse of serialize: rebuild Timestamp instances from their tagged form. */
export function deserialize(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(deserialize)
  if (value.__type === TS_TAG) {
    // Degrade a corrupt/out-of-range tag to null instead of throwing and
    // aborting the whole restore (the Timestamp constructor is strict).
    const s = Math.trunc(Number(value.seconds))
    const n = Math.trunc(Number(value.nanoseconds))
    if (!Number.isFinite(s) || !Number.isFinite(n) || s < TS_MIN_SECONDS || s >= TS_MAX_SECONDS || n < 0 || n >= 1e9) return null
    return new Timestamp(s, n)
  }
  const out = {}
  for (const [k, v] of Object.entries(value)) out[k] = deserialize(v)
  return out
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Gather the user's entire dataset as a JSON-safe `data` object (Timestamps
 * tagged). Caller wraps it in the envelope (see useDataTransfer).
 * @param {string} uid
 */
export async function collectUserData(uid) {
  const [settings, bankAccounts, investments, months, monthlyPlan, yearlyPlan, monthlyVersions, yearlyVersions, invPlan, invPlanVersions] = await Promise.all([
    settingsRepo.get(uid),
    bankAccountsRepo.list(uid),
    investmentsRepo.list(uid),
    monthsRepo.list(uid),
    plansRepo.get(uid, 'monthly'),
    plansRepo.get(uid, 'yearly'),
    planVersionsRepo.list(uid, 'monthly'),
    planVersionsRepo.list(uid, 'yearly'),
    // getRaw (not get) → null when the pointer doc truly doesn't exist, so a
    // backup never carries a synthetic { activeVersionId: null } that a merge
    // restore would use to clobber the destination's live routing pointer.
    investmentPlanRepo.getRaw(uid),
    investmentPlanRepo.listVersions(uid),
  ])

  // Each month's daily-expense subcollection, nested under the month for restore.
  const monthsWithDaily = await Promise.all(
    months.map(async (m) => ({ ...m, dailyExpenses: await dailyExpensesRepo.list(uid, m.month) })),
  )

  return serialize({
    settings,
    bankAccounts,
    investments,
    months: monthsWithDaily,
    plans: {
      monthly: { plan: monthlyPlan, versions: monthlyVersions },
      yearly: { plan: yearlyPlan, versions: yearlyVersions },
    },
    investmentPlan: { plan: invPlan, versions: invPlanVersions },
  })
}

/** Human-readable counts for confirmation dialogs / success toasts. */
export function countRecords(data) {
  const months = data?.months ?? []
  return {
    bankAccounts: data?.bankAccounts?.length ?? 0,
    investments: data?.investments?.length ?? 0,
    months: months.length,
    dailyExpenses: months.reduce((n, m) => n + (m.dailyExpenses?.length ?? 0), 0),
    planVersions: (data?.plans?.monthly?.versions?.length ?? 0) + (data?.plans?.yearly?.versions?.length ?? 0),
    investmentPlanVersions: data?.investmentPlan?.versions?.length ?? 0,
  }
}

// ── Restore ─────────────────────────────────────────────────────────────────

/** Auto-committing batch writer that never exceeds Firestore's 500-op cap. */
function createBatcher() {
  let batch = writeBatch(db())
  let pending = 0
  let total = 0
  async function maybeCommit() {
    if (pending >= BATCH_LIMIT) { await batch.commit(); total += pending; pending = 0; batch = writeBatch(db()) }
  }
  return {
    async set(ref, data, opts) { batch.set(ref, stripUndefined(data), opts ?? {}); pending++; await maybeCommit() },
    async delete(ref) { batch.delete(ref); pending++; await maybeCommit() },
    async commit() { if (pending) { await batch.commit(); total += pending; pending = 0 } return total },
  }
}

async function listIds(collRef) {
  const snap = await getDocs(collRef)
  return snap.docs.map((d) => d.id)
}

// A value is safe to use as a Firestore path segment only if it's a non-empty
// string with no '/', isn't '.'/'..', and isn't a reserved __…__ id — otherwise
// doc() throws synchronously. We validate the WHOLE backup up front so a corrupt
// file is rejected before any write or delete touches the account.
function isValidSegment(s) {
  return typeof s === 'string' && s.length > 0 && !s.includes('/') && s !== '.' && s !== '..' && !/^__.*__$/.test(s)
}

/**
 * Turn a deserialized backup into the list of doc writes plus the set of ids it
 * contains (per collection) — used by replace mode to prune what's NOT here.
 * Throws on any malformed path segment before a single Firestore op runs.
 */
function buildWriteOps(uid, d) {
  const writes = []
  const ids = {
    bankAccounts: new Set(),
    investments: new Set(),
    months: new Set(),
    dailyExpenses: new Map(), // monthId → Set(expenseId)
    planVersions: { monthly: new Set(), yearly: new Set() },
    plansPointer: new Set(), // plan types present
    invPlanVersions: new Set(),
    invPlanPointer: false,
  }
  // Throw a friendly error on a present-but-invalid id rather than silently
  // skipping it (which, in replace mode, would drop the record AND prune its
  // existing counterpart). Validation runs before any write, so an abort here
  // never mutates the account.
  const seg = (s, what) => {
    if (!isValidSegment(s)) throw new Error(`This backup is corrupt: invalid ${what} (${JSON.stringify(s)})`)
    return s
  }
  // Tolerate a non-array collection in a hand-edited file (skip, don't crash).
  const arr = (x) => (Array.isArray(x) ? x : [])
  const isRecord = (x) => x != null && typeof x === 'object'

  for (const a of arr(d.bankAccounts)) {
    if (!isRecord(a)) continue
    seg(a.id, 'bank account id'); ids.bankAccounts.add(a.id)
    writes.push({ ref: userDoc(uid, 'bankAccounts', a.id), data: a })
  }
  for (const i of arr(d.investments)) {
    if (!isRecord(i)) continue
    seg(i.id, 'investment id'); ids.investments.add(i.id)
    writes.push({ ref: userDoc(uid, 'investments', i.id), data: i })
  }

  for (const type of PLAN_TYPES) {
    const p = d.plans?.[type]
    if (p?.plan) { ids.plansPointer.add(type); writes.push({ ref: userDoc(uid, 'plans', type), data: { ...p.plan, type } }) }
    for (const v of arr(p?.versions)) {
      if (!isRecord(v)) continue
      seg(v.id, `${type} plan version id`); ids.planVersions[type].add(v.id)
      writes.push({ ref: userDoc(uid, 'plans', type, 'versions', v.id), data: v })
    }
  }
  if (d.investmentPlan?.plan) { ids.invPlanPointer = true; writes.push({ ref: userDoc(uid, 'investmentPlan', 'plan'), data: d.investmentPlan.plan }) }
  for (const v of arr(d.investmentPlan?.versions)) {
    if (!isRecord(v)) continue
    seg(v.id, 'investment plan version id'); ids.invPlanVersions.add(v.id)
    writes.push({ ref: userDoc(uid, 'investmentPlan', 'plan', 'versions', v.id), data: v })
  }

  for (const m of arr(d.months)) {
    if (!isRecord(m)) continue
    const { dailyExpenses, ...month } = m
    seg(month.month, 'month id'); ids.months.add(month.month)
    writes.push({ ref: userDoc(uid, 'months', month.month), data: month })
    const eset = new Set()
    for (const e of arr(dailyExpenses)) {
      if (!isRecord(e)) continue
      seg(e.id, 'daily expense id'); eset.add(e.id)
      writes.push({ ref: userDoc(uid, 'months', month.month, 'dailyExpenses', e.id), data: e })
    }
    ids.dailyExpenses.set(month.month, eset)
  }

  return { writes, ids }
}

/**
 * Replace-mode prune: delete every existing doc whose id is NOT present in the
 * backup (subcollections included). Runs AFTER all writes have committed, so the
 * account is never emptied — a failure leaves a harmless superset, never a gap.
 */
async function pruneStale(uid, ids, onProgress) {
  const b = createBatcher()

  onProgress?.('Removing accounts & investments not in the backup…')
  for (const id of await listIds(userCollection(uid, 'bankAccounts'))) if (!ids.bankAccounts.has(id)) await b.delete(userDoc(uid, 'bankAccounts', id))
  for (const id of await listIds(userCollection(uid, 'investments'))) if (!ids.investments.has(id)) await b.delete(userDoc(uid, 'investments', id))

  onProgress?.('Removing months not in the backup…')
  for (const mid of await listIds(userCollection(uid, 'months'))) {
    const keepExpenses = ids.months.has(mid) ? (ids.dailyExpenses.get(mid) ?? new Set()) : null
    for (const eid of await listIds(userCollection(uid, 'months', mid, 'dailyExpenses'))) {
      if (!keepExpenses || !keepExpenses.has(eid)) await b.delete(userDoc(uid, 'months', mid, 'dailyExpenses', eid))
    }
    if (!keepExpenses) await b.delete(userDoc(uid, 'months', mid))
  }

  onProgress?.('Removing plan history not in the backup…')
  for (const type of PLAN_TYPES) {
    for (const vid of await listIds(userCollection(uid, 'plans', type, 'versions'))) if (!ids.planVersions[type].has(vid)) await b.delete(userDoc(uid, 'plans', type, 'versions', vid))
    if (!ids.plansPointer.has(type)) await b.delete(userDoc(uid, 'plans', type))
  }
  for (const vid of await listIds(userCollection(uid, 'investmentPlan', 'plan', 'versions'))) if (!ids.invPlanVersions.has(vid)) await b.delete(userDoc(uid, 'investmentPlan', 'plan', 'versions', vid))
  if (!ids.invPlanPointer) await b.delete(userDoc(uid, 'investmentPlan', 'plan'))

  return b.commit()
}

/**
 * Restore a backup's `data` section into users/{uid}. Original ids/paths are
 * preserved so cross-references (flow→accountId, holdings→fundId, pointers→
 * versionId) stay intact.
 *   - 'merge'   : upsert every record by id; records not in the backup are kept.
 *   - 'replace' : write the backup, THEN delete only records not in it — so the
 *                 result is an exact mirror with no destructive intermediate
 *                 state (a failure leaves old+new data, never an empty account).
 * @param {string} uid
 * @param {object} data the (serialized) data section from the envelope
 * @param {{mode?: 'merge'|'replace', onProgress?: (msg:string)=>void}} [opts]
 */
export async function restoreUserData(uid, data, { mode = 'merge', onProgress } = {}) {
  const d = deserialize(data) ?? {}
  // Validate every path segment up front — throws before any write/delete, so a
  // corrupt backup can never leave the account half-wiped.
  const { writes, ids } = buildWriteOps(uid, d)

  const b = createBatcher()
  onProgress?.(mode === 'replace' ? 'Writing backup…' : 'Merging backup…')
  // Settings live on the identity doc: replace fully mirrors the backup; merge
  // keeps any fields this app version doesn't know about.
  if (d.settings) await b.set(userDocRef(uid), d.settings, mode === 'replace' ? {} : { merge: true })
  for (const w of writes) await b.set(w.ref, w.data)
  const written = await b.commit()

  let pruned = 0
  if (mode === 'replace') pruned = await pruneStale(uid, ids, onProgress)

  onProgress?.('')
  return { written, pruned }
}
