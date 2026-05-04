import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// For GitHub Pages use env VITE_BASE_PATH=/repo-name/ (see .github/workflows)
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/belka/',
})
