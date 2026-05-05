# Инструкция по фиксу бага зависания и созданию стресс-теста

## 🐛 Описанная проблема

Игра периодически **зависает** — никто не начинает ходить. `currentPlayerIndex` либо становится `-1`, либо остается на боте, который не делает ход.

---

## 🔍 Найденные баги в `src/store/gameStore.ts`

### Баг #1: Бот не ходит после разыгрывания взятки (строки 405-414)

**Проблема:**
```typescript
if (st.phase === 'PLAYING' && st.currentPlayerIndex !== 0 && st.currentPlayerIndex !== -1 && st.table.length < 4) {
```

Условие `st.table.length < 4` блокирует ход бота, если на столе уже 4 карты. Но после хода 4-го игрока взятка разыгрывается с задержкой 3 секунды (строка 390), `table` очищается, и `currentPlayerIndex` переходит к победителю. Если победитель — бот, он должен сходить первым в новой взятке, но проверка происходит ДО очистки стола.

**Решение:**
Убрать условие `st.table.length < 4` из проверки:

```typescript
// Было:
if (st.phase === 'PLAYING' && st.currentPlayerIndex !== 0 && st.currentPlayerIndex !== -1 && st.table.length < 4) {

// Стало:
if (st.phase === 'PLAYING' && st.currentPlayerIndex !== 0 && st.currentPlayerIndex !== -1) {
```

Применить также в строках **161** (мультиплеер) и **405** (одиночная игра).

---

### Баг #2: currentPlayerIndex = -1 и нет восстановления (строки 360-363)

**Проблема:**
```typescript
lastTrickWinnerIndex: null,
```

В строке **363** `lastTrickWinnerIndex` обнуляется сразу после определения победителя взятки. Если по какой-то причине `currentPlayerIndex` станет `-1`, функция `forceSync()` (строки 542-546) пытается восстановить его из `lastTrickWinnerIndex`, но тот уже `null`.

**Решение:**
НЕ обнулять `lastTrickWinnerIndex` при разыгрывании взятки:

```typescript
// Было (строка 360-363):
const finalUpdate: Partial<GameState> = {
  table: [],
  scores: newScores,
  currentPlayerIndex: winnerIndex,
  firstPlayerInTrick: winnerIndex,
  lastTrickWinnerIndex: null,  // ← УБРАТЬ ЭТУ СТРОКУ
  readyPlayers: { _init: true } as any
};

// Стало:
const finalUpdate: Partial<GameState> = {
  table: [],
  scores: newScores,
  currentPlayerIndex: winnerIndex,
  firstPlayerInTrick: winnerIndex,
  lastTrickWinnerIndex: winnerIndex,  // ← Сохраняем последнего победителя
  readyPlayers: { _init: true } as any
};
```

Обнулять `lastTrickWinnerIndex` только при **старте нового раунда** (в функции `resetRound`, строка 488):

```typescript
const nextState: Partial<GameState> = {
  players: newPlayers, 
  table: [], 
  scores: [0, 0], 
  phase: 'PLAYING',
  currentPlayerIndex: starterIndex, 
  firstPlayerInTrick: starterIndex,
  lastTrickWinnerIndex: null,  // ← ВОТ ЗДЕСЬ обнуляем
  // ...
};
```

---

### Баг #3: Race condition в мультиплеере (строки 150-166)

**Проблема:**
Хост управляет ботами через Firebase `onValue` (строка 72). Если два клиента одновременно обновят `state`, бот может не сходить из-за конфликта версий.

**Решение:**
Добавить проверку на `currentTable.length` перед `playCard`:

```typescript
// Строка 159 (было):
if (st.phase === 'PLAYING' && st.currentPlayerIndex === cpIdx && st.players[cpIdx].isBot && currentTable.length < 4) {

// Стало:
if (st.phase === 'PLAYING' && st.currentPlayerIndex === cpIdx && st.players[cpIdx].isBot) {
  // Убрали currentTable.length < 4 — бот должен ходить даже если стол пуст после разыгрывания взятки
```

---

### Баг #4: Пустые руки у игроков после разыгрывания раунда (строка 281)

**Проблема:**
Firebase удаляет пустые массивы (`hand: []`). После всех 8 взяток руки пусты, и при проверке `allHandsEmpty` (строка 281) игра переходит в `ROUND_OVER`, но при синхронизации Firebase может вернуть `hand: undefined` вместо `[]`, что ломает логику.

**Решение:**
Уже исправлено в строках 78-81 через нормализацию:

