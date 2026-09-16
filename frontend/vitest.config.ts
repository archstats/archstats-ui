import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone vitest config (tests are pure logic + store tests with mocked
// Wails bindings — no Nuxt runtime needed).
export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      wailsjs: fileURLToPath(new URL("./wailsjs", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
