import { Card, Suit, Rank, SUITS, RANKS, JACK_TRUMPS } from './types';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        id: `${suit}_${rank}`,
      });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** У кого в руке валет треф — задаёт козырную мапу на игроков. */
export function findJackHolderIndex(hands: Card[][]): number {
  let idx = 0;
  hands.forEach((hand, i) => {
    if (hand.some((c) => c.id === 'CLUBS_JACK')) idx = i;
  });
  return idx;
}

/** Первый ход в раунде: игрок слева от раздающего (порядок за столом 0→1→2→3). */
export function getFirstPlayerIndexLeftOfDealer(dealerIndex: number): number {
  return (dealerIndex + 1) % 4;
}

export function dealCards(deck: Card[]): Card[][] {
  const hands: Card[][] = [[], [], [], []];
  let cardIndex = 0;
  for (let round = 0; round < 4; round++) {
    for (let player = 0; player < 4; player++) {
      hands[player].push(deck[cardIndex++]);
      hands[player].push(deck[cardIndex++]);
    }
  }
  return hands;
}

export function isTrump(card: Card, trumpSuit: Suit | null): boolean {
  if (card.rank === 'JACK') return true;
  return card.suit === trumpSuit;
}

export function getCardPower(card: Card, leadSuit: Suit, trumpSuit: Suit | null): number {
  if (card.rank === 'JACK') {
    const jackIndex = JACK_TRUMPS.findIndex(j => j.suit === card.suit);
    return 1000 - jackIndex;
  }
  if (trumpSuit && card.suit === trumpSuit) {
    const rankPower = RANKS.indexOf(card.rank);
    return 500 + rankPower;
  }
  if (card.suit === leadSuit) {
    const rankPower = RANKS.indexOf(card.rank);
    return 100 + rankPower;
  }
  return RANKS.indexOf(card.rank);
}

export function determineTrickWinner(table: Card[], firstPlayerIndex: number, leadSuit: Suit, trumpSuit: Suit | null): number {
  let bestPower = -1;
  let winnerOffset = 0;

  table.forEach((card, index) => {
    const power = getCardPower(card, leadSuit, trumpSuit);
    if (power > bestPower) {
      bestPower = power;
      winnerOffset = index;
    }
  });

  return (firstPlayerIndex + winnerOffset) % 4;
}

export function validateMove(card: Card, hand: Card[], table: Card[], trumpSuit: Suit | null, playedSuits: Suit[]): { valid: boolean; reason?: string } {
  if (table.length === 0) {
    // If it's the first card in the trick, any card is valid (except maybe some specific rules but let's keep it simple)
    return { valid: true };
  }

  const firstCard = table[0];
  const isFirstCardTrump = isTrump(firstCard, trumpSuit);
  const leadSuit = firstCard.suit;

  // 1. Must follow suit if it's trump
  if (isFirstCardTrump) {
    const hasTrump = hand.some(c => isTrump(c, trumpSuit));
    if (hasTrump) {
      if (!isTrump(card, trumpSuit)) return { valid: false, reason: 'Нужно ходить козырем' };
      return { valid: true };
    }
  } else {
    // 2. Must follow suit if it's a regular suit
    const hasLeadSuit = hand.some(c => c.suit === leadSuit && !isTrump(c, trumpSuit));
    if (hasLeadSuit) {
      if (card.suit !== leadSuit || isTrump(card, trumpSuit)) {
        const suitName = leadSuit === 'CLUBS' ? 'Трефы' : leadSuit === 'SPADES' ? 'Пики' : leadSuit === 'HEARTS' ? 'Червы' : 'Бубны';
        return { valid: false, reason: `Нужно ходить в масть (${suitName})` };
      }
      return { valid: true };
    }
  }

  // 3. Слив туза с «чужой» масти: нельзя, пока эта масть ещё не выходила в раздаче
  const playingTrump = isTrump(card, trumpSuit);
  const followingSuit = !isFirstCardTrump && card.suit === leadSuit && !playingTrump;
  
  if (!followingSuit && !playingTrump) {
    if (card.rank === 'ACE' && !playedSuits.includes(card.suit)) {
      // Ищем, есть ли другие варианты слива (не козыри, не в масть, и не голые тузы)
      const hasOtherOptions = hand.some(c => {
        if (c.id === card.id) return false;
        // Если это козырь, им можно ходить (если нет масти)
        if (isTrump(c, trumpSuit)) return true;
        // Если это другая масть, но не голый туз
        if (!(c.rank === 'ACE' && !playedSuits.includes(c.suit))) return true;
        return false;
      });

      if (hasOtherOptions) {
        return { valid: false, reason: 'Нельзя сливать голого туза, пока есть другие карты' };
      }
    }
  }

  return { valid: true };
}