```typescript
const normalizedPlayers = remoteState.players ? remoteState.players.map((p: any) => ({
  ...p,
  hand: p.hand || []  // ← Firebase восстанавливает пустые массивы
})) : [];
```

Это корректно, но **добавить проверку** в `playCard` перед определением конца раунда:

```typescript
// Строка 281 (добавить):
const allHandsEmpty = state.players.every(p => (p.hand || []).length === 0);
```

---

## 🧪 Задача: Создать стресс-тест

### Требования

1. **Автоматический прогон N раундов** (по умолчанию 100)
2. **Детект зависаний:**
   - Если ход не меняется дольше 5 секунд → логировать состояние
   - Если `currentPlayerIndex === -1` → фиксировать как баг
   - Если `table.length === 4` дольше 4 секунд → зависание взятки
3. **Детект ошибок валидации:**
   - Игрок сходил невалидной картой
   - Неправильный подсчет очков
   - Тузы сливаются нелегально
4. **Логирование:**
   - Каждые 10 раундов выводить прогресс
   - В конце вывести статистику: зависания, ошибки, среднее время раунда
5. **Turbo режим:** все задержки = 0, чтобы прогон был быстрым
6. **UI:** кнопка "Стресс-тест" в главном меню, модальное окно с прогрессом

---

## 📝 Файл для создания: `src/utils/stressTest.ts`

