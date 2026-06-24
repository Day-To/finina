<script setup>
definePageMeta({
  unauthenticatedOnly: true,
  layout: false,
})

const auth = useAuthStore()
const route = useRoute()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

function messageFor(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    default:
      return 'Unable to sign in. Please try again.'
  }
}

function safeRedirect() {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') ? r : '/'
}

async function onSubmit() {
  if (loading.value) return
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    await navigateTo(safeRedirect())
  }
  catch (e) {
    error.value = messageFor(e?.code)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-svh items-center justify-center bg-background p-4">
    <UiCard class="w-full max-w-sm">
      <UiCardHeader>
        <UiCardTitle>Sign in</UiCardTitle>
        <UiCardDescription>Enter your credentials to access your account.</UiCardDescription>
      </UiCardHeader>

      <form @submit.prevent="onSubmit">
        <UiCardContent class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <UiLabel for="email">Email</UiLabel>
            <UiInput
              id="email"
              v-model="email"
              type="email"
              placeholder="you@example.com"
              autocomplete="email"
              required
              :disabled="loading"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <UiLabel for="password">Password</UiLabel>
            <UiInput
              id="password"
              v-model="password"
              type="password"
              placeholder="••••••••"
              autocomplete="current-password"
              required
              :disabled="loading"
            />
          </div>

          <p v-if="error" class="text-sm text-destructive" role="alert">
            {{ error }}
          </p>
        </UiCardContent>

        <UiCardFooter class="mt-4">
          <UiButton type="submit" class="w-full" :disabled="loading">
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </UiButton>
        </UiCardFooter>
      </form>
    </UiCard>
  </div>
</template>
