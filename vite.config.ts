import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static app: public/data/*.json is served in dev and copied into dist/ on build.
// base './' keeps asset and data URLs relative, so the build works under /dhde-madinah/ on GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
})