```typescript
import { GameState, Card, Player, CARD_POINTS } from '../core/types';
import { 
  createDeck, 
  shuffleDeck, 
  dealCards, 
  getBestBotMove, 
  determineTrickWinner, 
  sortHand,
  validateMove 
} from '../core/engine';

export interface StressTestConfig {
  rounds: number;              // Количество раундов (по умолчанию 100)
  hangTimeoutMs: number;       // Таймаут детекта зависания (по умолчанию 5000ms)
  logEveryN: number;           // Логировать каждые N раундов (по умолчанию 10)
}

export interface StressTestResult {
  totalRounds: number;
  completedRounds: number;
  hangs: HangReport[];         // Список зависаний
  errors: ErrorReport[];       // Список ошибок валидации
  avgRoundDuration: number;    // Среднее время раунда (ms)
  maxRoundDuration: number;    // Максимальное время раунда (ms)
}

export interface HangReport {
  roundNumber: number;
  reason: string;              // "currentPlayerIndex=-1" | "table stuck at 4 cards" | "no move for 5s"
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
  message: string;             // Описание ошибки
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
    console.log(`[STRESS TEST] 🚀 Запуск: ${this.config.rounds} раундов`);
    const durations: number[] = [];

    for (let i = 0; i < this.config.rounds; i++) {
      const roundStart = Date.now();
      
      try {
        await this.runSingleRound(i + 1);
        const duration = Date.now() - roundStart;
        durations.push(duration);
        this.results.completedRounds++;

        if ((i + 1) % this.config.logEveryN === 0) {
          console.log(`[STRESS TEST] ✅ Раунд ${i + 1}/${this.config.rounds} (${duration}ms)`);
        }

        if (this.onProgress) {
          this.onProgress(i + 1, this.config.rounds, `Раунд ${i + 1} завершен`);
        }
      } catch (error) {
        this.results.errors.push({
          roundNumber: i + 1,
          trickNumber: -1,
          message: error instanceof Error ? error.message : String(error),
        });
        console.error(`[STRESS TEST] ❌ Ошибка в раунде ${i + 1}:`, error);
      }
    }

    this.results.avgRoundDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    this.results.maxRoundDuration = Math.max(...durations);

    console.log(`\n[STRESS TEST] 🏁 Завершено:`);
    console.log(`  ✅ Раундов: ${this.results.completedRounds}/${this.config.rounds}`);
    console.log(`  ⏱️  Среднее время: ${this.results.avgRoundDuration.toFixed(0)}ms`);
    console.log(`  ⏱️  Макс. время: ${this.results.maxRoundDuration}ms`);
    console.log(`  🐛 Зависаний: ${this.results.hangs.length}`);
    console.log(`  ❌ Ошибок: ${this.results.errors.length}`);

    return this.results;
  }

  private async runSingleRound(roundNumber: number): Promise<void> {
    const deck = shuffleDeck(createDeck());
    const hands = dealCards(deck);

    // Определяем стартера (у кого валет треф)
    let starterIndex = 0;
    hands.forEach((hand, idx) => {
      if (hand.some(c => c.id === 'CLUBS_JACK')) starterIndex = idx;
    });

    const trumpSuit = 'CLUBS'; // Упрощение: всегда трефы козырь
    const players: Player[] = hands.map((hand, i) => ({
      id: i,
      name: `Bot ${i}`,
      hand: sortHand(hand, trumpSuit),
      team: i % 2,
      isBot: true,
    }));

    let currentPlayerIndex = starterIndex;
    let table: Card[] = [];
    let scores: [number, number] = [0, 0];
    let firstPlayerInTrick = starterIndex;
    let playedSuits: string[] = [];
    let trickCount = 0;

    const maxMoves = 8 * 4; // 8 взяток × 4 игрока = 32 хода
    let moveCount = 0;
    let lastMoveTime = Date.now();

    while (moveCount < maxMoves) {
      // Детект зависания: если ход не меняется дольше hangTimeoutMs
      if (Date.now() - lastMoveTime > this.config.hangTimeoutMs) {
        this.results.hangs.push({
          roundNumber,
          reason: `Зависание: нет хода ${this.config.hangTimeoutMs}ms`,
          state: {
            currentPlayerIndex,
            tableLength: table.length,
            phase: 'PLAYING',
            players: players.map(p => ({ id: p.id, handSize: p.hand.length, isBot: p.isBot })),
          },
        });
        throw new Error(`Зависание в раунде ${roundNumber}, ход ${moveCount}`);
      }

      // Детект: currentPlayerIndex = -1
      if (currentPlayerIndex === -1) {
        this.results.hangs.push({
          roundNumber,
          reason: 'currentPlayerIndex = -1',
          state: {
            currentPlayerIndex,
            tableLength: table.length,
            phase: 'PLAYING',
            players: players.map(p => ({ id: p.id, handSize: p.hand.length, isBot: p.isBot })),
          },
        });
        throw new Error(`currentPlayerIndex = -1 в раунде ${roundNumber}`);
      }

      // Детект: стол застрял на 4 картах
      if (table.length === 4) {
        await new Promise(resolve => setTimeout(resolve, 10)); // Ждем 10ms (имитация задержки игры)
        
        // Разыгрываем взятку
        const leadSuit = table[0].suit;
        const winnerIndex = determineTrickWinner(table, firstPlayerInTrick, leadSuit, trumpSuit);
        const trickPoints = table.reduce((sum, c) => sum + CARD_POINTS[c.rank], 0);
        const winnerTeam = players[winnerIndex].team;
        scores[winnerTeam] += trickPoints;

        table = [];
        currentPlayerIndex = winnerIndex;
        firstPlayerInTrick = winnerIndex;
        trickCount++;
        continue;
      }

      // Игрок делает ход
      const currentPlayer = players[currentPlayerIndex];
      if (currentPlayer.hand.length === 0) {
        break; // Раунд завершен
      }

      const bestCard = getBestBotMove(currentPlayer.hand, table, trumpSuit, playedSuits);

      // Валидация хода
      const validation = validateMove(bestCard, currentPlayer.hand, table, trumpSuit, playedSuits);
      if (!validation.valid) {
        this.results.errors.push({
          roundNumber,
          trickNumber: trickCount,
          message: `Невалидный ход: ${validation.reason}`,
        });
      }

      // Убираем карту из руки
      currentPlayer.hand = currentPlayer.hand.filter(c => c.id !== bestCard.id);
      table.push(bestCard);

      // Трекаем масти
      if (table.length === 1 && !playedSuits.includes(bestCard.suit)) {
        playedSuits.push(bestCard.suit);
      }

      moveCount++;
      lastMoveTime = Date.now();

      // Переход хода (если взятка еще не завершена)
      if (table.length < 4) {
        currentPlayerIndex = (currentPlayerIndex + 1) % 4;
      }
    }

    // Проверка завершения раунда
    const allHandsEmpty = players.every(p => p.hand.length === 0);
    if (!allHandsEmpty) {
      this.results.errors.push({
        roundNumber,
        trickNumber: trickCount,
        message: 'Раунд завершился, но не все руки пусты',
      });
    }
  }
}

export default BelkaStressTester;
```

---

## 🎨 UI компонент: `src/components/StressTestModal.tsx`

