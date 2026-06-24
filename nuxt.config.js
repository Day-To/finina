import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  css: ['~/assets/css/tailwind.css'],
  compatibilityDate: '2025-01-01',
  vite: {
    plugins: [tailwindcss()],
  },
  ssr: false,
  modules: ['shadcn-nuxt', '@pinia/nuxt'],
  // Feature components auto-import by their base name (no path prefix). The
  // shadcn `ui` dir is registered separately by shadcn-nuxt with the `Ui` prefix.
  components: [
    { path: '~/components/shared', pathPrefix: false },
  ],
  app: {
    head: {
      title: 'Finina',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
    },
  },
  shadcn: {
    /**
     * Prefix for all the imported component.
     * @default "Ui"
     */
    prefix: 'Ui',
    /**
     * Directory that the component lives in.
     * Will respect the Nuxt aliases.
     * @link https://nuxt.com/docs/api/nuxt-config#alias
     * @default "@/components/ui"
     */
    componentDir: '@/components/ui',
  },
})
