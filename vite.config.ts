import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeBase(raw: string | undefined): string {
  const b = (raw || '/').trim()
  if (b === '' || b === '/') return '/'
  const withSlash = b.startsWith('/') ? b : `/${b}`
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`
}

// GitHub Actions sets VITE_BASE_PATH=/<repo>/. Local: VITE_BASE_PATH=/ in .env.local
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    base: normalizeBase(env.VITE_BASE_PATH),
  }
})