```tsx
import React, { useState } from 'react';
import BelkaStressTester, { StressTestResult } from '../utils/stressTest';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const StressTestModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(100);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<StressTestResult | null>(null);

  const runTest = async () => {
    setIsRunning(true);
    setResults(null);
    
    const tester = new BelkaStressTester({ rounds: 100 });
    tester.setProgressCallback((current, total, status) => {
      setProgress(current);
      setTotal(total);
      setStatus(status);
    });

    const result = await tester.run();
    setResults(result);
    setIsRunning(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">🧪 Стресс-тест</h2>
        
        {!isRunning && !results && (
          <div>
            <p className="text-gray-600 mb-4">
              Автоматический прогон 100 раундов для поиска багов зависания, 
              невалидных ходов и ошибок логики.
            </p>
            <button 
              onClick={runTest}
              className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600"
            >
              Запустить тест
            </button>
          </div>
        )}

        {isRunning && (
          <div>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span>{status}</span>
                <span>{progress} / {total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-blue-500 h-3 rounded-full transition-all"
                  style={{ width: `${(progress / total) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-gray-500 text-sm">Подождите, идет тестирование...</p>
          </div>
        )}

        {results && (
          <div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-3xl font-bold text-green-600">{results.completedRounds}</div>
                <div className="text-sm text-gray-600">Завершено раундов</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-3xl font-bold text-blue-600">{results.avgRoundDuration.toFixed(0)}ms</div>
                <div className="text-sm text-gray-600">Среднее время</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-3xl font-bold text-red-600">{results.hangs.length}</div>
                <div className="text-sm text-gray-600">Зависаний</div>
              </div>
              <div className="bg-amber-50 p-4 rounded-lg">
                <div className="text-3xl font-bold text-amber-600">{results.errors.length}</div>
                <div className="text-sm text-gray-600">Ошибок</div>
              </div>
            </div>

            {results.hangs.length > 0 && (
              <div className="mb-4">
                <h3 className="font-bold text-red-600 mb-2">🐛 Зависания:</h3>
                <div className="bg-red-50 p-3 rounded max-h-40 overflow-y-auto">
                  {results.hangs.map((hang, i) => (
                    <div key={i} className="text-sm mb-2">
                      <strong>Раунд {hang.roundNumber}:</strong> {hang.reason}
                      <br />
                      <span className="text-gray-600">
                        currentPlayer={hang.state.currentPlayerIndex}, table={hang.state.tableLength}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.errors.length > 0 && (
              <div className="mb-4">
                <h3 className="font-bold text-amber-600 mb-2">❌ Ошибки:</h3>
                <div className="bg-amber-50 p-3 rounded max-h-40 overflow-y-auto">
                  {results.errors.slice(0, 5).map((error, i) => (
                    <div key={i} className="text-sm mb-2">
                      <strong>Раунд {error.roundNumber}, Взятка {error.trickNumber}:</strong> {error.message}
                    </div>
                  ))}
                  {results.errors.length > 5 && (
                    <div className="text-sm text-gray-500">...и еще {results.errors.length - 5}</div>
                  )}
                </div>
              </div>
            )}

            <button 
              onClick={onClose}
              className="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 w-full"
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
```

---

## 🔧 Интеграция в приложение

### 1. Добавить кнопку в `src/components/Lobby.tsx`

```tsx
import { StressTestModal } from './StressTestModal';

// В компоненте Lobby:
const [showStressTest, setShowStressTest] = useState(false);

// В JSX добавить кнопку:
<button
  onClick={() => setShowStressTest(true)}
  className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
>
  🧪 Стресс-тест
</button>

<StressTestModal isOpen={showStressTest} onClose={() => setShowStressTest(false)} />
```

---

## ✅ Чеклист для Antigravity

- [ ] **Фикс #1:** Убрать `st.table.length < 4` в строках 161, 405
- [ ] **Фикс #2:** Заменить `lastTrickWinnerIndex: null` на `lastTrickWinnerIndex: winnerIndex` в строке 363
- [ ] **Фикс #3:** Обнулять `lastTrickWinnerIndex` только в `resetRound` (строка 488)
- [ ] **Фикс #4:** Добавить проверку `(p.hand || []).length === 0` в строке 281
- [ ] **Создать:** `src/utils/stressTest.ts` с классом `BelkaStressTester`
- [ ] **Создать:** `src/components/StressTestModal.tsx`
- [ ] **Добавить:** Кнопку "Стресс-тест" в лобби
- [ ] **Протестировать:** Запустить стресс-тест на 100 раундов, убедиться что `hangs.length === 0`

---

## 📊 Ожидаемый результат

После фиксов стресс-тест должен показывать:
```
✅ Раундов: 100/100
⏱️  Среднее время: ~150ms
🐛 Зависаний: 0
❌ Ошибок: 0
```

Если будут зависания — логи покажут точное состояние игры в момент бага.
