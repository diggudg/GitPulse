import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// Standalone config (not the Vite app config) so tests don't pull in the
// Tailwind/React plugins. Mirrors the "@" path alias.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
