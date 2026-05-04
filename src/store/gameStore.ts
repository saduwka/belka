import { create } from 'zustand';
import { GameState, Card, Suit, Player, CARD_POINTS } from '../core/types';
import { createDeck, shuffleDeck, dealCards, isTrump, determineTrickWinner, validateMove, sortHand, getBestBotMove } from '../core/engine';
import { db } from '../firebase';
import { ref, update as firebaseUpdate, onValue, set as firebaseDbSet } from 'firebase/database';

interface GameStore extends GameState {
  isMultiplayer: boolean;
  roomId: string | null;
  myPlayerIndex: number;
  lastError: { message: string, id: number } | null;
  
  initGame: (roomId?: string, myIndex?: number, name?: string) => void;
  playCard: (playerIndex: number, cardId: string) => void;
  submitVote: (vote: 'TAKE' | 'HANG') => void;
  setReady: (playerIndex: number) => void;
  takeSlot: (slotIndex: number) => void;
  toggleLobbyReady: () => void;
  startGame: () => void;
  resetRound: () => void;
  updateFromRemote: (newState: Partial<GameState>) => void;
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

  initGame: (roomId, myIndex, name = 'Игрок') => {
    const cleanName = name.trim();
    if (roomId) {
      set({ isMultiplayer: true, roomId, myPlayerIndex: myIndex ?? -1 });
      const stateRef = ref(db, `rooms/${roomId}/state`);
      
      onValue(stateRef, (snapshot) => {
        const remoteState = snapshot.val();
        if (remoteState) {
          const current = get();
          // Авто-подхват слота при заходе
          if (current.myPlayerIndex === -1 && remoteState.players) {
             const seatedIdx = remoteState.players.findIndex((p: Player) => p.name?.trim() === cleanName && !p.isBot);
             if (seatedIdx !== -1) set({ myPlayerIndex: seatedIdx });
          }
          set(remoteState);
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
    }
  },

  takeSlot: (slotIndex) => {
    const state = get();
    if (state.phase !== 'LOBBY' || !state.roomId) return;
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
      readyPlayers: {},
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
      const isRoundOver = newPlayers.every(p => p.hand.length === 0);
      nextState = { ...nextState, lastTrickWinnerIndex: winnerIndex, currentPlayerIndex: -1 };
      setTimeout(() => {
        const currentState = get();
        const winnerTeam = currentState.players[winnerIndex].team;
        const newScores: [number, number] = [...currentState.scores];
        newScores[winnerTeam] += trickPoints;
        let finalUpdate: Partial<GameState> = { table: [], scores: newScores, currentPlayerIndex: winnerIndex, firstPlayerInTrick: winnerIndex, lastTrickWinnerIndex: null, readyPlayers: {}, };
        if (isRoundOver) {
          const currentEyes = [...currentState.eyes];
          const team0Points = newScores[0];
          const team1Points = newScores[1];
          let currentEggs = currentState.eggsCount;
          if (team0Points === 60 && team1Points === 60) { currentEggs += 2; finalUpdate = { ...finalUpdate, eggsCount: currentEggs, phase: 'ROUND_OVER', isFirstRound: false }; }
          else {
            const wTeam = team0Points > team1Points ? 0 : 1;
            let eyesToOpen = currentState.isFirstRound ? 2 : (wTeam === currentState.trumpSetterTeam ? 1 : 2);
            if (!currentState.isFirstRound && newScores[1 - wTeam] < 31) eyesToOpen += 1;
            if (!currentState.isFirstRound && newScores[wTeam] === 120) eyesToOpen = 12;
            if (currentEggs > 0) finalUpdate = { ...finalUpdate, phase: 'ROUND_OVER', votingState: { team: wTeam, votes: {} }, isFirstRound: false, eggsCount: currentEggs + eyesToOpen };
            else { currentEyes[wTeam] += eyesToOpen; finalUpdate = { ...finalUpdate, eyes: currentEyes as [number, number], phase: currentEyes[0] >= 12 || currentEyes[1] >= 12 ? 'GAME_OVER' : 'ROUND_OVER', isFirstRound: false }; }
          }
        }
        if (state.isMultiplayer && state.creatorName?.trim() === localStorage.getItem('belka_player_name')?.trim()) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), finalUpdate);
        else if (!state.isMultiplayer) {
          set(finalUpdate);
          if (!isRoundOver && winnerIndex !== 0) { const st = get(); const best = getBestBotMove(st.players[winnerIndex].hand, [], st.trumpSuit, st.playedSuits); if (best) get().playCard(winnerIndex, best.id); }
        }
      }, 3000);
    } else { nextState.currentPlayerIndex = (state.currentPlayerIndex + 1) % 4; }
    if (state.isMultiplayer) { if (state.creatorName?.trim() === localStorage.getItem('belka_player_name')?.trim() || newTable.length < 4) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), nextState); }
    else {
      set(nextState);
      if (nextState.currentPlayerIndex !== undefined && nextState.currentPlayerIndex !== -1 && nextState.currentPlayerIndex !== 0 && newTable.length < 4) {
        setTimeout(() => { const st = get(); const best = getBestBotMove(st.players[st.currentPlayerIndex].hand, st.table, st.trumpSuit, st.playedSuits); if (best) get().playCard(st.currentPlayerIndex, best.id); }, 1000);
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
    const newReady = { ...state.readyPlayers, [playerIndex]: true };
    if (!state.isMultiplayer) [1, 2, 3].forEach(id => newReady[id] = true);
    let nextState: Partial<GameState> = { readyPlayers: newReady };
    if (Object.keys(state.readyPlayers).length === 0 && !state.roundEndTime) nextState.roundEndTime = Date.now() + 15000;
    if (Object.keys(newReady).length === 4) { get().resetRound(); return; }
    if (state.isMultiplayer) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), nextState);
    else set(nextState);
  },

  resetRound: () => {
    const state = get();
    const deck = shuffleDeck(createDeck());
    const hands = dealCards(deck);
    let starterIndex = 0;
    hands.forEach((hand, idx) => { if (hand.some(c => c.id === 'CLUBS_JACK')) starterIndex = idx; });
    const nextTrumpSuit = state.trumpMapping ? state.trumpMapping[starterIndex] : 'CLUBS';
    const newPlayers = state.players.map((p, i) => ({ ...p, hand: sortHand(hands[i], nextTrumpSuit) }));
    const nextState: Partial<GameState> = {
      players: newPlayers, table: [], scores: [0, 0], phase: 'PLAYING',
      currentPlayerIndex: starterIndex, firstPlayerInTrick: starterIndex,
      lastTrickWinnerIndex: null, playedSuits: [], lastError: null,
      trumpSuit: nextTrumpSuit, trumpSetterTeam: starterIndex % 2 === 0 ? 0 : 1,
      isFirstRound: false, votingState: undefined, readyPlayers: {}, roundEndTime: undefined,
    };
    if (state.isMultiplayer && state.creatorName?.trim() === localStorage.getItem('belka_player_name')?.trim()) firebaseUpdate(ref(db, `rooms/${state.roomId}/state`), nextState);
    else if (!state.isMultiplayer) {
      set(nextState);
      if (starterIndex !== 0) {
        setTimeout(() => { const st = get(); const best = getBestBotMove(st.players[starterIndex].hand, st.table, st.trumpSuit, st.playedSuits); if (best) get().playCard(starterIndex, best.id); }, 1000);
      }
    }
  },

  updateFromRemote: (newState) => set(newState),
}));
