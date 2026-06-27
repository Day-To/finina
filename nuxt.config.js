import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  css: ['~/assets/css/tailwind.css'],
  compatibilityDate: '2025-01-01',
  vite: {
    plugins: [tailwindcss()],
  },
  ssr: false,
  modules: ['shadcn-nuxt', '@pinia/nuxt', '@vite-pwa/nuxt'],
  // Feature components auto-import by their base name (no path prefix). The
  // shadcn `ui` dir is registered separately by shadcn-nuxt with the `Ui` prefix.
  components: [
    { path: '~/components/shared', pathPrefix: false },
  ],
  app: {
    head: {
      title: 'Finina',
      meta: [
        // `maximum-scale=1` stops iOS Safari from auto-zooming when an input
        // (font-size < 16px) is focused; the compact field sizes stay intact.
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Plan your month, track daily spending, and grow your investments.' },
        // Standalone install + iOS home-screen behaviour.
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Finina' },
        // Address/status-bar tint, adapting to the active theme.
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#0a0a0a', media: '(prefers-color-scheme: dark)' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      ],
    },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Finina — Personal Finance',
      short_name: 'Finina',
      description: 'Plan your month, track daily spending, and grow your investments.',
      lang: 'en',
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      icons: [
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // Precache the built app shell; SPA navigations fall back to the index.
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      navigateFallback: '/',
      // Never hijack API calls or Firebase's auth helper iframe/handler.
      navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
    },
    client: {
      installPrompt: true,
    },
    devOptions: {
      // Let the PWA register during `nuxt dev` so it can be tested without a build.
      enabled: true,
      type: 'module',
      navigateFallback: '/',
      suppressWarnings: true,
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
