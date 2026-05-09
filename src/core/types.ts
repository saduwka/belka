export type Suit = 'CLUBS' | 'SPADES' | 'HEARTS' | 'DIAMONDS';
export type Rank = '6' | '7' | '8' | '9' | '10' | 'JACK' | 'QUEEN' | 'KING' | 'ACE';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string; // e.g. "CLUBS_JACK"
}

export const SUITS: Suit[] = ['CLUBS', 'SPADES', 'HEARTS', 'DIAMONDS'];
export const RANKS: Rank[] = ['7', '8', '9', 'JACK', 'QUEEN', 'KING', '10', 'ACE'];

export const CARD_POINTS: Record<Rank, number> = {
  '6': 0,
  '7': 0,
  '8': 0,
  '9': 0,
  '10': 10,
  'JACK': 2,
  'QUEEN': 3,
  'KING': 4,
  'ACE': 11,
};

// Permanent trumps (Jacks) in order of seniority
export const JACK_TRUMPS: Card[] = [
  { suit: 'CLUBS', rank: 'JACK', id: 'CLUBS_JACK' },
  { suit: 'SPADES', rank: 'JACK', id: 'SPADES_JACK' },
  { suit: 'HEARTS', rank: 'JACK', id: 'HEARTS_JACK' },
  { suit: 'DIAMONDS', rank: 'JACK', id: 'DIAMONDS_JACK' },
];

export type GamePhase = 'LOBBY' | 'PLAYING' | 'ROUND_OVER' | 'GAME_OVER';

export interface Player {
  id: number;
  name: string;
  hand: Card[];
  team: 0 | 1;
  isBot?: boolean;
}

/** One completed trick — used when POSTing `/api/ai/save-game` */
export interface RoundTrickRecord {
  cards: Card[];
  winnerIndex: number;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  trumpSuit: Suit | null;
  trumpSetterTeam: number | null;
  table: Card[]; // Cards played in the current trick
  scores: [number, number]; // Points in the current round
  eyes: [number, number]; // "Glaza" (6's)
  phase: GamePhase;
  firstPlayerInTrick: number;
  isFirstRound: boolean;
  lastTrickWinnerIndex: number | null;
  playedSuits: Suit[];
  trumpMapping?: Record<number, Suit>;
  eggsCount: number;
  votingState?: {
    team: number;
    votes: Record<number, 'TAKE' | 'HANG'>;
    result?: 'TAKE' | 'HANG';
  };
  readyPlayers: Record<string | number, boolean>;
  roundEndTime?: number;
  spectators: { id: string, name: string }[];
  creatorName?: string;
  lastError?: { message: string; id: number } | null;
  roundTricks: RoundTrickRecord[];
  /** Increments each time a round resolves to ROUND_OVER (for backend analytics). */
  matchRoundNumber: number;
  learningGameId: string;
}