export type RoundEndPhase = 'ROUND_OVER' | 'GAME_OVER';

/**
 * Конец раздачи (не ничья 60:60): сколько глаз у победителя и переход фазы.
 * Шапан — 120 очков в этой раздаче: победитель сразу получает 12 глаз и матч заканчивается.
 */
export function computeRoundEndEyesOutcome(
  eyes: readonly [number, number],
  eggsCount: number,
  winnerTeam: 0 | 1,
  loserPoints: number,
  winnerPoints: number,
  isFirstRound: boolean
): { eyes: [number, number]; eggsCount: number; phase: RoundEndPhase } {
  const next: [number, number] = [eyes[0], eyes[1]];

  if (winnerPoints === 120) {
    next[winnerTeam] = 12;
    return { eyes: next, eggsCount: 0, phase: 'GAME_OVER' };
  }

  let eyesToAward = 1;
  if (isFirstRound) {
    eyesToAward = 2;
  } else {
    if (loserPoints < 31) eyesToAward = 2;
  }
  const eyesTotal = eyesToAward + eggsCount;
  next[winnerTeam] = Math.min(12, next[winnerTeam] + eyesTotal);
  return {
    eyes: next,
    eggsCount: 0,
    phase: next[winnerTeam] >= 12 ? 'GAME_OVER' : 'ROUND_OVER',
  };
}

/** ID карт из руки, которыми можно легально походить в текущей позиции (для AI / бэка). */
export function getLegalCardIds(
  hand: Card[],
  table: Card[],
  trumpSuit: Suit | null,
  playedSuits: Suit[]
): string[] {
  return hand
    .filter((c) => validateMove(c, hand, table, trumpSuit, playedSuits).valid)
    .map((c) => c.id);
}

export function sortHand(hand: Card[], trumpSuit: Suit | null): Card[] {
  return [...hand].sort((a, b) => {
    const aTrump = isTrump(a, trumpSuit);
    const bTrump = isTrump(b, trumpSuit);

    if (aTrump && !bTrump) return -1;
    if (!aTrump && bTrump) return 1;

    if (aTrump && bTrump) {
      if (a.rank === 'JACK' && b.rank === 'JACK') {
        const aIndex = JACK_TRUMPS.findIndex(j => j.suit === a.suit);
        const bIndex = JACK_TRUMPS.findIndex(j => j.suit === b.suit);
        return aIndex - bIndex;
      }
      if (a.rank === 'JACK') return -1;
      if (b.rank === 'JACK') return 1;
      return RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank);
    }

    if (a.suit !== b.suit) {
      return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    }
    return RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank);
  });
}

export function getBestBotMove(hand: Card[], table: Card[], trumpSuit: Suit | null, playedSuits: Suit[]): Card {
  const validCards = hand.filter(c => validateMove(c, hand, table, trumpSuit, playedSuits).valid);
  
  if (validCards.length === 0) return hand[0];

  // 1. If bot is leading the trick
  if (table.length === 0) {
    // Lead with a high card (Ace, 10) of a regular suit to win points
    const highCards = validCards.filter(c => (c.rank === 'ACE' || c.rank === '10') && !isTrump(c, trumpSuit));
    if (highCards.length > 0) return highCards[0];
    
    // Otherwise play the highest card available
    return validCards.sort((a, b) => getCardPower(b, a.suit, trumpSuit) - getCardPower(a, a.suit, trumpSuit))[0];
  }

  // 2. Bot is following
  const leadSuit = table[0].suit;
  const winningCard = table.reduce((prev, curr) => 
    getCardPower(curr, leadSuit, trumpSuit) > getCardPower(prev, leadSuit, trumpSuit) ? curr : prev
  );

  // Can win the trick?
  const betterCards = validCards.filter(c => getCardPower(c, leadSuit, trumpSuit) > getCardPower(winningCard, leadSuit, trumpSuit));
  
  if (betterCards.length > 0) {
    // Win with the SMALLEST card that is still better than the current winning card
    return betterCards.sort((a, b) => getCardPower(a, leadSuit, trumpSuit) - getCardPower(b, leadSuit, trumpSuit))[0];
  }

  // Cannot win, play the smallest card to save power
  return validCards.sort((a, b) => getCardPower(a, leadSuit, trumpSuit) - getCardPower(b, leadSuit, trumpSuit))[0];
}
