import { GameState, Card, Player, CARD_POINTS, Suit } from '../core/types';
import {
  createDeck,
  shuffleDeck,
  dealCards,
  getBestBotMove,
  determineTrickWinner,
  sortHand,
  validateMove,
  getLegalCardIds,
} from '../core/engine';
import { fetchBotMove, isAiApiConfigured } from '../services/aiApi';

export interface StressTestConfig {
  rounds: number; // Количество раундов (по умолчанию 100)
  hangTimeoutMs: number; // Таймаут детекта зависания (по умолчанию 5000ms)
  logEveryN: number; // Логировать каждые N раундов (по умолчанию 10)
  /** Ходы через POST /api/ai/bot-move с fallback на движок (нужен VITE_API_URL). */
  useAiForMoves: boolean;
  /** Таймаут одного запроса к API (мс). */
  aiMoveTimeoutMs: number;
  /** В режиме AI не больше стольких раундов (защита лимитов Gemini и туннеля). */
  maxRoundsWithAi: number;
}

export interface StressTestResult {
  totalRounds: number;
  completedRounds: number;
  hangs: HangReport[];
  errors: ErrorReport[];
  avgRoundDuration: number;
  maxRoundDuration: number;
}

export interface HangReport {
  roundNumber: number;
  reason: string;
  state: {
    currentPlayerIndex: number;
    tableLength: number;
    phase: string;
    players: { id: number; handSize: number; isBot: boolean }[];
  };
}

export interface ErrorReport {
  roundNumber: number;
  trickNumber: number;
  message: string;
  state?: Partial<GameState>;
}

export class BelkaStressTester {
  private config: StressTestConfig;
  private results: StressTestResult;
  private onProgress?: (current: number, total: number, status: string) => void;

  constructor(config: Partial<StressTestConfig> = {}) {
    this.config = {
      rounds: 100,
      hangTimeoutMs: 5000,
      logEveryN: 10,
      useAiForMoves: false,
      aiMoveTimeoutMs: 12000,
      maxRoundsWithAi: 50,
      ...config,
    };

    this.results = {
      totalRounds: this.config.rounds,
      completedRounds: 0,
      hangs: [],
      errors: [],
      avgRoundDuration: 0,
      maxRoundDuration: 0,
    };
  }

  setProgressCallback(callback: (current: number, total: number, status: string) => void) {
    this.onProgress = callback;
  }

