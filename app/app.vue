<script setup>
import { computed } from 'vue'

const { isDark } = useTheme()
const toasterTheme = computed(() => (isDark.value ? 'dark' : 'light'))
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <UiToaster :theme="toasterTheme" rich-colors close-button position="top-right" />
  </div>
</template>
