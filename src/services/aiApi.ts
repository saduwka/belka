import type { Suit } from '../core/types';

/**
 * POST bot-move. Бэкенд должен заставить модель вернуть ровно один id из `legalMoves`
 * (подмножество `hand`), иначе клиент отклонит ход.
 */
export interface AiBotMoveRequestBody {
  /** Индекс игрока, который сейчас ходит (0–3). */
  playerIndex: number
  /** Индекс того, кто положил первую карту в текущую взятку (ведущий круга). */
  trickLeaderIndex: number
  hand: string[]
  /** Разрешённые ходы по правилам клиента — модель должна выбрать только отсюда. */
  legalMoves: string[]
  table: string[]
  trumpSuit: string
  playedSuits: Suit[]
  scores: [number, number]
  eyes: [number, number]
}

export interface AiBotMoveResponseBody {
  card: string
  reasoning?: string
}

/** POST /api/ai/save-game — дубли полей (scores, snake_case) для бэков, которые читают не тот ключ. */
export interface AiSaveGameBody {
  gameId: string
  roundNumber: number
  /** Имена по порядку мест 0–3 */
  players: string[]
  /** Те же игроки с командами — чтобы бэк не делал players[0].team от undefined */
  playerSeats: Array<{ name: string; team: 0 | 1; is_bot: boolean }>
  team_1_score: number
  team_2_score: number
  winner_team: 0 | 1
  trump_suit: string
  eyes: [number, number]
  tricks: Array<{ cards: string[]; winnerIndex: number }>
}

function wireSaveGamePayload(body: AiSaveGameBody): Record<string, unknown> {
  const tricks = body.tricks.map((t) => ({
    cards: t.cards,
    winnerIndex: t.winnerIndex,
    winner_index: t.winnerIndex,
  }))

  return {
    gameId: body.gameId,
    game_id: body.gameId,
    roundNumber: body.roundNumber,
    round_number: body.roundNumber,
    players: body.players,
    player_names: body.players,
    player_seats: body.playerSeats,
    playerSeats: body.playerSeats,
    team_1_score: body.team_1_score,
    team_2_score: body.team_2_score,
    scores: [body.team_1_score, body.team_2_score],
    winner_team: body.winner_team,
    trump_suit: body.trump_suit,
    eyes: body.eyes,
    tricks,
  }
}

const DEFAULT_TIMEOUT_MS = 12_000
const LOG = '[BelkaAI]'

function aiLog(...args: unknown[]) {
  if (import.meta.env.DEV || import.meta.env.VITE_AI_DEBUG === '1') {
    console.log(LOG, ...args)
  }
}

function aiWarn(...args: unknown[]) {
  console.warn(LOG, ...args)
}

/** Есть ли куда слать запросы: явный URL или dev-прокси на `/api`. */
export function isAiApiConfigured(): boolean {
  if (import.meta.env.VITE_API_URL?.trim()) return true
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PROXY === '1') return true
  return false
}

/**
 * База URL для fetch к AI-бэку.
 * - Прод / GitHub Pages: полный `VITE_API_URL` (нужен CORS на бэке под `https://<user>.github.io`).
 * - Локально: при `VITE_LOCAL_PROXY=1` и `VITE_DEV_PROXY_TARGET` в vite — пустая строка → запросы на тот же origin,
 *   Vite проксирует `/api` → туннель (обход CORS в dev).
 */
export function getAiApiBase(): string {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PROXY === '1') {
    return ''
  }
  const u = import.meta.env.VITE_API_URL?.trim()
  return u ?? ''
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

function normalizeAbsPath(raw: string | undefined, fallback: string): string {
  const s = (raw?.trim() || fallback).replace(/\/+$/, '')
  return s.startsWith('/') ? s : `/${s}`
}

/** Путь от корня хоста, без базы (для прокси и прод). */
export function getAiBotMovePath(): string {
  return normalizeAbsPath(import.meta.env.VITE_AI_BOT_MOVE_PATH, '/api/ai/bot-move')
}

export function getAiSaveGamePath(): string {
  return normalizeAbsPath(import.meta.env.VITE_AI_SAVE_GAME_PATH, '/api/ai/save-game')
}