  async run(): Promise<StressTestResult> {
    const tryAi = this.config.useAiForMoves && isAiApiConfigured();
    const effectiveRounds =
      tryAi ? Math.min(this.config.rounds, this.config.maxRoundsWithAi) : this.config.rounds;
    if (tryAi && effectiveRounds < this.config.rounds) {
      console.warn(
        `[STRESS TEST] AI режим: ограничено ${effectiveRounds} раундов (maxRoundsWithAi)`
      );
    }

    // Сбрасываем результаты перед каждым запуском
    this.results = {
      totalRounds: effectiveRounds,
      completedRounds: 0,
      hangs: [],
      errors: [],
      avgRoundDuration: 0,
      maxRoundDuration: 0,
    };

    console.log(`[STRESS TEST] 🚀 Запуск: ${effectiveRounds} раундов`);
    const durations: number[] = [];

    for (let i = 0; i < effectiveRounds; i++) {
      const roundStart = Date.now();

      try {
        await this.runSingleRound(i + 1);
        const duration = Date.now() - roundStart;
        durations.push(duration);
        this.results.completedRounds++;

        if ((i + 1) % this.config.logEveryN === 0) {
          console.log(`[STRESS TEST] ✅ Раунд ${i + 1}/${effectiveRounds} (${duration}ms)`);
        }

        if (this.onProgress) {
          this.onProgress(i + 1, effectiveRounds, `Раунд ${i + 1} завершен за ${duration}ms`);
        }

        // Уступаем UI-потоку каждые 10 раундов, чтобы прогресс-бар обновлялся
        if ((i + 1) % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } catch (error) {
        const duration = Date.now() - roundStart;
        durations.push(duration);
        this.results.errors.push({
          roundNumber: i + 1,
          trickNumber: -1,
          message: error instanceof Error ? error.message : String(error),
        });
        console.error(`[STRESS TEST] ❌ Ошибка в раунде ${i + 1}:`, error);

        if (this.onProgress) {
          this.onProgress(i + 1, effectiveRounds, `❌ Ошибка в раунде ${i + 1}`);
        }
      }
    }

    this.results.avgRoundDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    this.results.maxRoundDuration = durations.length > 0 ? Math.max(...durations) : 0;

    console.log(`\n[STRESS TEST] 🏁 Завершено:`);
    console.log(`  ✅ Раундов: ${this.results.completedRounds}/${this.results.totalRounds}`);
    console.log(`  ⏱️  Среднее время: ${this.results.avgRoundDuration.toFixed(0)}ms`);
    console.log(`  ⏱️  Макс. время: ${this.results.maxRoundDuration}ms`);
    console.log(`  🐛 Зависаний: ${this.results.hangs.length}`);
    console.log(`  ❌ Ошибок: ${this.results.errors.length}`);

    return this.results;
  }

  private async pickCardForStress(
    hand: Card[],
    table: Card[],
    trumpSuit: Suit,
    playedSuits: Suit[],
    scores: [number, number],
    playerIndex: number,
    trickLeaderIndex: number
  ): Promise<Card | null> {
    const tryAi = this.config.useAiForMoves && isAiApiConfigured();
    if (tryAi) {
      const legalIds = getLegalCardIds(hand, table, trumpSuit, playedSuits);
      if (legalIds.length === 0) return null;
      try {
        const res = await fetchBotMove(
          {
            playerIndex,
            trickLeaderIndex,
            hand: hand.map((c) => c.id),
            legalMoves: legalIds,
            table: table.map((c) => c.id),
            trumpSuit,
            playedSuits,
            scores,
            eyes: [0, 0] as [number, number],
          },
          { timeoutMs: this.config.aiMoveTimeoutMs }
        );
        const picked = hand.find((c) => c.id === res.card);
        if (picked && legalIds.includes(res.card)) {
          const v = validateMove(picked, hand, table, trumpSuit, playedSuits);
          if (v.valid) return picked;
        }
      } catch {
        return null;
      }
      return null;
    }
    return getBestBotMove(hand, table, trumpSuit, playedSuits);
  }

  private async runSingleRound(roundNumber: number): Promise<void> {
    const deck = shuffleDeck(createDeck());
    const hands = dealCards(deck);

    // Определяем стартера (у кого валет треф)
    let starterIndex = 0;
    hands.forEach((hand, idx) => {
      if (hand.some(c => c.id === 'CLUBS_JACK')) starterIndex = idx;
    });

    const trumpSuit = 'CLUBS';
    const players: Player[] = hands.map((hand, i) => ({
      id: i,
      name: `Bot ${i}`,
      hand: sortHand(hand, trumpSuit),
      team: i % 2 as 0 | 1,
      isBot: true,
    }));

    let currentPlayerIndex = starterIndex;
    let table: Card[] = [];
    let scores: [number, number] = [0, 0];
    let firstPlayerInTrick = starterIndex;
    let playedSuits: Suit[] = [];
    let trickCount = 0;

    const maxMoves = 8 * 4; // 8 взяток × 4 игрока = 32 хода
    let moveCount = 0;

    while (moveCount < maxMoves) {
      // Детект: currentPlayerIndex = -1
      if (currentPlayerIndex === -1) {
        this.results.hangs.push({
          roundNumber,
          reason: 'currentPlayerIndex = -1',
          state: {
            currentPlayerIndex,
            tableLength: table.length,
            phase: 'PLAYING',
            players: players.map(p => ({ id: p.id, handSize: p.hand.length, isBot: !!p.isBot })),
          },
        });
        throw new Error(`currentPlayerIndex = -1 в раунде ${roundNumber}, ход ${moveCount}`);
      }

      // Разыгрываем взятку если стол полный
      if (table.length === 4) {
        const leadSuit = table[0].suit;
        const winnerIndex = determineTrickWinner(table, firstPlayerInTrick, leadSuit, trumpSuit);
        const trickPoints = table.reduce((sum, c) => sum + CARD_POINTS[c.rank], 0);
        const winnerTeam = players[winnerIndex].team;
        scores[winnerTeam] += trickPoints;

        table = [];
        currentPlayerIndex = winnerIndex;
        firstPlayerInTrick = winnerIndex;
        trickCount++;

        // Проверка корректности суммы очков
        const totalScored = scores[0] + scores[1];
        if (trickCount <= 8 && totalScored > 120) {
          this.results.errors.push({
            roundNumber,
            trickNumber: trickCount,
            message: `Сумма очков ${totalScored} > 120 после взятки ${trickCount}`,
          });
        }
        continue;
      }

      // Игрок делает ход
      const currentPlayer = players[currentPlayerIndex];
      if (currentPlayer.hand.length === 0) {
        break; // Раунд завершен
      }

      const bestCard = await this.pickCardForStress(
        currentPlayer.hand,
        table,
        trumpSuit,
        playedSuits,
        scores,
        currentPlayerIndex,
        firstPlayerInTrick
      );

      if (!bestCard) {
        this.results.errors.push({
          roundNumber,
          trickNumber: trickCount,
          message: `getBestBotMove вернул null для игрока ${currentPlayerIndex} (рука: ${currentPlayer.hand.length} карт)`,
        });
        throw new Error(`Нет доступного хода в раунде ${roundNumber}, взятка ${trickCount}`);
      }

      // Валидация хода
      const validation = validateMove(bestCard, currentPlayer.hand, table, trumpSuit, playedSuits);
      if (!validation.valid) {
        this.results.errors.push({
          roundNumber,
          trickNumber: trickCount,
          message: `Невалидный ход игрока ${currentPlayerIndex}: ${validation.reason} (карта: ${bestCard.rank} ${bestCard.suit})`,
        });
      }

      // Убираем карту из руки
      currentPlayer.hand = currentPlayer.hand.filter(c => c.id !== bestCard.id);
      table.push(bestCard);

      // Трекаем масти (только первая карта взятки)
      if (table.length === 1 && !playedSuits.includes(bestCard.suit)) {
        playedSuits.push(bestCard.suit);
      }

      moveCount++;

      // Переход хода (если взятка ещё не завершена)
      if (table.length < 4) {
        currentPlayerIndex = (currentPlayerIndex + 1) % 4;
      }
    }

    // Дообрабатываем последнюю взятку, если стол не пуст
    if (table.length === 4) {
      const leadSuit = table[0].suit;
      const winnerIndex = determineTrickWinner(table, firstPlayerInTrick, leadSuit, trumpSuit);
      const trickPoints = table.reduce((sum, c) => sum + CARD_POINTS[c.rank], 0);
      scores[players[winnerIndex].team] += trickPoints;
      trickCount++;
    }

    // Проверка завершения раунда
    const allHandsEmpty = players.every(p => p.hand.length === 0);
    if (!allHandsEmpty) {
      this.results.errors.push({
        roundNumber,
        trickNumber: trickCount,
        message: `Раунд завершился, но не все руки пусты: ${players.map(p => p.hand.length).join(',')}`,
      });
    }

    // Итоговая проверка суммы очков
    const finalTotal = scores[0] + scores[1];
    if (finalTotal !== 120) {
      this.results.errors.push({
        roundNumber,
        trickNumber: trickCount,
        message: `Итоговая сумма очков ${finalTotal} ≠ 120 (Команда А: ${scores[0]}, Команда Б: ${scores[1]})`,
      });
    }
  }
}

export default BelkaStressTester;
