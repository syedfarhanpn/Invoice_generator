import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Pure logic only. Nothing here touches the database or the network, so
    // `npm test` is safe to run anywhere, including CI without secrets.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
})
