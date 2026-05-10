import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

function normalizeBase(raw: string | undefined): string {
  const b = (raw || '/').trim()
  if (b === '' || b === '/') return '/'
  const withSlash = b.startsWith('/') ? b : `/${b}`
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`
}

function proxyInfoPlugin(
  proxyTarget: string,
  proxyPrefix: string,
  localProxy: string | undefined
): Plugin {
  return {
    name: 'belka-ai-proxy-info',
    configureServer() {
      if (proxyTarget) {
        console.info(
          `\n  [belka] Dev proxy:  http://localhost:<port>${proxyPrefix}/*  →  ${proxyTarget}${proxyPrefix}/*\n`
        )
      } else if (localProxy === '1') {
        console.warn(
          '\n  [belka] VITE_LOCAL_PROXY=1, но VITE_DEV_PROXY_TARGET пуст — proxy не поднят. Проверь .env.local и перезапусти dev.\n'
        )
      }
    },
  }
}

/** Первый сегмент пути: /api/ai/x → /api */
function defaultProxyPrefixFromBotPath(botPath: string): string {
  const parts = botPath.split('/').filter(Boolean)
  if (parts.length === 0) return '/api'
  return `/${parts[0]}`
}

// GitHub Actions sets VITE_BASE_PATH=/<repo>/. Local: VITE_BASE_PATH=/ in .env.local
export default defineConfig(({ mode }) => {
  // Только VITE_* из .env / .env.local (пустой префикс в части версий Vite даёт пустой объект)
  const env = loadEnv(mode, process.cwd(), 'VITE')
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim().replace(/\/$/, '') || ''

  const botPath =
    env.VITE_AI_BOT_MOVE_PATH?.trim().replace(/\/+$/, '') || '/api/ai/bot-move'
  const botPathAbs = botPath.startsWith('/') ? botPath : `/${botPath}`
  const proxyPrefixRaw =
    env.VITE_DEV_PROXY_PREFIX?.trim() || defaultProxyPrefixFromBotPath(botPathAbs)
  const proxyPrefix = proxyPrefixRaw.startsWith('/') ? proxyPrefixRaw : `/${proxyPrefixRaw}`

  const plugins = [react(), proxyInfoPlugin(proxyTarget, proxyPrefix, env.VITE_LOCAL_PROXY)]

  return {
    plugins,
    base: normalizeBase(env.VITE_BASE_PATH),
    ...(proxyTarget
      ? {
          server: {
            proxy: {
              [proxyPrefix]: {
                target: proxyTarget,
                changeOrigin: true,
                secure: true,
              },
            },
          },
        }
      : {}),
  }
})
