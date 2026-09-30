import { defineConfig } from "vite"

// Relative base so the same build works on GitHub Pages (a sub-path) and inside the Android app.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2020" },
})
