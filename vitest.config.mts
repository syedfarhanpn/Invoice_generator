import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Pure logic only. Nothing here touches the database or the network, so
    // `npm test` is safe to run anywhere, including CI without secrets.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // fileURLToPath, not URL.pathname: on Windows the latter yields
    // "/C:/Users/...", which is not a filesystem path, so the alias silently
    // never applies and an "@/" import fails as an unresolved package.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
})
