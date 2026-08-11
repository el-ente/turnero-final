import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors the "shared" -> "../shared/src" path mapping in tsconfig.app.json.
      // Without this, Vite resolves "shared" via node_modules -> package.json
      // "main" -> the tsc-compiled lib/index.js, which is CommonJS: fine for
      // type-only imports (erased at compile time) but browser ESM import
      // can't reliably pull named *value* exports back out of it.
      shared: fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },
})