/** POST без тела бэк обрабатывает сам (подбор игр и вызов Gemini). */
export function getAiAnalyzeGamesPath(): string {
  return normalizeAbsPath(import.meta.env.VITE_AI_ANALYZE_GAMES_PATH, '/api/ai/analyze-games')
}

/** Стриминг Gemini по 5 партиям; даём большой таймаут. */
const ANALYZE_GAMES_TIMEOUT_MS = 120_000

/** ngrok free: без заголовка браузерный fetch иногда получает HTML-заглушку вместо JSON. */
function apiHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...extra,
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

export async function fetchBotMove(
  body: AiBotMoveRequestBody,
  options?: { timeoutMs?: number }
): Promise<AiBotMoveResponseBody> {
  if (!isAiApiConfigured()) {
    aiWarn('fetchBotMove: бэк не настроен (нет VITE_API_URL и не включён VITE_LOCAL_PROXY=1 в dev)')
    throw new Error('AI backend not configured')
  }

  const base = getAiApiBase()
  const url = joinUrl(base, getAiBotMovePath())
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const botMovePayload = {
    ...body,
    player_index: body.playerIndex,
    trick_leader_index: body.trickLeaderIndex,
  }
  aiLog('POST', url, {
    playerIndex: body.playerIndex,
    trickLeaderIndex: body.trickLeaderIndex,
    hand: body.hand.length,
    legal: body.legalMoves.length,
    table: body.table.length,
    timeoutMs,
  })

  let res: Response
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(botMovePayload),
      },
      timeoutMs
    )
  } catch (e) {
    aiWarn('fetchBotMove: сеть/таймаут', e)
    throw e
  }

  aiLog('ответ', res.status, res.statusText)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    aiWarn('fetchBotMove HTTP error', res.status, text.slice(0, 300))
    throw new Error(`AI bot-move HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  }

  let data: AiBotMoveResponseBody
  try {
    data = (await res.json()) as AiBotMoveResponseBody
  } catch (e) {
    aiWarn('fetchBotMove: не JSON (часто HTML ngrok/CORS)', e)
    throw new Error('AI response is not JSON')
  }
  if (!data?.card || typeof data.card !== 'string') {
    aiWarn('fetchBotMove: в теле нет card', data)
    throw new Error('AI response missing card')
  }
  const card = data.card.trim().replace(/\s+/g, '_').toUpperCase()
  aiLog('card', card, data.reasoning?.slice(0, 80))
  return { ...data, card }
}

export async function saveGameToAiBackend(body: AiSaveGameBody): Promise<void> {
  if (!isAiApiConfigured()) return

  const base = getAiApiBase()
  const payload = wireSaveGamePayload(body)
  aiLog('save-game', {
    tricksLen: body.tricks.length,
    scores: payload.scores,
    playersLen: body.players.length,
  })
  const res = await fetchWithTimeout(
    joinUrl(base, getAiSaveGamePath()),
    {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload),
    },
    DEFAULT_TIMEOUT_MS
  )

  if (!res.ok) {
    console.warn('[aiApi] save-game failed', res.status, await res.text().catch(() => ''))
  }
}

/** Пустой POST — бэк анализирует необработанные сохранённые игры и обновляет player_profiles. */
export async function postAnalyzeGames(): Promise<void> {
  if (!isAiApiConfigured()) {
    aiWarn('postAnalyzeGames: бэк не настроен')
    throw new Error('AI backend not configured')
  }

  const base = getAiApiBase()
  const url = joinUrl(base, getAiAnalyzeGamesPath())
  aiLog('POST', url, '(analyze-games)')

  let res: Response
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({}),
      },
      ANALYZE_GAMES_TIMEOUT_MS
    )
  } catch (e) {
    aiWarn('postAnalyzeGames: сеть/таймаут', e)
    throw e
  }

  aiLog('analyze-games ответ', res.status, res.statusText)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    aiWarn('postAnalyzeGames HTTP error', res.status, text.slice(0, 300))
    throw new Error(`AI analyze-games HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  }
}
