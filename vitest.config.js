import { defineConfig } from 'vitest/config'

// Domain layer is the priority to test (pure JS, no Firebase/Vue) — §13.
export default defineConfig({
  test: {
    include: ['app/domain/**/*.test.js', 'app/composables/**/*.test.js'],
    environment: 'node',
  },
})
