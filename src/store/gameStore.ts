import { create } from 'zustand';
import { GameState, Card, Suit, Player, CARD_POINTS } from '../core/types';
import { createDeck, shuffleDeck, dealCards, isTrump, determineTrickWinner, validateMove, sortHand, getBestBotMove } from '../core/engine';
import { db } from '../firebase';
import { ref, update as firebaseUpdate, onValue, set as firebaseDbSet } from 'firebase/database';

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
  logs: string[];
}

export const useGameStore = create<GameStore>((set, get) => ({
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

  addLog: (msg: string) => {
    console.log(`[BELKA GAME]: ${msg}`);
    set(state => ({ logs: [msg, ...state.logs].slice(0, 10) }));
  },

  toggleTurboMode: () => set(state => ({ isTurboMode: !state.isTurboMode })),

  initGame: (roomId, myIndex, name = 'Игрок') => {
    const cleanName = name.trim();
    if (roomId) {
      set({ isMultiplayer: true, roomId, myPlayerIndex: myIndex ?? -1 });
      const stateRef = ref(db, `rooms/${roomId}/state`);
      let isResetting = false;
      let botTimeout: ReturnType<typeof setTimeout> | null = null;
      let roundEndTimeout: ReturnType<typeof setTimeout> | null = null;

      // ── Watchdog ──────────────────────────────────────────────────────────
      // Следит за currentPlayerIndex каждые 3 сек.
      // Если индекс не менялся > 8 сек во время PLAYING — хост делает forceSync.
      let _wdLastIdx: number | null = null;
      let _wdLastChange = Date.now();
      const WATCHDOG_HANG_MS = 8000;

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

          get().addLog(
            `⚠️ Watchdog: зависание (player=${st.currentPlayerIndex}, table=${st.table.length}) → forceSync`
          );
          set({ lastError: { message: '⚠️ Зависание — автовосстановление...', id: Date.now() } });

          _wdLastChange = now; // Сбрасываем, чтобы не спамить forceSync
          get().forceSync();
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
            readyPlayers: remoteState.readyPlayers || {}
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
              if (currentPlayer?.isBot) {
                if (botTimeout) clearTimeout(botTimeout);
                botTimeout = setTimeout(() => {
                  const st = get();
                  const currentTable = st.table || [];
                  // Фикс #3: убрали currentTable.length < 4 — бот должен ходить даже если стол только что очистился после взятки
                  if (st.phase === 'PLAYING' && st.currentPlayerIndex === cpIdx && st.players[cpIdx].isBot) {
                    const best = getBestBotMove(st.players[cpIdx].hand, currentTable, st.trumpSuit, st.playedSuits || []);
                    if (best) get().playCard(cpIdx, best.id);
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
          players, phase: 'LOBBY', scores: [0, 0], eyes: [0, 0], isFirstRound: true,
          eggsCount: 0, spectators: [], readyPlayers: { 0: true }, table: [],
          playedSuits: [], creatorName: cleanName
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
      let starterIndex = 0;
      hands.forEach((hand, idx) => { if (hand.some(c => c.id === 'CLUBS_JACK')) starterIndex = idx; });
      const suitOrder: Suit[] = ['CLUBS', 'HEARTS', 'SPADES', 'DIAMONDS'];
      const mapping: Record<number, Suit> = {};
      for (let i = 0; i < 4; i++) mapping[(starterIndex + i) % 4] = suitOrder[i];
      const players: Player[] = [
        { id: 0, name: cleanName, hand: sortHand(hands[0], 'CLUBS'), team: 0, isBot: false },
        { id: 1, name: 'Бот 1', hand: sortHand(hands[1], 'CLUBS'), team: 1, isBot: true },
        { id: 2, name: 'Бот 2', hand: sortHand(hands[2], 'CLUBS'), team: 0, isBot: true },
        { id: 3, name: 'Бот 3', hand: sortHand(hands[3], 'CLUBS'), team: 1, isBot: true },
      ];
      set({
        players, currentPlayerIndex: starterIndex, firstPlayerInTrick: starterIndex,
        trumpSuit: 'CLUBS', trumpSetterTeam: starterIndex % 2 === 0 ? 0 : 1, phase: 'PLAYING',
        table: [], scores: [0, 0], eyes: [0, 0], isFirstRound: true, lastTrickWinnerIndex: null,
        playedSuits: [], isMultiplayer: false, myPlayerIndex: 0, trumpMapping: mapping,
        eggsCount: 0, readyPlayers: {}, spectators: [], creatorName: cleanName
      });

      // Если в одиночной игре первый ход у бота — запускаем его
      if (starterIndex !== 0) {
        const delay = get().isTurboMode ? 0 : 1000;
        setTimeout(() => {
          const st = get();
          const best = getBestBotMove(st.players[starterIndex].hand, [], st.trumpSuit, st.playedSuits);
          if (best) get().playCard(starterIndex, best.id);
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
    let starterIndex = 0;
    hands.forEach((hand, idx) => { if (hand.some(c => c.id === 'CLUBS_JACK')) starterIndex = idx; });
    const suitOrder: Suit[] = ['CLUBS', 'HEARTS', 'SPADES', 'DIAMONDS'];
    const mapping: Record<number, Suit> = {};
    for (let i = 0; i < 4; i++) mapping[(starterIndex + i) % 4] = suitOrder[i];
    const finalPlayers = state.players.map((p, i) => ({ ...p, hand: sortHand(hands[i], 'CLUBS') }));
    firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), {
      players: finalPlayers, phase: 'PLAYING', currentPlayerIndex: starterIndex,
      firstPlayerInTrick: starterIndex, trumpSuit: 'CLUBS', trumpSetterTeam: starterIndex % 2 === 0 ? 0 : 1, trumpMapping: mapping,
      readyPlayers: { _init: true },
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
    if (newTable.length === 1 && !newPlayedSuits.includes(card.suit)) newPlayedSuits.push(card.suit);
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
        // Фикс #2: сохраняем winnerIndex вместо null, чтобы forceSync мог восстановить состояние
        let finalUpdate: Partial<GameState> = { table: [], scores: newScores, currentPlayerIndex: winnerIndex, firstPlayerInTrick: winnerIndex, lastTrickWinnerIndex: winnerIndex, readyPlayers: { _init: true } as any };
        if (isRoundOver) {
          const currentEyes = [...currentState.eyes];
          const team0Points = newScores[0];
          const team1Points = newScores[1];
          let currentEggs = currentState.eggsCount || 0;

          if (team0Points === 60 && team1Points === 60) { 
            currentEggs += 1;
            finalUpdate = { ...finalUpdate, eggsCount: currentEggs, phase: 'ROUND_OVER', isFirstRound: false }; 
          } else {
            const wTeam = team0Points > team1Points ? 0 : 1;
            const loserPoints = wTeam === 0 ? team1Points : team0Points;
            const winnerPoints = wTeam === 0 ? team0Points : team1Points;
            
            let eyesToAward = 1;

            if (currentState.isFirstRound) {
              // В первой раздаче всегда 2 глаза, если это не Шапан
              eyesToAward = winnerPoints === 120 ? 4 : 2;
            } else {
              // В обычных раундах: 1 за победу, 2 за голых (< 31), 4 за Шапан
              if (winnerPoints === 120) eyesToAward = 4;
              else if (loserPoints < 31) eyesToAward = 2;
              else eyesToAward = 1;
            }
            
            // Добавляем накопленные яйца
            let eyesTotal = eyesToAward + currentEggs;
            currentEyes[wTeam] = Math.min(12, currentEyes[wTeam] + eyesTotal);
            
            finalUpdate = { 
              ...finalUpdate, 
              eyes: currentEyes as [number, number], 
              eggsCount: 0,
              phase: currentEyes[wTeam] >= 12 ? 'GAME_OVER' : 'ROUND_OVER', 
              isFirstRound: false,
              readyPlayers: { _init: true },
              roundEndTime: null as any
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
              const best = getBestBotMove(currentSt.players[currentSt.currentPlayerIndex].hand, [], currentSt.trumpSuit, currentSt.playedSuits);
              if (best) get().playCard(currentSt.currentPlayerIndex, best.id);
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
            const best = getBestBotMove(currentSt.players[currentSt.currentPlayerIndex].hand, currentSt.table, currentSt.trumpSuit, currentSt.playedSuits);
            if (best) get().playCard(currentSt.currentPlayerIndex, best.id);
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
    let starterIndex = 0;
    hands.forEach((hand, idx) => { if (hand.some(c => c.id === 'CLUBS_JACK')) starterIndex = idx; });
    const nextTrumpSuit = state.trumpMapping ? state.trumpMapping[starterIndex] : 'CLUBS';
    const newPlayers = state.players.map((p, i) => ({ ...p, hand: sortHand(hands[i], nextTrumpSuit) }));
    const nextState: Partial<GameState> = {
      players: newPlayers, table: [], scores: [0, 0], phase: 'PLAYING',
      currentPlayerIndex: starterIndex, firstPlayerInTrick: starterIndex,
      lastTrickWinnerIndex: null, // Фикс #2: обнуляем только здесь — при старте нового раунда
      playedSuits: [], lastError: null,
      trumpSuit: nextTrumpSuit, trumpSetterTeam: starterIndex % 2 === 0 ? 0 : 1,
      votingState: null as any,
      readyPlayers: { _init: true }, // Используем заглушку, чтобы Firebase не удалял пустой объект
      roundEndTime: null as any,
    };
    if (state.isMultiplayer && state.creatorName?.trim() === localStorage.getItem('belka_player_name')?.trim()) {
      firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), nextState);
    } else if (!state.isMultiplayer) {
      set({ ...nextState, readyPlayers: {} });
      if (starterIndex !== 0) {
        const delay = state.isTurboMode ? 0 : 1000;
        setTimeout(() => { 
          const st = get(); 
          const best = getBestBotMove(st.players[starterIndex].hand, st.table, st.trumpSuit, st.playedSuits); 
          if (best) get().playCard(starterIndex, best.id); 
        }, delay);
      }
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

      if (team0Points === 60 && team1Points === 60) {
        currentEggs += 1;
        return { scores, eggsCount: currentEggs, phase: 'ROUND_OVER', isFirstRound: false, readyPlayers: { _init: true } as any };
      }

      const wTeam = team0Points > team1Points ? 0 : 1;
      const loserPoints  = wTeam === 0 ? team1Points : team0Points;
      const winnerPoints = wTeam === 0 ? team0Points : team1Points;
      let eyesToAward = 1;
      if (state.isFirstRound) {
        eyesToAward = winnerPoints === 120 ? 4 : 2;
      } else {
        if (winnerPoints === 120)  eyesToAward = 4;
        else if (loserPoints < 31) eyesToAward = 2;
        else                       eyesToAward = 1;
      }
      currentEyes[wTeam] = Math.min(12, currentEyes[wTeam] + eyesToAward + currentEggs);
      return {
        scores,
        eyes: currentEyes,
        eggsCount: 0,
        phase: currentEyes[wTeam] >= 12 ? 'GAME_OVER' : 'ROUND_OVER',
        isFirstRound: false,
        readyPlayers: { _init: true } as any,
        roundEndTime: null as any,
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

      // Были ли это последние карты?
      const isRoundOver = state.players.every(p => (p.hand || []).length === 0);
      let finalUpdate: Partial<GameState>;
      if (isRoundOver) {
        get().addLog(`🔄 forceSync: последняя взятка → ROUND_OVER`);
        finalUpdate = {
          table: [], currentPlayerIndex: winnerIndex, firstPlayerInTrick: winnerIndex,
          lastTrickWinnerIndex: winnerIndex, ...resolveRoundOver(newScores),
        };
      } else {
        finalUpdate = {
          table: [], scores: newScores,
          currentPlayerIndex: winnerIndex, firstPlayerInTrick: winnerIndex,
          lastTrickWinnerIndex: winnerIndex, readyPlayers: { _init: true } as any,
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
        ...resolveRoundOver(state.scores),
      };
      if (state.isMultiplayer) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), finalUpdate);
      else set(finalUpdate);
      return;
    }

    // Случай 4: обычный пинг Firebase, чтобы разбудить onValue (запустит бота)
    if (state.isMultiplayer) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), { _sync: Date.now() });
  }
}));
