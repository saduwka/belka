import { describe, it, expect } from 'vitest';
import { createDeck, determineTrickWinner, validateMove, isTrump, getCardPower, sortHand, getFirstPlayerIndexLeftOfDealer, computeRoundEndEyesOutcome } from './engine';
import { Card, Suit } from './types';

describe('Belka Engine Logic', () => {
  const trump: Suit = 'CLUBS';
  
  it('identifies trumps correctly', () => {
    const cJack = { suit: 'CLUBS' as Suit, rank: 'JACK' as any, id: 'CLUBS_JACK' };
    const hJack = { suit: 'HEARTS' as Suit, rank: 'JACK' as any, id: 'HEARTS_JACK' };
    const cAce = { suit: 'CLUBS' as Suit, rank: 'ACE' as any, id: 'CLUBS_ACE' };
    const sAce = { suit: 'SPADES' as Suit, rank: 'ACE' as any, id: 'SPADES_ACE' };

    expect(isTrump(cJack, trump)).toBe(true);
    expect(isTrump(hJack, trump)).toBe(true); // All jacks are trumps
    expect(isTrump(cAce, trump)).toBe(true); // Clubs is trump suit
    expect(isTrump(sAce, trump)).toBe(false); // Spades is not trump suit
  });

  it('determines card power correctly', () => {
    const cJack = { suit: 'CLUBS' as Suit, rank: 'JACK' as any, id: 'CLUBS_JACK' }; // Strongest
    const sJack = { suit: 'SPADES' as Suit, rank: 'JACK' as any, id: 'SPADES_JACK' }; // 2nd strongest
    const cAce = { suit: 'CLUBS' as Suit, rank: 'ACE' as any, id: 'CLUBS_ACE' }; // Strongest non-jack trump
    const dAce = { suit: 'DIAMONDS' as Suit, rank: 'ACE' as any, id: 'DIAMONDS_ACE' }; // Regular ace

    const lead: Suit = 'DIAMONDS';
    
    expect(getCardPower(cJack, lead, trump)).toBeGreaterThan(getCardPower(sJack, lead, trump));
    expect(getCardPower(sJack, lead, trump)).toBeGreaterThan(getCardPower(cAce, lead, trump));
    expect(getCardPower(cAce, lead, trump)).toBeGreaterThan(getCardPower(dAce, lead, trump));
  });

  it('determines trick winner', () => {
    const table: Card[] = [
      { suit: 'DIAMONDS', rank: 'ACE', id: 'D_A' },
      { suit: 'DIAMONDS', rank: '10', id: 'D_10' },
      { suit: 'HEARTS', rank: 'JACK', id: 'H_J' }, // Trump!
      { suit: 'DIAMONDS', rank: '7', id: 'D_7' },
    ];
    
    // Winner should be index 2 (Jack of Hearts)
    expect(determineTrickWinner(table, 0, 'DIAMONDS', 'CLUBS')).toBe(2);
  });

  it('validates moves correctly (must follow suit)', () => {
    const hand: Card[] = [
      { suit: 'DIAMONDS', rank: '7', id: 'D_7' },
      { suit: 'HEARTS', rank: 'ACE', id: 'H_A' },
    ];
    const table: Card[] = [
      { suit: 'DIAMONDS', rank: '10', id: 'D_10' }
    ];

    // Must play Diamonds if you have it
    expect(validateMove(hand[0], hand, table, 'CLUBS', []).valid).toBe(true);
    expect(validateMove(hand[1], hand, table, 'CLUBS', []).valid).toBe(false);
  });

  it('validates Ace discard rule', () => {
    const hand: Card[] = [
      { suit: 'HEARTS', rank: 'ACE', id: 'H_A' }, // Bare Ace
      { suit: 'SPADES', rank: '7', id: 'S_7' },
    ];
    const table: Card[] = [
      { suit: 'DIAMONDS', rank: '10', id: 'D_10' }
    ];

    // «Голый» туз: масть туза ещё не выходила в раздаче (`playedSuits`), есть другая карта для слива
    expect(validateMove(hand[0], hand, table, 'CLUBS', []).valid).toBe(false);
    expect(validateMove(hand[1], hand, table, 'CLUBS', []).valid).toBe(true);
  });

  it('allows discarding Ace after that suit appeared in an earlier trick', () => {
    const hand: Card[] = [
      { suit: 'HEARTS', rank: 'ACE', id: 'H_A' },
      { suit: 'SPADES', rank: '7', id: 'S_7' },
    ];
    const table: Card[] = [{ suit: 'DIAMONDS', rank: '10', id: 'D_10' }];
    expect(
      validateMove(hand[0], hand, table, 'CLUBS', ['HEARTS']).valid
    ).toBe(true);
    expect(
      validateMove(hand[0], hand, table, 'CLUBS', []).valid
    ).toBe(false);
  });

  it('Шапан 120: сразу 12 глаз и конец матча', () => {
    const z = computeRoundEndEyesOutcome([0, 0], 0, 0, 0, 120, false);
    expect(z.eyes[0]).toBe(12);
    expect(z.eyes[1]).toBe(0);
    expect(z.phase).toBe('GAME_OVER');
    expect(z.eggsCount).toBe(0);
    const prev = computeRoundEndEyesOutcome([8, 0], 3, 0, 40, 120, false);
    expect(prev.eyes[0]).toBe(12);
    expect(prev.phase).toBe('GAME_OVER');
  });

  it('обычная победа не-шапан: старая шкала очков за глаза', () => {
    expect(
      computeRoundEndEyesOutcome([0, 0], 0, 1, 15, 105, false).eyes[1]
    ).toBe(2);
    expect(
      computeRoundEndEyesOutcome([10, 0], 0, 0, 40, 80, false).eyes[0]
    ).toBe(11);
  });

  it('computes left-of-dealer first player', () => {
    expect(getFirstPlayerIndexLeftOfDealer(0)).toBe(1);
    expect(getFirstPlayerIndexLeftOfDealer(3)).toBe(0);
  });

  it('shuffles and deals correctly', () => {
    const deck = createDeck();
    expect(deck.length).toBe(32);
  });
});
