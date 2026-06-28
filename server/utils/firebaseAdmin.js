// Firebase Admin (server-only) — privileged Firestore access for the expense API.
// Credentials come from env (never bundled): set ONE of
//   FIREBASE_SERVICE_ACCOUNT  = the service-account JSON (raw or base64)
//   FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
//   GOOGLE_APPLICATION_CREDENTIALS = path to the service-account file
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

let _db = null
let _auth = null

function serviceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (raw) {
    try {
      const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
      return JSON.parse(text)
    }
    catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON (or base64-encoded JSON).')
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
  if (projectId && clientEmail && privateKey) {
    // Env vars often escape newlines; restore them for the PEM key.
    return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }
  }
  return null
}

/** Initialize the Admin app exactly once (idempotent). */
function ensureApp() {
  if (getApps().length) return
  const sa = serviceAccountFromEnv()
  if (sa) initializeApp({ credential: cert(sa) })
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) initializeApp({ credential: applicationDefault() })
  else throw new Error('No Firebase credentials configured. Set FIREBASE_SERVICE_ACCOUNT, or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS.')
}

/** Lazily initialize the Admin app and return a Firestore handle. */
export function adminDb() {
  if (_db) return _db
  ensureApp()
  _db = getFirestore()
  return _db
}

/**
 * Lazily initialize the Admin app and return an Auth handle. Used to verify the
 * caller's Firebase ID token server-side (the copilot endpoint) so `uid` comes
 * from a cryptographically-verified token, never from the request body.
 */
export function adminAuth() {
  if (_auth) return _auth
  ensureApp()
  _auth = getAuth()
  return _auth
}
