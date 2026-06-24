// Firebase Admin (server-only) — privileged Firestore access for the expense API.
// Credentials come from env (never bundled): set ONE of
//   FIREBASE_SERVICE_ACCOUNT  = the service-account JSON (raw or base64)
//   FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
//   GOOGLE_APPLICATION_CREDENTIALS = path to the service-account file
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

let _db = null

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

/** Lazily initialize the Admin app and return a Firestore handle. */
export function adminDb() {
  if (_db) return _db
  if (!getApps().length) {
    const sa = serviceAccountFromEnv()
    if (sa) initializeApp({ credential: cert(sa) })
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) initializeApp({ credential: applicationDefault() })
    else throw new Error('No Firebase credentials configured. Set FIREBASE_SERVICE_ACCOUNT, or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS.')
  }
  _db = getFirestore()
  return _db
}
