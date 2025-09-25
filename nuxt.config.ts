export default defineNuxtConfig({
  ssr: true,
  devtools: {
    enabled: true,

    timeline: {
      enabled: true
    }
  },

  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss',
    '@nuxt/image',
  ],

  nitro: {
    esbuild: {
      options: {
        target: 'esnext'
      }
    }
  },

  compatibilityDate: '2024-12-09'
})