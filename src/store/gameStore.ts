import { create } from 'zustand';
import { GameState, Suit, Player, CARD_POINTS, RoundTrickRecord } from '../core/types';
import { createDeck, shuffleDeck, dealCards, determineTrickWinner, validateMove, sortHand, getBestBotMove, getLegalCardIds, findJackHolderIndex, getFirstPlayerIndexLeftOfDealer, computeRoundEndEyesOutcome } from '../core/engine';
import { db } from '../firebase';
import { ref, update as firebaseUpdate, onValue, set as firebaseDbSet } from 'firebase/database';
import { fetchBotMove, getAiApiBase, isAiApiConfigured, postAnalyzeGames, saveGameToAiBackend } from '../services/aiApi';

let lastPersistedLearningRound = -1;

/** Одноразовое пояснение в addLog (прод без VITE_AI_DEBUG почти не пишет [BelkaAI] в консоль). */
let warnedAiFallbackLogged = false;

function resetAiFallbackWarn() {
  warnedAiFallbackLogged = false;
}

function resetLearningPersistence() {
  lastPersistedLearningRound = -1;
}

function readAiEnabled(): boolean {
  try {
    return localStorage.getItem('belka_ai_enabled') !== '0';
  } catch {
    return true;
  }
}

const DEFAULT_AI_MOVE_TIMEOUT_MS = 12_000;

/** Не даём двум тикам интервала параллельно дергать bot-move */
let aiRecoveryFetchInFlight = false;

interface GameStore extends GameState {
  isMultiplayer: boolean;
  roomId: string | null;
  myPlayerIndex: number;
  isAutoPlay: boolean;
  isTurboMode: boolean;
  
  initGame: (roomId?: string, myIndex?: number, name?: string) => void;
  playCard: (playerIndex: number, cardId: string) => void;
  submitVote: (vote: 'TAKE' | 'HANG') => void;
  setReady: (playerIndex: number) => void;
  takeSlot: (slotIndex: number) => void;
  toggleLobbyReady: () => void;
  startGame: () => void;
  resetRound: () => void;
  updateFromRemote: (newState: Partial<GameState>) => void;
  toggleAutoPlay: () => void;
  toggleTurboMode: () => void;
  addLog: (msg: string) => void;
  forceSync: () => void;
  leaveGame: () => void;
  logs: string[];
  aiEnabled: boolean;
  aiThinking: boolean;
  /** Ход бота ждёт успешного bot-move; модалка + повторы запроса, игра не сдвигается движком. */
  aiRecoveryPlayerIndex: number | null;
  /** Сколько неудачных повторов после показа модалки (для UI). */
  aiRecoveryFailedPolls: number;
  toggleAiEnabled: () => void;
  executeBotTurn: (playerIndex: number) => Promise<void>;
  /** Повторная попытка bot-move пока `aiRecoveryPlayerIndex !== null`. */
  retryAiBotMoveFromRecovery: () => Promise<void>;
  /** Сохранить раздачу в AI-бэк и дернуть самообучение (analyze-games). Судья: первый живой игрок. */
  persistLearningRoundIfJudge: () => Promise<void>;
}

