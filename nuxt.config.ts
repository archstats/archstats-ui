export default defineNuxtConfig({
  ssr: false,
  devtools: {
    enabled: true,

    timeline: {
      enabled: true
    }
  },
  runtimeConfig: {
    public: {
      gtagId: 'G-R0SYCE15ZY',
    }
  },

  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss',
    '@nuxt/image',
    '@nuxtjs/google-analytics'
  ],
  nitro: {
    esbuild: {
      options: {
        target: 'esnext'
      }
    }
  }
})