<script setup>
import { computed } from 'vue'
import faviconUrl from '@/assets/f.png'

const { isDark } = useTheme()
const toasterTheme = computed(() => (isDark.value ? 'dark' : 'light'))

useHead({
  link: [{ rel: 'icon', type: 'image/png', href: faviconUrl }],
})
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <UiToaster :theme="toasterTheme" rich-colors close-button position="top-right" />
  </div>
</template>
