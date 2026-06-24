import { d as defineEventHandler, r as readBody, s as setResponseStatus, g as getHeader, a as getQuery, c as createError } from '../../nitro/nitro.mjs';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:url';

let _db = null;
function serviceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    try {
      const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
      return JSON.parse(text);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON (or base64-encoded JSON).");
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
  }
  return null;
}
function adminDb() {
  if (_db) return _db;
  if (!getApps().length) {
    const sa = serviceAccountFromEnv();
    if (sa) initializeApp({ credential: cert(sa) });
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) initializeApp({ credential: applicationDefault() });
    else throw new Error("No Firebase credentials configured. Set FIREBASE_SERVICE_ACCOUNT, or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS.");
  }
  _db = getFirestore();
  return _db;
}

const DEFAULT_DIGITS = 2;
const _digits = /* @__PURE__ */ new Map();
function decimalDigits(code) {
  if (!code) return DEFAULT_DIGITS;
  if (_digits.has(code)) return _digits.get(code);
  let d = DEFAULT_DIGITS;
  try {
    d = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
  } catch {
    d = DEFAULT_DIGITS;
  }
  _digits.set(code, d);
  return d;
}
const toMinor = (major, code) => Math.round(Number(major) * 10 ** decimalDigits(code));
function todayInTz(tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
  } catch {
    return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  }
}
function resolveDate(input, tz) {
  if (input == null || input === "") return todayInTz(tz);
  const s = String(input).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) throw new Error(`Could not parse date: "${input}". Use YYYY-MM-DD or DD/MM/YYYY.`);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
async function resolveCurrency(db, uid, monthId) {
  var _a, _b;
  const monthSnap = await db.doc(`users/${uid}/months/${monthId}`).get();
  if (monthSnap.exists && ((_a = monthSnap.data()) == null ? void 0 : _a.currency)) return monthSnap.data().currency;
  const userSnap = await db.doc(`users/${uid}`).get();
  if (userSnap.exists && ((_b = userSnap.data()) == null ? void 0 : _b.currency)) return userSnap.data().currency;
  return process.env.EXPENSE_API_DEFAULT_CURRENCY || "INR";
}
async function addExpense({ item, amount, note, date } = {}) {
  if (typeof item !== "string" || !item.trim()) throw new Error('"item" is required and must be a non-empty string.');
  const amt = typeof amount === "string" && amount.trim() !== "" ? Number(amount) : amount;
  if (typeof amt !== "number" || !Number.isFinite(amt)) throw new Error('"amount" is required and must be a finite number.');
  if (amt <= 0) throw new Error('"amount" must be greater than zero.');
  const uid = process.env.EXPENSE_API_UID;
  if (!uid) throw new Error("Server is missing EXPENSE_API_UID (the owner account to write to).");
  const iso = resolveDate(date, process.env.EXPENSE_API_TZ || "Asia/Kolkata");
  const monthId = iso.slice(0, 7);
  const db = adminDb();
  const currency = await resolveCurrency(db, uid, monthId);
  const minor = toMinor(amt, currency);
  const id = randomUUID();
  await db.doc(`users/${uid}/months/${monthId}/dailyExpenses/${id}`).set({
    id,
    date: iso,
    item: item.trim(),
    amount: minor,
    note: note == null ? "" : String(note),
    category: null,
    currency,
    createdAt: FieldValue.serverTimestamp()
  });
  return { month: monthId, id, date: iso, item: item.trim(), amount: minor, currency };
}

function assertAuthorized(event) {
  const required = process.env.EXPENSE_API_TOKEN;
  if (!required) return;
  const bearer = (getHeader(event, "authorization") || "").replace(/^Bearer\s+/i, "");
  const provided = getHeader(event, "x-api-token") || bearer || getQuery(event).token;
  if (provided !== required) throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
}
const expenses_post = defineEventHandler(async (event) => {
  try {
    assertAuthorized(event);
    let body = await readBody(event);
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        throw new Error("Invalid JSON body.");
      }
    }
    if (!body || typeof body !== "object") throw new Error("Empty POST body. Send JSON { item, amount, note?, date? }.");
    const result = await addExpense(body);
    return { ok: true, ...result };
  } catch (err) {
    setResponseStatus(event, (err == null ? void 0 : err.statusCode) || 400);
    return { ok: false, error: String((err == null ? void 0 : err.statusMessage) || (err == null ? void 0 : err.message) || err) };
  }
});

export { expenses_post as default };
//# sourceMappingURL=expenses.post.mjs.map
