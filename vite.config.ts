/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// GitHub Pages serves the site from /meydan/; locally it runs from the root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  build: { target: "es2022", outDir: "dist", chunkSizeWarningLimit: 900 },
  worker: { format: "es" },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
}));
