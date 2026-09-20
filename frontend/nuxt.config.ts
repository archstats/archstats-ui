import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  // Desktop app in a Wails webview: pure SPA, no server rendering.
  ssr: false,

  // The Vue app lives under src/ (pages, components, layouts, middleware,
  // plugins, assets); public/ stays at the frontend root.
  srcDir: "src/",
  dir: {
    public: fileURLToPath(new URL("./public", import.meta.url)),
  },

  router: {
    options: {
      // Hash routing is the safe choice inside a webview-served SPA.
      hashMode: true,
    },
  },

  alias: {
    // Wails-generated Go bindings (frontend/wailsjs).
    wailsjs: fileURLToPath(new URL("./wailsjs", import.meta.url)),
  },

  // Devtools' bridge misbehaves inside the Wails webview (null 'send' errors
  // during navigation) — keep it off for the desktop app.
  devtools: {
    enabled: false,
  },

  modules: ["@pinia/nuxt", "@nuxtjs/tailwindcss"],

  // Our own entry so the shell's base-layer rules (selection, scrollbars,
  // progress) ship alongside Tailwind's layers.
  tailwindcss: {
    cssPath: "~/assets/index.css",
  },

  experimental: {
    appManifest: false,
    // Default 'automatic' reloads the whole app on a lazy-chunk load error,
    // which wipes all in-memory state (open scan, stores). Never do that in
    // a stateful desktop SPA.
    emitRouteChunkError: false,
  },

  nitro: {
    esbuild: {
      options: {
        target: "esnext",
      },
    },
    // Only the `generate` script (NUXT_DIST_OUTPUT=1) writes to dist/ — the
    // Go side embeds it via //go:embed all:frontend/dist. `nuxt dev` must
    // never own dist, because nitro cleans its output dir on startup and an
    // empty dist breaks the Go embed compile.
    output: process.env.NUXT_DIST_OUTPUT
      ? { publicDir: fileURLToPath(new URL("./dist", import.meta.url)) }
      : undefined,
  },

  compatibilityDate: "2024-12-09",
});
