import type { Suit } from '../core/types';

/** Mirrors Pi contract: POST /api/ai/bot-move */
export interface AiBotMoveRequestBody {
  hand: string[]
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

/** POST /api/ai/save-game — aligns with roadmap; Pi may accept camelCase or map fields */
export interface AiSaveGameBody {
  gameId: string
  roundNumber: number
  players: string[]
  team_1_score: number
  team_2_score: number
  winner_team: 0 | 1
  trump_suit: string
  tricks: Array<{ cards: string[]; winnerIndex: number }>
}

const DEFAULT_TIMEOUT_MS = 12_000

export function getAiApiBase(): string {
  const u = import.meta.env.VITE_API_URL?.trim()
  return u ?? ''
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
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
  const base = getAiApiBase()
  if (!base) throw new Error('VITE_API_URL is not set')

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const res = await fetchWithTimeout(
    joinUrl(base, '/api/ai/bot-move'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    timeoutMs
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI bot-move HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  }

  const data = (await res.json()) as AiBotMoveResponseBody
  if (!data?.card || typeof data.card !== 'string') {
    throw new Error('AI response missing card')
  }
  const card = data.card.trim().replace(/\s+/g, '_').toUpperCase()
  return { ...data, card }
}

export async function saveGameToAiBackend(body: AiSaveGameBody): Promise<void> {
  const base = getAiApiBase()
  if (!base) return

  const res = await fetchWithTimeout(
    joinUrl(base, '/api/ai/save-game'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    DEFAULT_TIMEOUT_MS
  )

  if (!res.ok) {
    console.warn('[aiApi] save-game failed', res.status, await res.text().catch(() => ''))
  }
}
