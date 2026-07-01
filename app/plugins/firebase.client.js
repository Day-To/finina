import { initializeApp, getApps } from 'firebase/app'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: 'AIzaSyA0JeQSbV7jQcmiCTR4_TfOyMvdgqne5Bk',
  authDomain: 'dayto-fb72f.firebaseapp.com',
  projectId: 'dayto-fb72f',
  storageBucket: 'dayto-fb72f.firebasestorage.app',
  messagingSenderId: '766964161984',
  appId: '1:766964161984:web:7faf69fce753a43c357c25',
}

export default defineNuxtPlugin((nuxtApp) => {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = getFirestore(app)
  const storage = getStorage(app) // bucket comes from firebaseConfig.storageBucket

  // User info lives in the Pinia store (stores/auth.js).
  const authStore = useAuthStore(nuxtApp.$pinia)

  // Resolves once Firebase has determined the auth state for the first time.
  // Route middleware awaits this so it never redirects before auth is known.
  let resolveReady
  const authReady = new Promise((resolve) => { resolveReady = resolve })

  onAuthStateChanged(auth, (fbUser) => {
    authStore.setUser(
      fbUser
        ? {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            photoURL: fbUser.photoURL,
          }
        : null,
    )
    if (!authStore.ready) {
      authStore.setReady(true)
      resolveReady()
    }
  })

  return {
    provide: {
      firebaseAuth: auth,
      db,
      storage,
      authReady: () => authReady,
    },
  }
})