export const useGameStore = create<GameStore>((set, get) => {
  const attemptAiMoveOrFalse = async (playerIndex: number): Promise<boolean> => {
    const state = get();
    if (state.phase !== 'PLAYING' || state.currentPlayerIndex !== playerIndex) return false;
    const player = state.players[playerIndex];
    if (!player?.isBot) return false;
    const hand = player.hand || [];
    if (hand.length === 0 || state.table.length >= 4) return false;
    const legalIds = getLegalCardIds(hand, state.table, state.trumpSuit, state.playedSuits || []);
    if (legalIds.length === 0) return false;
    const timeoutMs = state.isTurboMode ? 4000 : DEFAULT_AI_MOVE_TIMEOUT_MS;
    try {
      const res = await fetchBotMove(
        {
          playerIndex,
          trickLeaderIndex: state.firstPlayerInTrick,
          hand: hand.map((c) => c.id),
          legalMoves: legalIds,
          table: state.table.map((c) => c.id),
          trumpSuit: state.trumpSuit ?? 'CLUBS',
          playedSuits: state.playedSuits || [],
          scores: state.scores,
          eyes: state.eyes,
        },
        { timeoutMs }
      );
      const picked = hand.find((c) => c.id === res.card);
      if (picked && legalIds.includes(res.card)) {
        get().playCard(playerIndex, res.card);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  };

  return {
  players: [],
  currentPlayerIndex: 0,
  trumpSuit: null,
  trumpSetterTeam: null,
  table: [],
  scores: [0, 0],
  eyes: [0, 0],
  phase: 'LOBBY',
  firstPlayerInTrick: 0,
  isFirstRound: true,
  lastTrickWinnerIndex: null,
  playedSuits: [],
  dealerIndex: 0,
  lastError: null,
  isMultiplayer: false,
  roomId: null,
  myPlayerIndex: 0,
  trumpMapping: {},
  eggsCount: 0,
  readyPlayers: {},
  spectators: [],
  creatorName: '',
  isAutoPlay: false,
  isTurboMode: false,
  logs: [],
  roundTricks: [],
  matchRoundNumber: 0,
  learningGameId: '',
  aiEnabled: readAiEnabled(),
  aiThinking: false,
  aiRecoveryPlayerIndex: null,
  aiRecoveryFailedPolls: 0,

  toggleAiEnabled: () => {
    const next = !get().aiEnabled;
    try {
      localStorage.setItem('belka_ai_enabled', next ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ aiEnabled: next });
  },

  addLog: (msg: string) => {
    console.log(`[BELKA GAME]: ${msg}`);
    set(state => ({ logs: [msg, ...state.logs].slice(0, 10) }));
  },

  toggleTurboMode: () => set(state => ({ isTurboMode: !state.isTurboMode })),

  initGame: (roomId, myIndex, name = 'Игрок') => {
    aiRecoveryFetchInFlight = false;
    const cleanName = name.trim();
    if (roomId) {
      set({ isMultiplayer: true, roomId, myPlayerIndex: myIndex ?? -1, aiRecoveryPlayerIndex: null, aiRecoveryFailedPolls: 0 });
      const stateRef = ref(db, `rooms/${roomId}/state`);
      let isResetting = false;
      let botTimeout: ReturnType<typeof setTimeout> | null = null;
      let roundEndTimeout: ReturnType<typeof setTimeout> | null = null;

      // ── Watchdog ──────────────────────────────────────────────────────────
      // Следит за currentPlayerIndex каждые 3 сек.
      // Если индекс не менялся > 8 сек во время PLAYING — хост делает forceSync.
      let _wdLastIdx: number | null = null;
      let _wdLastChange = Date.now();
      const WATCHDOG_HANG_MS = 32000;

      const watchdogInterval = setInterval(() => {
        const st = get();
        if (st.phase !== 'PLAYING' || !st.isMultiplayer) return;

        const now = Date.now();
        if (st.currentPlayerIndex !== _wdLastIdx) {
          // Индекс изменился — всё нормально, сбрасываем таймер
          _wdLastIdx = st.currentPlayerIndex;
          _wdLastChange = now;
          return;
        }

        if (now - _wdLastChange > WATCHDOG_HANG_MS) {
          // Зависание! Только хост реагирует
          const myName = (localStorage.getItem('belka_player_name') || 'Игрок').trim();
          const firstHuman = st.players.find((p: Player) => !p.isBot);
          if (firstHuman?.name.trim() !== myName) return;

          _wdLastChange = now; // Сбрасываем, чтобы не спамить

          const stuckPlayer = st.players[st.currentPlayerIndex];

          if (!stuckPlayer?.isBot && st.table.length < 4) {
            // AFK человек — играем за него лучшую карту
            get().addLog(
              `⚠️ Watchdog: AFK [${st.currentPlayerIndex}] ${stuckPlayer?.name} → авто-ход`
            );
            set({ lastError: { message: `⚠️ ${stuckPlayer?.name} AFK — авто-ход`, id: Date.now() } });
            const best = getBestBotMove(
              stuckPlayer.hand, st.table, st.trumpSuit, st.playedSuits || []
            );
            if (best) get().playCard(st.currentPlayerIndex, best.id);
          } else {
            // Стол завис или бот не ходит — forceSync
            get().addLog(
              `⚠️ Watchdog: зависание (player=${st.currentPlayerIndex}, table=${st.table.length}) → forceSync`
            );
            set({ lastError: { message: '⚠️ Зависание — автовосстановление...', id: Date.now() } });
            get().forceSync();
          }
        }
      }, 3000);
      // Сохраняем интервал глобально чтобы при необходимости можно было очистить
      (window as any)._belkaWatchdog = watchdogInterval;
      // ─────────────────────────────────────────────────────────────────────

      onValue(stateRef, (snapshot) => {
        const remoteState = snapshot.val();
        if (remoteState) {
          const current = get();
          
          // Нормализуем данные, так как Firebase удаляет пустые массивы
          const normalizedPlayers = remoteState.players ? remoteState.players.map((p: any) => ({
            ...p,
            hand: p.hand || []
          })) : [];

          const normalizedState = {
            ...remoteState,
            players: normalizedPlayers,
            table: remoteState.table || [],
            playedSuits: remoteState.playedSuits || [],
            spectators: remoteState.spectators || [],
            readyPlayers: remoteState.readyPlayers || {},
            roundTricks: remoteState.roundTricks || [],
            matchRoundNumber: typeof remoteState.matchRoundNumber === 'number' ? remoteState.matchRoundNumber : 0,
            learningGameId: typeof remoteState.learningGameId === 'string' ? remoteState.learningGameId : roomId || '',
            dealerIndex: typeof remoteState.dealerIndex === 'number' ? remoteState.dealerIndex : 0,
          };
          if (normalizedState.readyPlayers._init) {
             normalizedState.readyPlayers = {};
          }

          // Notifications logic
          if (current.players && current.players.length > 0 && normalizedState.players) {
             const oldSpecs = current.spectators || [];
             const newSpecs = normalizedState.spectators;
             newSpecs.forEach((ns: { id: string, name: string }) => {
                if (!oldSpecs.some((os: { id: string, name: string }) => os.id === ns.id)) {
                   if (ns.name !== cleanName) {
                      set({ lastError: { message: `👁️ ${ns.name} наблюдает за игрой`, id: Date.now() + Math.random() } });
                   }
                }
             });
             
             normalizedState.players.forEach((rp: Player, i: number) => {
                const cp = current.players[i];
                if (rp && cp && !rp.isBot && cp.isBot) {
                   if (rp.name !== cleanName) {
                      const myTeam = current.myPlayerIndex !== -1 ? current.players[current.myPlayerIndex].team : null;
                      if (myTeam !== null) {
                         if (rp.team === myTeam) {
                            set({ lastError: { message: `🤝 ${rp.name} сел(а) за вашу команду`, id: Date.now() + Math.random() } });
                         } else {
                            set({ lastError: { message: `⚔️ ${rp.name} сел(а) за команду противников`, id: Date.now() + Math.random() } });
                         }
                      } else {
                         set({ lastError: { message: `🎮 ${rp.name} сел(а) за Команду ${rp.team === 0 ? 'А' : 'Б'}`, id: Date.now() + Math.random() } });
                      }
                   }
                }
             });
          }

          // Авто-подхват слота при заходе
          if (current.myPlayerIndex === -1 && normalizedState.players) {
             const seatedIdx = normalizedState.players.findIndex((p: Player) => p.name?.trim() === cleanName && !p.isBot);
             if (seatedIdx !== -1) set({ myPlayerIndex: seatedIdx });
          }
          
          if (normalizedState.phase === 'PLAYING') isResetting = false;
          set(normalizedState);

          // Хост запускает новый раунд, если все готовы
          const firstHuman = normalizedState.players.find((p: any) => !p.isBot);
          if (normalizedState.phase === 'ROUND_OVER' && firstHuman?.name?.trim() === cleanName) {
            const readyCount = Object.keys(normalizedState.readyPlayers || {}).filter(k => k !== '_init').length;
            if (readyCount === 4 && !isResetting && (!normalizedState.votingState || normalizedState.votingState.result)) {
               isResetting = true;
               const delay = get().isTurboMode ? 50 : 500;
               setTimeout(() => {
                 const currentSt = get();
                 if (currentSt.phase === 'ROUND_OVER') currentSt.resetRound();
               }, delay);
            }
          }

          // Хост управляет ботами в мультиплеере
          if (normalizedState.phase === 'PLAYING' && normalizedState.creatorName?.trim() === cleanName) {
            const cpIdx = normalizedState.currentPlayerIndex;
            if (cpIdx !== undefined && cpIdx !== -1) {
              const currentPlayer = normalizedState.players[cpIdx];
              if (currentPlayer?.isBot && get().aiRecoveryPlayerIndex !== cpIdx) {
                if (botTimeout) clearTimeout(botTimeout);
                botTimeout = setTimeout(() => {
                  const st = get();
                  if (st.aiRecoveryPlayerIndex === cpIdx) return;
                  const currentTable = st.table || [];
                  // Фикс #3: убрали currentTable.length < 4 — бот должен ходить даже если стол только что очистился после взятки
                  if (st.phase === 'PLAYING' && st.currentPlayerIndex === cpIdx && st.players[cpIdx].isBot) {
                    void get().executeBotTurn(cpIdx);
                  }
                }, 1500);
              }
            }
          }
        }
      });

      if (myIndex === 0) {
        const players: Player[] = [
          { id: 0, name: cleanName, hand: [], team: 0, isBot: false },
          { id: 1, name: 'Бот 1', hand: [], team: 1, isBot: true },
          { id: 2, name: 'Бот 2', hand: [], team: 0, isBot: true },
          { id: 3, name: 'Бот 3', hand: [], team: 1, isBot: true },
        ];

        firebaseDbSet(stateRef, {
          players,
          phase: 'LOBBY',
          scores: [0, 0],
          eyes: [0, 0],
          isFirstRound: true,
          eggsCount: 0,
          spectators: [],
          readyPlayers: { 0: true },
          table: [],
          playedSuits: [],
          creatorName: cleanName,
          roundTricks: [],
          matchRoundNumber: 0,
          learningGameId: roomId,
          dealerIndex: 0,
        });
      } else {
        // Добавляем в зрители только если игрока реально нет в слотах
        setTimeout(() => {
          const state = get();
          const isSeated = state.players.some(p => p.name?.trim() === cleanName && !p.isBot);
          const isKnownSpectator = state.spectators.some(s => s.name?.trim() === cleanName);
          
          if (!isSeated && !isKnownSpectator) {
            const newSpecs = [...state.spectators, { id: cleanName, name: cleanName }];
            firebaseUpdate(ref(db, `rooms/${roomId}/state`), { spectators: newSpecs });
          }
        }, 2000); // Чуть дольше ждем первого snapshot
      }
    } else {
      // Одиночная игра
      const deck = shuffleDeck(createDeck());
      const hands = dealCards(deck);
      const dealerIdx = 0;
      const jackHolderIndex = findJackHolderIndex(hands);
      const firstPlayerIndex = getFirstPlayerIndexLeftOfDealer(dealerIdx);
      const suitOrder: Suit[] = ['CLUBS', 'HEARTS', 'SPADES', 'DIAMONDS'];
      const mapping: Record<number, Suit> = {};
      for (let i = 0; i < 4; i++) mapping[(jackHolderIndex + i) % 4] = suitOrder[i];
      const players: Player[] = [
        { id: 0, name: cleanName, hand: sortHand(hands[0], 'CLUBS'), team: 0, isBot: false },
        { id: 1, name: 'Бот 1', hand: sortHand(hands[1], 'CLUBS'), team: 1, isBot: true },
        { id: 2, name: 'Бот 2', hand: sortHand(hands[2], 'CLUBS'), team: 0, isBot: true },
        { id: 3, name: 'Бот 3', hand: sortHand(hands[3], 'CLUBS'), team: 1, isBot: true },
      ];
      resetLearningPersistence();
      resetAiFallbackWarn();
      const learningGameId = `local-${Date.now()}`;
      set({
        players,
        dealerIndex: dealerIdx,
        currentPlayerIndex: firstPlayerIndex,
        firstPlayerInTrick: firstPlayerIndex,
        trumpSuit: 'CLUBS',
        trumpSetterTeam: jackHolderIndex % 2 === 0 ? 0 : 1,
        phase: 'PLAYING',
        table: [],
        scores: [0, 0],
        eyes: [0, 0],
        isFirstRound: true,
        lastTrickWinnerIndex: null,
        playedSuits: [],
        isMultiplayer: false,
        myPlayerIndex: 0,
        trumpMapping: mapping,
        eggsCount: 0,
        readyPlayers: {},
        spectators: [],
        creatorName: cleanName,
        roundTricks: [],
        matchRoundNumber: 0,
        learningGameId,
        aiRecoveryPlayerIndex: null,
        aiRecoveryFailedPolls: 0,
      });

      // Если в одиночной игре первый ход у бота — запускаем его
      if (firstPlayerIndex !== 0) {
        const delay = get().isTurboMode ? 0 : 1000;
        setTimeout(() => {
          void get().executeBotTurn(firstPlayerIndex);
        }, delay);
      }
    }
  },

  takeSlot: (slotIndex) => {
    const state = get();
    if (!state.roomId) return;
    const rawName = localStorage.getItem('belka_player_name') || 'Игрок';
    const cleanName = rawName.trim();
    const newPlayers = [...state.players];
    const newReady = { ...state.readyPlayers };
    
    if (state.myPlayerIndex !== -1) {
      newPlayers[state.myPlayerIndex] = { ...newPlayers[state.myPlayerIndex], name: `Бот ${state.myPlayerIndex}`, isBot: true };
      delete newReady[state.myPlayerIndex];
    }
    newPlayers[slotIndex] = { ...newPlayers[slotIndex], name: cleanName, isBot: false };
    const newSpecs = state.spectators.filter(s => s.name?.trim() !== cleanName);

    set({ myPlayerIndex: slotIndex });
    firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), { players: newPlayers, spectators: newSpecs, readyPlayers: newReady });
  },

  toggleLobbyReady: () => {
    const state = get();
    if (state.phase !== 'LOBBY' || !state.roomId || state.myPlayerIndex === -1) return;
    const newReady = { ...state.readyPlayers, [state.myPlayerIndex]: !state.readyPlayers[state.myPlayerIndex] };
    firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), { readyPlayers: newReady });
  },

  startGame: () => {
    const state = get();
    const myName = localStorage.getItem('belka_player_name')?.trim();
    if (state.creatorName?.trim() !== myName || !state.roomId) return;
    const humansSeated = state.players.filter(p => !p.isBot);
    const allReady = humansSeated.every(p => state.readyPlayers[p.id]);
    if (!allReady) {
      set({ lastError: { message: 'Не все игроки готовы!', id: Date.now() } });
      return;
    }
    const deck = shuffleDeck(createDeck());
    const hands = dealCards(deck);
    const dealerIdx = 0;
    const jackHolderIndex = findJackHolderIndex(hands);
    const firstPlayerIndex = getFirstPlayerIndexLeftOfDealer(dealerIdx);
    const suitOrder: Suit[] = ['CLUBS', 'HEARTS', 'SPADES', 'DIAMONDS'];
    const mapping: Record<number, Suit> = {};
    for (let i = 0; i < 4; i++) mapping[(jackHolderIndex + i) % 4] = suitOrder[i];
    const finalPlayers = state.players.map((p, i) => ({ ...p, hand: sortHand(hands[i], 'CLUBS') }));
    firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), {
      players: finalPlayers,
      phase: 'PLAYING',
      dealerIndex: dealerIdx,
      currentPlayerIndex: firstPlayerIndex,
      firstPlayerInTrick: firstPlayerIndex,
      trumpSuit: 'CLUBS',
      trumpSetterTeam: jackHolderIndex % 2 === 0 ? 0 : 1,
      trumpMapping: mapping,
      readyPlayers: { _init: true },
      roundTricks: [],
      matchRoundNumber: 0,
      learningGameId: state.roomId || '',
    });
  },

  playCard: (playerIndex, cardId) => {
    const state = get();
    if (state.phase !== 'PLAYING' || playerIndex !== state.currentPlayerIndex) return;
    const player = state.players[playerIndex];
    if (!player) return;
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;
    const card = player.hand[cardIndex];

    get().addLog(`[${playerIndex}] ${player.name} походил ${card.rank} ${card.suit}`);

    const validation = validateMove(card, player.hand, state.table, state.trumpSuit, state.playedSuits);
    if (!validation.valid) {
      if (playerIndex === state.myPlayerIndex) set({ lastError: { message: validation.reason || 'Недопустимый ход', id: Date.now() } });
      return;
    }
    const newHand = [...player.hand];
    newHand.splice(cardIndex, 1);
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = { ...player, hand: newHand };
    const newTable = [...state.table, card];
    const newPlayedSuits = [...state.playedSuits];
    // Масть считается сыгранной только если с неё СДЕЛАЛИ ХОД (она первая на столе)
    if (state.table.length === 0 && !newPlayedSuits.includes(card.suit)) {
      newPlayedSuits.push(card.suit);
    }
    let nextState: Partial<GameState> = { players: newPlayers, table: newTable, playedSuits: newPlayedSuits };
    if (newTable.length === 4) {
      const firstCard = newTable[0];
      const winnerIndex = determineTrickWinner(newTable, state.firstPlayerInTrick, firstCard.suit, state.trumpSuit);
      const trickPoints = newTable.reduce((sum, c) => sum + CARD_POINTS[c.rank], 0);
      // Фикс #4: используем (p.hand || []) на случай если Firebase вернул undefined вместо []
      const isRoundOver = newPlayers.every(p => (p.hand || []).length === 0);
      nextState = { ...nextState, lastTrickWinnerIndex: winnerIndex, currentPlayerIndex: -1 };
      
      const delay = state.isTurboMode ? 100 : 3000;
      
      if ((window as any).belkaRoundTimer) clearTimeout((window as any).belkaRoundTimer);
      
      (window as any).belkaRoundTimer = setTimeout(() => {
        (window as any).belkaRoundTimer = null;
        
        // В мультиплеере первый живой игрок в списке берет на себя роль "судьи" (обработка взятки)
        const currentState = get();
        const myName = (localStorage.getItem('belka_player_name') || 'Игрок').trim();
        const firstHuman = currentState.players.find(p => !p.isBot);
        
        if (currentState.isMultiplayer && firstHuman?.name.trim() !== myName) return;
        get().addLog(`Судья ${myName} обрабатывает взятку...`);

        const winnerName = currentState.players[winnerIndex].name;
        const trickPoints = currentState.table.reduce((sum, c) => sum + CARD_POINTS[c.rank], 0);
        get().addLog(`[${winnerIndex}] ${winnerName} забрал взятку (+${trickPoints} очков)`);

        const winnerTeam = currentState.players[winnerIndex].team;
        const newScores: [number, number] = [...currentState.scores];
        newScores[winnerTeam] += trickPoints;

        const trickRecord: RoundTrickRecord = { cards: [...currentState.table], winnerIndex };
        const mergedRoundTricks = [...(currentState.roundTricks || []), trickRecord];
        const prevMatchRound = currentState.matchRoundNumber ?? 0;

        // Фикс #2: сохраняем winnerIndex вместо null, чтобы forceSync мог восстановить состояние
        let finalUpdate: Partial<GameState> = {
          table: [],
          scores: newScores,
          currentPlayerIndex: winnerIndex,
          firstPlayerInTrick: winnerIndex,
          lastTrickWinnerIndex: winnerIndex,
          readyPlayers: { _init: true } as GameState['readyPlayers'],
          roundTricks: mergedRoundTricks,
        };
        if (isRoundOver) {
          const currentEyes = [...currentState.eyes];
          const team0Points = newScores[0];
          const team1Points = newScores[1];
          let currentEggs = currentState.eggsCount || 0;

          if (team0Points === 60 && team1Points === 60) {
            currentEggs += 1;
            finalUpdate = {
              ...finalUpdate,
              eggsCount: currentEggs,
              phase: 'ROUND_OVER',
              isFirstRound: false,
              matchRoundNumber: prevMatchRound + 1,
            };
          } else {
            const wTeam = (team0Points > team1Points ? 0 : 1) as 0 | 1;
            const loserPoints = wTeam === 0 ? team1Points : team0Points;
            const winnerPoints = wTeam === 0 ? team0Points : team1Points;

            const eyeOutcome = computeRoundEndEyesOutcome(
              currentEyes as [number, number],
              currentEggs,
              wTeam,
              loserPoints,
              winnerPoints,
              currentState.isFirstRound
            );
            if (winnerPoints === 120) {
              get().addLog('Шапан 120 — победитель сразу 12 глаз, матч окончен');
            }

            finalUpdate = {
              ...finalUpdate,
              eyes: eyeOutcome.eyes,
              eggsCount: eyeOutcome.eggsCount,
              phase: eyeOutcome.phase,
              isFirstRound: false,
              readyPlayers: { _init: true },
              roundEndTime: null as unknown as number,
              matchRoundNumber: prevMatchRound + 1,
            };
          }
        }
        if (state.isMultiplayer) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), finalUpdate);
        else {
          set(finalUpdate);
          const st = get();
          if (st.phase === 'PLAYING' && st.currentPlayerIndex !== 0 && st.currentPlayerIndex !== -1) {
            const delay = st.isTurboMode ? 0 : 1000;
            setTimeout(() => {
              const currentSt = get();
              void get().executeBotTurn(currentSt.currentPlayerIndex);
            }, delay);
          }
        }
      }, state.isTurboMode ? 100 : 3000);
    } else { 
      nextState.currentPlayerIndex = (state.currentPlayerIndex + 1) % 4; 
      const nextName = state.players[nextState.currentPlayerIndex].name;
      get().addLog(`Очередь игрока [${nextState.currentPlayerIndex}]: ${nextName}`);
    }
    
    const { isMultiplayer, roomId, isTurboMode } = get();
    
    if (isMultiplayer) { 
      firebaseUpdate(ref(db, `rooms/${roomId}/state`), nextState); 
    } else {
      set(nextState);
      // В одиночной игре проверяем, не ход ли сейчас бота
      const st = get();
      // Фикс #1: убрали st.table.length < 4 — бот должен ходить даже после очистки стола
      if (st.phase === 'PLAYING' && st.currentPlayerIndex !== 0 && st.currentPlayerIndex !== -1) {
        const delay = st.isTurboMode ? 0 : 1000;
        setTimeout(() => {
          const currentSt = get();
          if (currentSt.currentPlayerIndex === st.currentPlayerIndex) {
            void get().executeBotTurn(currentSt.currentPlayerIndex);
          }
        }, delay);
      }
    }
  },

  submitVote: (vote) => {
    const state = get();
    if (!state.votingState) return;
    const newVotes = { ...state.votingState.votes, [state.myPlayerIndex]: vote };
    const teamPlayers = state.players.filter(p => p.team === state.votingState?.team).map(p => p.id);
    const hasAllVotes = teamPlayers.every(id => newVotes[id] !== undefined);
    let finalUpdate: Partial<GameState> = { votingState: { ...state.votingState, votes: newVotes } };
    if (hasAllVotes) {
      const votes = teamPlayers.map(id => newVotes[id]);
      let result: 'TAKE' | 'HANG' = votes[0] === votes[1] ? votes[0] : (Math.random() > 0.5 ? 'TAKE' : 'HANG');
      const newEyes = [...state.eyes];
      let newEggs = 0;
      if (result === 'TAKE') { newEyes[state.votingState.team] += state.eggsCount; newEggs = 0; }
      else { newEggs = state.eggsCount; }
      finalUpdate = { eyes: newEyes as [number, number], eggsCount: newEggs, votingState: { ...state.votingState, votes: newVotes, result }, phase: newEyes[0] >= 12 || newEyes[1] >= 12 ? 'GAME_OVER' : 'ROUND_OVER' };
    }
    if (state.isMultiplayer) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), finalUpdate);
    else set(finalUpdate);
  },

  setReady: (playerIndex) => {
    const state = get();
    if (state.readyPlayers[playerIndex]) return;

    const newReady = { ...state.readyPlayers, [playerIndex]: true };
    if (!state.isMultiplayer) {
      [1, 2, 3].forEach(id => newReady[id] = true);
    } else {
      state.players.forEach(p => {
        if (p.isBot) newReady[p.id] = true;
      });
    }
    
    let nextState: Partial<GameState> = { readyPlayers: newReady };
    const readyCount = Object.keys(newReady).filter(k => k !== '_init').length;
    
    if (readyCount === 1 && !state.roundEndTime) nextState.roundEndTime = Date.now() + 15000;
    
    if (readyCount === 4) { 
      if (!state.isMultiplayer) {
        get().resetRound(); 
        return; 
      }
    }
    
    if (state.isMultiplayer) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), nextState);
    else set(nextState);
  },

  resetRound: () => {
    const state = get();
    // Разрешаем сброс ТОЛЬКО в фазе ROUND_OVER. 
    // Если игра окончена (GAME_OVER), сбрасывать автоматически нельзя!
    if (state.isMultiplayer && state.phase !== 'ROUND_OVER') return;

    // Очищаем все таймеры перед началом нового раунда
    if ((window as any).belkaRoundTimer) {
      clearTimeout((window as any).belkaRoundTimer);
      (window as any).belkaRoundTimer = null;
    }

    const deck = shuffleDeck(createDeck());
    const hands = dealCards(deck);
    const jackHolderIndex = findJackHolderIndex(hands);
    const nextDealerIndex = (state.dealerIndex + 1) % 4;
    const firstPlayerIndex = getFirstPlayerIndexLeftOfDealer(nextDealerIndex);
    const nextTrumpSuit = state.trumpMapping ? state.trumpMapping[jackHolderIndex] : 'CLUBS';
    const newPlayers = state.players.map((p, i) => ({ ...p, hand: sortHand(hands[i], nextTrumpSuit) }));
    const nextState: Partial<GameState> = {
      players: newPlayers,
      dealerIndex: nextDealerIndex,
      table: [],
      scores: [0, 0],
      phase: 'PLAYING',
      currentPlayerIndex: firstPlayerIndex,
      firstPlayerInTrick: firstPlayerIndex,
      lastTrickWinnerIndex: null, // Фикс #2: обнуляем только здесь — при старте нового раунда
      playedSuits: [],
      lastError: null,
      trumpSuit: nextTrumpSuit,
      trumpSetterTeam: jackHolderIndex % 2 === 0 ? 0 : 1,
      votingState: null as unknown as GameState['votingState'],
      readyPlayers: { _init: true }, // Используем заглушку, чтобы Firebase не удалял пустой объект
      roundEndTime: null as unknown as number,
      roundTricks: [],
    };
    if (state.isMultiplayer && state.creatorName?.trim() === localStorage.getItem('belka_player_name')?.trim()) {
      firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), nextState);
    } else if (!state.isMultiplayer) {
      set({ ...nextState, readyPlayers: {} });
      if (firstPlayerIndex !== 0) {
        const delay = state.isTurboMode ? 0 : 1000;
        setTimeout(() => {
          void get().executeBotTurn(firstPlayerIndex);
        }, delay);
      }
    }
  },

  executeBotTurn: async (playerIndex) => {
    const aiLog =
      import.meta.env.DEV || import.meta.env.VITE_AI_DEBUG === '1'
        ? (...a: unknown[]) => console.log('[BelkaAI:bot]', ...a)
        : () => {};

    const state = get();
    if (state.aiRecoveryPlayerIndex === playerIndex) {
      aiLog('skip: идёт фоновое восстановление bot-move');
      return;
    }
    if (state.phase !== 'PLAYING') {
      aiLog('skip: phase', state.phase);
      return;
    }
    if (state.currentPlayerIndex !== playerIndex) {
      aiLog('skip: не тот игрок', { want: playerIndex, current: state.currentPlayerIndex });
      return;
    }
    const player = state.players[playerIndex];
    if (!player?.isBot) {
      aiLog('skip: не бот', playerIndex);
      return;
    }
    const hand = player.hand || [];
    if (hand.length === 0) {
      aiLog('skip: пустая рука');
      return;
    }
    if (state.table.length >= 4) {
      aiLog('skip: стол полный');
      return;
    }

    const tryAi = state.aiEnabled && isAiApiConfigured();
    aiLog('tryAi=', tryAi, 'aiEnabled=', state.aiEnabled, 'api=', getAiApiBase() || '(нет VITE_API_URL)');

    const playEngineMove = () => {
      const st = get();
      if (st.currentPlayerIndex !== playerIndex || st.phase !== 'PLAYING') return;
      const p = st.players[playerIndex];
      const h = p?.hand || [];
      const legal = getLegalCardIds(h, st.table, st.trumpSuit, st.playedSuits || []);
      if (legal.length === 0) {
        get().addLog('🤖 Бот: нет легальных ходов');
        return;
      }
      const best = getBestBotMove(h, st.table, st.trumpSuit, st.playedSuits || []);
      if (best && legal.includes(best.id)) {
        get().playCard(playerIndex, best.id);
        aiLog('playCard engine', best.id);
      }
    };

    const legalIds = getLegalCardIds(
      hand,
      state.table,
      state.trumpSuit,
      state.playedSuits || []
    );
    if (legalIds.length === 0) {
      aiLog('нет легальных ходов');
      get().addLog('🤖 Бот: нет легальных ходов');
      return;
    }

    if (!tryAi) {
      aiLog('бэк не настроен в сборке или AI выключен — ход движком (GitHub Pages без VITE_API_URL)');
      if (!warnedAiFallbackLogged) {
        warnedAiFallbackLogged = true;
        if (!state.aiEnabled) {
          get().addLog(
            '🤖 Запросов к AI нет: нейроботы выключены (иконка в меню) — работает локальная логика.'
          );
        } else {
          get().addLog(
            '🤖 Запросов к AI нет: в бандле пустой VITE_API_URL — задай BELKA_API_URL в GitHub Actions при сборке и передеплой; сейчас бот ходит локальным движком. В консоли нет [BelkaAI]: в CI добавь VITE_AI_DEBUG=1 для отладки.'
          );
        }
      }
      playEngineMove();
      return;
    }

    set({ aiThinking: true });
    try {
      const ok = await attemptAiMoveOrFalse(playerIndex);
      if (ok) {
        aiLog('playCard AI ok');
      } else {
        console.warn('[executeBotTurn] AI failed or invalid response — recovery mode');
        aiLog('вход в режим восстановления');
        get().addLog('🤖 Не удалось получить ход ИИ — ждём ответ сервиса, партия на паузе');
        set({ aiRecoveryPlayerIndex: playerIndex, aiRecoveryFailedPolls: 0 });
      }
    } finally {
      set({ aiThinking: false });
    }
  },

  persistLearningRoundIfJudge: async () => {
    const state = get();
    if (state.phase !== 'ROUND_OVER' && state.phase !== 'GAME_OVER') return;
    if (!isAiApiConfigured()) return;
    const myName = (localStorage.getItem('belka_player_name') || 'Игрок').trim();
    const firstHuman = state.players.find((p) => !p.isBot);
    if ((firstHuman?.name ?? '').trim() !== myName) return;

    const rn = state.matchRoundNumber;
    if (rn === lastPersistedLearningRound || rn <= 0) return;

    let winner_team: 0 | 1 = 0;
    if (state.scores[1] > state.scores[0]) winner_team = 1;
    else if (state.scores[0] === state.scores[1]) winner_team = 0;

    try {
      await saveGameToAiBackend({
        gameId: state.learningGameId || state.roomId || 'local',
        roundNumber: rn,
        players: state.players.map((p) => p.name),
        playerSeats: state.players.map((p) => ({
          name: p.name,
          team: p.team,
          is_bot: !!p.isBot,
        })),
        team_1_score: state.scores[0],
        team_2_score: state.scores[1],
        winner_team,
        trump_suit: state.trumpSuit ?? 'CLUBS',
        eyes: [...state.eyes] as [number, number],
        tricks: (state.roundTricks || []).map((t) => ({
          cards: t.cards.map((c) => c.id),
          winnerIndex: t.winnerIndex,
        })),
      });
      // Эндпоинт может выполняться долго — не блокируем UI
      void postAnalyzeGames().catch((e) =>
        console.warn('[persistLearningRoundIfJudge] analyze-games', e)
      );
      if (import.meta.env.DEV || import.meta.env.VITE_AI_DEBUG === '1') {
        console.log('[BelkaAI] save-game ок, analyze-games отправлен', { round: rn, phase: state.phase });
      }
      lastPersistedLearningRound = rn;
    } catch (e) {
      console.warn('[persistLearningRoundIfJudge] save-game', e);
    }
  },

  updateFromRemote: (newState) => set(newState),

  toggleAutoPlay: () => set(state => ({ isAutoPlay: !state.isAutoPlay })),

  forceSync: () => {
    const state = get();
    const firstHuman = state.players.find(p => !p.isBot);
    const myName = (localStorage.getItem('belka_player_name') || 'Игрок').trim();
    if (firstHuman?.name.trim() !== myName) {
      set({ lastError: { message: "Только Хост может делать синхронизацию", id: Date.now() } });
      return;
    }

    get().addLog("🔄 Принудительная синхронизация...");

    // ── Хелпер: подсчёт очков и переход в ROUND_OVER / GAME_OVER ──────────
    const resolveRoundOver = (scores: [number, number]): Partial<GameState> => {
      const currentEyes = [...state.eyes] as [number, number];
      const [team0Points, team1Points] = scores;
      let currentEggs = state.eggsCount || 0;
      const nextMatchRound = (state.matchRoundNumber ?? 0) + 1;

      if (team0Points === 60 && team1Points === 60) {
        currentEggs += 1;
        return {
          scores,
          eggsCount: currentEggs,
          phase: 'ROUND_OVER',
          isFirstRound: false,
          readyPlayers: { _init: true } as GameState['readyPlayers'],
          matchRoundNumber: nextMatchRound,
        };
      }

      const wTeam = (team0Points > team1Points ? 0 : 1) as 0 | 1;
      const loserPoints = wTeam === 0 ? team1Points : team0Points;
      const winnerPoints = wTeam === 0 ? team0Points : team1Points;
      const eyeOutcome = computeRoundEndEyesOutcome(
        currentEyes,
        currentEggs,
        wTeam,
        loserPoints,
        winnerPoints,
        state.isFirstRound
      );
      return {
        scores,
        eyes: eyeOutcome.eyes,
        eggsCount: eyeOutcome.eggsCount,
        phase: eyeOutcome.phase,
        isFirstRound: false,
        readyPlayers: { _init: true } as GameState['readyPlayers'],
        roundEndTime: null as unknown as number,
        matchRoundNumber: nextMatchRound,
      };
    };
    // ──────────────────────────────────────────────────────────────────────

    // Случай 1: стол полный (4 карты), взятка не была разыграна
    if (state.table.length === 4) {
      const leadSuit = state.table[0].suit;
      const winnerIndex = determineTrickWinner(state.table, state.firstPlayerInTrick, leadSuit, state.trumpSuit || 'CLUBS');
      const trickPoints = state.table.reduce((sum, c) => sum + CARD_POINTS[c.rank], 0);
      const newScores: [number, number] = [...state.scores];
      newScores[state.players[winnerIndex].team] += trickPoints;

      const trickSnap: RoundTrickRecord = { cards: [...state.table], winnerIndex };
      const mergedTricks = [...(state.roundTricks || []), trickSnap];

      // Были ли это последние карты?
      const isRoundOver = state.players.every(p => (p.hand || []).length === 0);
      let finalUpdate: Partial<GameState>;
      if (isRoundOver) {
        get().addLog(`🔄 forceSync: последняя взятка → ROUND_OVER`);
        finalUpdate = {
          table: [],
          currentPlayerIndex: winnerIndex,
          firstPlayerInTrick: winnerIndex,
          lastTrickWinnerIndex: winnerIndex,
          roundTricks: mergedTricks,
          ...resolveRoundOver(newScores),
        };
      } else {
        finalUpdate = {
          table: [],
          scores: newScores,
          currentPlayerIndex: winnerIndex,
          firstPlayerInTrick: winnerIndex,
          lastTrickWinnerIndex: winnerIndex,
          readyPlayers: { _init: true } as GameState['readyPlayers'],
          roundTricks: mergedTricks,
        };
      }

      if (state.isMultiplayer) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), finalUpdate);
      else set(finalUpdate);
      return;
    }

    // Случай 2: currentPlayerIndex застрял на -1
    if (state.currentPlayerIndex === -1) {
      const winnerIndex = state.lastTrickWinnerIndex !== null ? state.lastTrickWinnerIndex : 0;
      if (state.isMultiplayer) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), { currentPlayerIndex: winnerIndex });
      else set({ currentPlayerIndex: winnerIndex });
      return;
    }

    // Случай 3 (аварийный): фаза PLAYING, но все руки пусты — пропущен переход в ROUND_OVER
    if (state.phase === 'PLAYING' && state.players.length === 4 && state.players.every(p => (p.hand || []).length === 0)) {
      get().addLog(`🔄 forceSync: пустые руки в PLAYING → принудительный ROUND_OVER`);
      const finalUpdate: Partial<GameState> = {
        currentPlayerIndex: state.lastTrickWinnerIndex ?? 0,
        firstPlayerInTrick: state.lastTrickWinnerIndex ?? 0,
        roundTricks: state.roundTricks || [],
        ...resolveRoundOver(state.scores),
      };
      if (state.isMultiplayer) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), finalUpdate);
      else set(finalUpdate);
      return;
    }

    // Случай 4: обычный пинг Firebase, чтобы разбудить onValue (запустит бота)
    if (state.isMultiplayer) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), { _sync: Date.now() });
  },

  leaveGame: () => {
    aiRecoveryFetchInFlight = false;
    const watchdog = (window as any)._belkaWatchdog;
    if (watchdog) {
      clearInterval(watchdog);
      (window as any)._belkaWatchdog = null;
    }
    resetLearningPersistence();
    resetAiFallbackWarn();
    set({
      phase: 'LOBBY',
      roomId: null,
      isMultiplayer: false,
      players: [],
      table: [],
      logs: [],
      roundTricks: [],
      matchRoundNumber: 0,
      learningGameId: '',
      aiThinking: false,
      aiRecoveryPlayerIndex: null,
      aiRecoveryFailedPolls: 0,
      dealerIndex: 0,
    });
  },

  retryAiBotMoveFromRecovery: async () => {
    if (aiRecoveryFetchInFlight) return;
    const idx = get().aiRecoveryPlayerIndex;
    if (idx === null) return;
    const st = get();
    if (st.phase !== 'PLAYING' || st.currentPlayerIndex !== idx || !st.players[idx]?.isBot) {
      set({ aiRecoveryPlayerIndex: null, aiRecoveryFailedPolls: 0 });
      return;
    }
    aiRecoveryFetchInFlight = true;
    set({ aiThinking: true });
    try {
      const ok = await attemptAiMoveOrFalse(idx);
      if (ok) {
        set({ aiRecoveryPlayerIndex: null, aiRecoveryFailedPolls: 0 });
        get().addLog('🤖 Связь с ИИ восстановлена — ход принят');
      } else {
        set((s) => ({ aiRecoveryFailedPolls: s.aiRecoveryFailedPolls + 1 }));
      }
    } finally {
      aiRecoveryFetchInFlight = false;
      set({ aiThinking: false });
    }
  },
};
});
