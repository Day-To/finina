import { defineStore } from 'pinia'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // Plain, serializable user info (set from the Firebase auth listener).
    user: null,
    // Becomes true once Firebase has reported the auth state at least once.
    ready: false,
  }),

  getters: {
    isAuthenticated: state => !!state.user,
  },

  actions: {
    setUser(user) {
      this.user = user
    },

    setReady(value = true) {
      this.ready = value
    },

    async login(email, password) {
      const { $firebaseAuth } = useNuxtApp()
      return signInWithEmailAndPassword($firebaseAuth, email, password)
    },

    async logout() {
      const { $firebaseAuth } = useNuxtApp()
      await signOut($firebaseAuth)
    },
  },
})
