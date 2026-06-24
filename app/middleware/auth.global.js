// Global access control driven by page meta:
//   public: true             -> anyone (auth state ignored)
//   unauthenticatedOnly: true -> only signed-out users (signed-in -> '/')
//   (no meta)                -> only signed-in users (signed-out -> '/login')
export default defineNuxtRouteMiddleware(async (to) => {
  // Public pages are always accessible.
  if (to.meta.public) return

  // Firebase auth is a client-only concern; let the client decide.
  if (import.meta.server) return

  const nuxtApp = useNuxtApp()
  // Wait until Firebase has reported the auth state at least once so we
  // never redirect based on a not-yet-known (null) user.
  await nuxtApp.$authReady?.()

  const auth = useAuthStore()

  if (to.meta.unauthenticatedOnly) {
    if (auth.isAuthenticated) return navigateTo('/')
    return
  }

  // Default: authentication required.
  if (!auth.isAuthenticated) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
