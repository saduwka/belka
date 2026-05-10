/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Base path for GitHub Pages e.g. /belka/ */
  readonly VITE_BASE_PATH: string;
  /** Dev only: `1` + VITE_DEV_PROXY_TARGET → запросы на /api через Vite proxy (без CORS к ngrok). */
  readonly VITE_LOCAL_PROXY: string;
  /** Dev only: URL туннеля/Pi для proxy (без trailing slash). */
  readonly VITE_DEV_PROXY_TARGET: string;
  /** `1` — подробные логи [BelkaAI] и в production. */
  readonly VITE_AI_DEBUG: string;
  /** Путь POST хода бота от корня хоста, напр. /api/ai/bot-move или /v1/bot-move */
  readonly VITE_AI_BOT_MOVE_PATH: string;
  /** Путь POST сохранения раздачи */
  readonly VITE_AI_SAVE_GAME_PATH: string;
  /** Только dev: общий префикс для Vite proxy (если пусто — первый сегмент VITE_AI_BOT_MOVE_PATH) */
  readonly VITE_DEV_PROXY_PREFIX: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
