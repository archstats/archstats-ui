export default defineNuxtConfig({
  ssr: false,
  devtools: {
    enabled: true,

    timeline: {
      enabled: true
    }
  },

  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss'
  ],
  nitro: {
    esbuild: {
      options: {
        target: 'esnext'
      }
    }
  }
})