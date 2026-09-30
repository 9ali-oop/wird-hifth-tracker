import { readFileSync } from "node:fs"
import { defineConfig } from "vite"

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))

// Relative base so the same build works on GitHub Pages (a sub-path) and inside the Android app.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2020" },
  define: { __APP_VERSION__: JSON.stringify(version) },
})
