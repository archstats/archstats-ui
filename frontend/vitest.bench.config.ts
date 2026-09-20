import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// The benches are separate from the suite on purpose: they need a real scan
// on disk, they take seconds rather than milliseconds, and their job is to
// print numbers rather than to pass. `npm test` must stay fast and hermetic.
export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      wailsjs: fileURLToPath(new URL("./wailsjs", import.meta.url)),
    },
  },
  test: {
    include: ["bench/**/*.bench.ts"],
    environment: "node",
    testTimeout: 120_000,
    silent: false,
  },
});
