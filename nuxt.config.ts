export default defineNuxtConfig({
  devtools: { enabled: true },

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
