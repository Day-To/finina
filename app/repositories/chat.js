// AI copilot chat repository (§6). Threads + messages under
//   users/{uid}/chatThreads/{tid}            → { id, title, createdAt, updatedAt }
//   users/{uid}/chatThreads/{tid}/messages   → { id, role, content, status, seq, createdAt }
// Owner-only Firestore rules cover this subtree automatically. Messages are
// ordered by a client-set monotonic `seq` so a user/assistant pair never flips
// before serverTimestamp() resolves.
import { getDocs, setDoc, onSnapshot, query, orderBy, limit, serverTimestamp, writeBatch } from 'firebase/firestore'
import { userCollection, userDoc, makeConverter, db } from './base.js'
import { newId } from '~/domain/ids.js'
import { chatMessageSchema, chatThreadSchema } from '~/domain/schemas.js'

const threadConv = makeConverter(chatThreadSchema, (id, raw) => ({ ...raw, id: raw.id ?? id }))
const msgConv = makeConverter(chatMessageSchema, (id, raw) => ({ ...raw, id: raw.id ?? id }))

const threadsCol = (uid) => userCollection(uid, 'chatThreads').withConverter(threadConv)
const threadRef = (uid, tid) => userDoc(uid, 'chatThreads', tid).withConverter(threadConv)
const messagesCol = (uid, tid) => userCollection(uid, 'chatThreads', tid, 'messages').withConverter(msgConv)
const messageRef = (uid, tid, id) => userDoc(uid, 'chatThreads', tid, 'messages', id).withConverter(msgConv)

export const chatRepo = {
  /** Create a thread with a client UUID; returns its id. */
  async createThread(uid, title = '') {
    const id = newId()
    await setDoc(threadRef(uid, id), { id, title: String(title).slice(0, 60), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    return id
  },

  /** The most recently used thread id, or null if there are none. */
  async latestThreadId(uid) {
    const snap = await getDocs(query(threadsCol(uid), orderBy('updatedAt', 'desc'), limit(1)))
    return snap.docs[0]?.id ?? null
  },

  /** Live list of threads, most-recently-updated first. @returns {() => void} unsubscribe */
  subscribeThreads(uid, cb, onErr) {
    return onSnapshot(query(threadsCol(uid), orderBy('updatedAt', 'desc')), (snap) => {
      cb(snap.docs.map((d) => d.data()))
    }, (e) => onErr?.(e))
  },

  /** Bump updatedAt (and optionally the title). */
  async touchThread(uid, tid, patch = {}) {
    await setDoc(threadRef(uid, tid), { updatedAt: serverTimestamp(), ...patch }, { merge: true })
  },

  /** Live messages for a thread, oldest first. @returns {() => void} unsubscribe */
  subscribeMessages(uid, tid, cb, onErr) {
    return onSnapshot(query(messagesCol(uid, tid), orderBy('seq', 'asc')), (snap) => {
      cb(snap.docs.map((d) => d.data()))
    }, (e) => onErr?.(e))
  },

  /** Append a message with a client UUID + caller-provided monotonic seq. */
  async addMessage(uid, tid, { role, content, seq, status = 'complete' }) {
    const id = newId()
    const msg = { id, role, content: String(content ?? ''), seq: Number(seq) || 0, status }
    await setDoc(messageRef(uid, tid, id), { ...msg, createdAt: serverTimestamp() })
    return msg
  },

  /**
   * Delete a thread AND its messages subcollection in one atomic batch
   * (Firestore doesn't cascade subcollection deletes — mirrors monthsRepo.remove).
   * Threads stay small (well under the 500-op batch limit).
   */
  async deleteThread(uid, tid) {
    const batch = writeBatch(db())
    const msgs = await getDocs(messagesCol(uid, tid))
    msgs.forEach((d) => batch.delete(d.ref))
    batch.delete(threadRef(uid, tid))
    await batch.commit()
  },
}
