// Theme management (§8): light / dark / system, persisted. Wraps VueUse's
// useColorMode (already installed) — it toggles the `.dark` class on <html> and
// persists the preference to localStorage. No extra Nuxt module required.
import { computed } from 'vue'
import { useColorMode } from '@vueuse/core'

export function useTheme() {
  // store: the user's selection ('light' | 'dark' | 'auto')
  // state: the resolved mode ('light' | 'dark') after applying system preference
  const mode = useColorMode({
    selector: 'html',
    attribute: 'class',
    storageKey: 'finina-theme',
    emitAuto: true,
  })

  const preference = computed({
    get: () => mode.store.value,
    set: (v) => { mode.store.value = v },
  })

  const isDark = computed(() => mode.value === 'dark')

  function setTheme(value) {
    mode.store.value = value
  }

  function toggle() {
    mode.store.value = isDark.value ? 'light' : 'dark'
  }

  return { mode, preference, isDark, setTheme, toggle }
}
