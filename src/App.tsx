import { useEffect, useState, useRef } from 'react'
import { useGameStore } from './store/gameStore'
import { useMultiplayerStore } from './store/multiplayerStore'
import { getBestBotMove } from './core/engine'
import { AIThinkingOverlay } from './components/AIThinkingOverlay'
import { Card } from './components/Card'
import { PlayerInfo } from './components/PlayerInfo'
import { TableCard } from './components/TableCard'
import { RoundOverOverlay } from './components/RoundOverOverlay'
import { GameOverOverlay } from './components/GameOverOverlay'
import { GameHeader } from './components/GameHeader'
import { Lobby } from './components/Lobby'
import { ActionButtons } from './components/ActionButtons'
import { WaitingRoom } from './components/WaitingRoom'

const getSuitSymbol = (suit: string) => {
  switch (suit) {
    case 'CLUBS': return '♣️';
    case 'SPADES': return '♠️';
    case 'HEARTS': return '♥️';
    case 'DIAMONDS': return '♦️';
    default: return '';
  }
};

function App() {
  const { 
    players, currentPlayerIndex, table, scores, eyes, phase, 
    trumpSuit, firstPlayerInTrick, lastTrickWinnerIndex, lastError,
    initGame, playCard, resetRound, isMultiplayer, myPlayerIndex, roomId, trumpMapping,
    eggsCount, votingState, submitVote, readyPlayers, roundEndTime, setReady,
    spectators, takeSlot, toggleLobbyReady, startGame, isAutoPlay, toggleAutoPlay,
    isFirstRound, playedSuits, dealerIndex, isTurboMode, toggleTurboMode, logs, forceSync, addLog,
    persistLearningRoundIfJudge,
    executeBotTurn,
    aiEnabled,
    toggleAiEnabled,
  } = useGameStore();

  const { createRoom, joinRoom } = useMultiplayerStore();
  const [isCollecting, setIsCollecting] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const [lobbyView, setLobbyView] = useState(true);
  const [joinId, setJoinId] = useState('');
  const [playerName, setPlayerName] = useState(localStorage.getItem('belka_player_name') || '');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [afkTimer, setAfkTimer] = useState<number | null>(null);

  useEffect(() => {
    if (table.length === 4) {
      const delay = isTurboMode ? 50 : 2500;
      const timer = setTimeout(() => setIsCollecting(true), delay);
      return () => clearTimeout(timer);
    } else {
      setIsCollecting(false);
    }
  }, [table.length, isTurboMode]);

  // СТОРОЖЕВОЙ ТАЙМЕР (Watchdog) - делает игру "самовосстанавливающейся"
  useEffect(() => {
    if (lobbyView) return;

    const interval = setInterval(() => {
      if (phase === 'LOBBY' || phase === 'GAME_OVER') return;

      const myName = (localStorage.getItem('belka_player_name') || 'Игрок').trim().toLowerCase();
      const firstHuman = players.find(p => !p.isBot);
      
      // Только "Судья" (первый живой игрок) принимает решения
      if (firstHuman?.name.trim().toLowerCase() !== myName) return;

      // 1. Если на столе 4 карты, но ход всё еще -1 (зависло удаление)
      // ВАЖНО: не трогаем если belkaRoundTimer уже тикает — иначе гонка с playCard
      if (table.length === 4 && currentPlayerIndex === -1) {
        if ((window as any).belkaRoundTimer) return; // 3s таймер уже запущен — ждём его
        addLog("🛡️ Watchdog: очистка застрявшего стола");
        forceSync();
      }

      // 2. Если ход бота, но он ничего не делает
      if (phase === 'PLAYING' && players[currentPlayerIndex]?.isBot && table.length < 4) {
        addLog(`🛡️ Watchdog: подталкиваем бота [${currentPlayerIndex}]`);
        void executeBotTurn(currentPlayerIndex);
      }

      // 3. Если у всех 0 карт, но фаза не сменилась
      if (phase === 'PLAYING' && players.length === 4 && players.every(p => p.hand.length === 0)) {
        if ((window as any).belkaRoundTimer) return; // Дождёмся таймера
        addLog("🛡️ Watchdog: принудительное завершение раунда");
        forceSync(); // forceSync теперь сам обрабатывает этот кейс
      }
    }, 4000); 

    // Бэкап для всех игроков (на случай если Хост вылетел)
    const backupInterval = setInterval(() => {
      if (lobbyView) return;
      const state = useGameStore.getState();
      // Если стол висит 10 секунд
      if (state.table.length === 4 && state.currentPlayerIndex === -1) {
        console.warn("🛡️ Backup Watchdog: принудительная очистка стола");
        state.forceSync();
      }
      // Если у всех 0 карт уже долго
      if (state.phase === 'PLAYING' && state.players.length === 4 && state.players.every(p => p.hand.length === 0)) {
        console.warn("🛡️ Backup Watchdog: принудительное завершение раунда");
        state.resetRound();
      }
    }, 12000);

    return () => {
      clearInterval(interval);
      clearInterval(backupInterval);
    };
  }, [phase, currentPlayerIndex, table.length, players, trumpSuit, playedSuits, forceSync, playCard, resetRound, addLog, lobbyView, executeBotTurn]);

  useEffect(() => {
    if (lobbyView || (phase !== 'ROUND_OVER' && phase !== 'GAME_OVER')) return;
    void persistLearningRoundIfJudge();
  }, [phase, lobbyView, persistLearningRoundIfJudge]);

  // Скрипт авто-игры для игрока
  useEffect(() => {
    if (!isAutoPlay || lobbyView) return;

    if (phase === 'PLAYING' && currentPlayerIndex === myPlayerIndex && myPlayerIndex !== -1 && table.length < 4) {
      const delay = isTurboMode ? 0 : 1000;
      const timer = setTimeout(() => {
        const myHand = players[myPlayerIndex].hand;
        const bestCard = getBestBotMove(myHand, table, trumpSuit, playedSuits);
        if (bestCard) playCard(myPlayerIndex, bestCard.id);
      }, delay);
      return () => clearTimeout(timer);
    }

    // В Турбо-режиме нажимаем "Готов" автоматически, чтобы тест шел быстро
    if (phase === 'ROUND_OVER' && myPlayerIndex !== -1 && isTurboMode) {
      if (!readyPlayers[myPlayerIndex]) {
        setReady(myPlayerIndex);
      }
    }
  }, [isAutoPlay, phase, currentPlayerIndex, myPlayerIndex, table.length, players, trumpSuit, votingState, readyPlayers, isTurboMode, playCard, lobbyView]);

  // AFK таймер: 30 секунд на ход для человека
  const afkDeadlineRef = useRef<number | null>(null);
  const afkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const afkFiredRef = useRef(false);

  useEffect(() => {
    // Очистка
    const clearAfk = () => {
      if (afkIntervalRef.current) {
        clearInterval(afkIntervalRef.current);
        afkIntervalRef.current = null;
      }
      afkDeadlineRef.current = null;
      afkFiredRef.current = false;
      setAfkTimer(null);
    };

    if (lobbyView || phase !== 'PLAYING' || currentPlayerIndex === -1) {
      clearAfk();
      return;
    }

    if (currentPlayerIndex !== myPlayerIndex || myPlayerIndex === -1) {
      clearAfk();
      return;
    }

    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer || currentPlayer.isBot) {
      clearAfk();
      return;
    }

    // Всегда ставим новый дедлайн при запуске эффекта
    afkDeadlineRef.current = Date.now() + 30_000;
    afkFiredRef.current = false;

    // Убираем старый интервал если есть
    if (afkIntervalRef.current) {
      clearInterval(afkIntervalRef.current);
    }

    const tick = () => {
      if (!afkDeadlineRef.current) return;
      const remaining = Math.max(0, Math.ceil((afkDeadlineRef.current - Date.now()) / 1000));
      setAfkTimer(remaining);

      if (remaining <= 0 && !afkFiredRef.current) {
        afkFiredRef.current = true;
        const state = useGameStore.getState();
        const hand = state.players[state.currentPlayerIndex]?.hand;
        if (hand && hand.length > 0 && state.table.length < 4) {
          const bestCard = getBestBotMove(hand, state.table, state.trumpSuit, state.playedSuits);
          if (bestCard) {
            playCard(state.currentPlayerIndex, bestCard.id);
          }
        }
      }
    };

    tick(); // сразу показать текущее значение
    afkIntervalRef.current = setInterval(tick, 1000);

    return () => {
      if (afkIntervalRef.current) {
        clearInterval(afkIntervalRef.current);
        afkIntervalRef.current = null;
      }
    };
  }, [currentPlayerIndex, phase, lobbyView, myPlayerIndex]);

  useEffect(() => {
    if (roundEndTime) {
      const interval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((roundEndTime - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining === 0 && myPlayerIndex === 0) {
          resetRound();
        }
      }, 500);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
  }, [roundEndTime, myPlayerIndex, resetRound]);

  useEffect(() => {
    if (lastError) {
      const id = Date.now();
      setToasts(prev => [...prev, { id, message: lastError.message }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    }
  }, [lastError]);

  const handleCardClick = (cardId: string) => {
    if (selectedCardId === cardId) {
      playCard(myPlayerIndex, cardId);
      setSelectedCardId(null);
    } else {
      setSelectedCardId(cardId);
    }
  };

  const handleStartSingle = () => {
    const finalName = playerName.trim() || 'Игрок';
    localStorage.setItem('belka_player_name', finalName);
    initGame(undefined, 0, finalName);
    setLobbyView(false);
  };

  const handleCreateRoom = async () => {
    setIsConnecting(true);
    const finalName = playerName.trim() || 'Игрок';
    localStorage.setItem('belka_player_name', finalName);
    const id = await createRoom();
    initGame(id, 0, finalName);
    setLobbyView(false);
    setIsConnecting(false);
  };

  const handleJoinRoom = async (id: string) => {
    if (!id.trim()) return;
    setIsConnecting(true);
    const finalName = playerName.trim() || 'Игрок';
    localStorage.setItem('belka_player_name', finalName);
    const r = await joinRoom(id);
    if (r.success) {
      initGame(id, -1, finalName);
      setLobbyView(false);
    } else {
      setToasts(prev => [...prev, { id: Date.now(), message: (r as any).error || 'Ошибка входа' }]);
    }
    setIsConnecting(false);
  };

  if (lobbyView) {
    return (
      <Lobby 
        playerName={playerName}
        setPlayerName={setPlayerName}
        joinId={joinId}
        setJoinId={setJoinId}
        onStartSingle={handleStartSingle}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        isConnecting={isConnecting}
      />
    );
  }

  if (phase === 'LOBBY' && isMultiplayer) {
    return (
      <WaitingRoom 
        roomId={roomId}
        players={players}
        spectators={spectators}
        myPlayerIndex={myPlayerIndex}
        readyPlayers={readyPlayers}
        onTakeSlot={takeSlot}
        onToggleReady={toggleLobbyReady}
        onStartGame={startGame}
        onLeave={() => {
          useGameStore.getState().leaveGame();
          setLobbyView(true);
        }}
      />
    );
  }

  if (players.length === 0) return null;
  const myPlayer = myPlayerIndex !== -1 ? players[myPlayerIndex] : null;
  const myTeam = myPlayer ? myPlayer.team : 0;
  const otherTeam = 1 - myTeam;
  const isMyTurn = myPlayerIndex !== -1 && currentPlayerIndex === myPlayerIndex && phase === 'PLAYING';
  const myName = (localStorage.getItem('belka_player_name') || '').trim();
  const isAdmin = myName.toLowerCase() === 'sadu';

  // Не показываем масти игроков в первом раунде, пока не вышел валет крести
  const hasJackAppeared = table.some(c => c.id === 'CLUBS_JACK');
  const showMapping = !isFirstRound || hasJackAppeared;
  const showDealerBadge =
    phase === 'PLAYING' || phase === 'ROUND_OVER' || phase === 'GAME_OVER';

  return (
    <div className={`h-[100dvh] bg-[#020617] flex flex-col overflow-hidden font-sans select-none relative text-white touch-none ${isTurboMode ? 'turbo-active' : ''}`}>
      <AIThinkingOverlay />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#064e3b_0%,_#020617_70%)] opacity-40"></div>
      
      {/* Toast Overlay */}
      <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-xs space-y-2 px-4 pointer-events-none">
        {toasts.map(t => {
          const isError = t.message.includes('Ошибка') || t.message.includes('Недопустимый') || t.message.includes('Не все');
          return (
            <div key={t.id} className={`${isError ? 'bg-red-500' : 'bg-slate-800/90 backdrop-blur-md border border-white/10'} text-white p-4 rounded-2xl shadow-2xl font-black text-center text-[10px] uppercase tracking-widest animate-in slide-in-from-top duration-300 pointer-events-auto`}>
              {t.message}
            </div>
          );
        })}
      </div>

      <ActionButtons 
        isMultiplayer={isMultiplayer}
        aiEnabled={aiEnabled}
        onAiToggle={toggleAiEnabled}
        isAutoPlay={isAutoPlay}
        onAutoPlayToggle={toggleAutoPlay}
        isTurboMode={isTurboMode}
        onTurboToggle={toggleTurboMode}
        onReset={() => isMultiplayer ? resetRound() : initGame()}
        onMenu={() => {
          useGameStore.getState().leaveGame();
          setLobbyView(true);
        }}
        isAdmin={isAdmin}
      />

      <GameHeader 
        scores={scores}
        myTeam={myTeam}
        otherTeam={otherTeam}
        eyes={eyes}
        trumpSuit={trumpSuit}
        eggsCount={eggsCount}
        isMultiplayer={isMultiplayer}
        roomId={roomId}
        players={players}
        myPlayerIndex={myPlayerIndex === -1 ? 0 : myPlayerIndex}
        currentPlayerIndex={currentPlayerIndex}
        trumpMapping={trumpMapping}
        getSuitSymbol={getSuitSymbol}
      />

      {/* Side Players */}
      {[0, 1, 2, 3].map(offset => {
        if (myPlayerIndex !== -1 && offset === 0) return null;
        
        const idx = (Math.max(0, myPlayerIndex) + offset) % 4;
        const positions: ('bottom' | 'left' | 'top' | 'right')[] = ['bottom', 'left', 'top', 'right'];
        const posClass = 
          offset === 0 ? 'bottom-32 left-1/2 -translate-x-1/2' :
          offset === 1 ? 'left-2 top-[40%] -translate-y-1/2' : 
          offset === 2 ? 'top-20 left-1/2 -translate-x-1/2' : 
                         'right-2 top-[40%] -translate-y-1/2';

        const playerTeam = players[idx]?.team || 0;
        let relation: 'ME' | 'PARTNER' | 'ENEMY' | 'TEAM_A' | 'TEAM_B' = 'ENEMY';
        if (myPlayerIndex === -1) {
          relation = playerTeam === 0 ? 'TEAM_A' : 'TEAM_B';
        } else if (idx === myPlayerIndex) {
          relation = 'ME';
        } else if (playerTeam === myPlayer?.team) {
          relation = 'PARTNER';
        }

        return (
          <div key={idx} className={`absolute ${posClass} z-50 flex flex-col items-center gap-2`}>
             <PlayerInfo
                name={players[idx]?.name || '...'}
                relation={relation}
                active={currentPlayerIndex === idx}
                cardsCount={players[idx]?.hand.length || 0}
                assignedSuit={showMapping ? trumpMapping?.[idx] : undefined}
                position={positions[offset]}
                isAdmin={players[idx]?.name.toLowerCase() === 'sadu'}
                afkTimer={currentPlayerIndex === idx ? afkTimer : null}
                isDealer={showDealerBadge && dealerIndex === idx}
              />
              {myPlayerIndex === -1 && players[idx]?.isBot && (
                <button 
                  onClick={() => takeSlot(idx)}
                  className="bg-emerald-500 text-emerald-950 px-3 py-1.5 rounded-full font-black text-[9px] uppercase tracking-widest shadow-[0_5px_15px_rgba(16,185,129,0.4)] animate-pulse hover:scale-105 transition-all"
                >
                  СЕСТЬ СЮДА
                </button>
              )}
          </div>
        );
      })}

      <div className="flex-grow relative flex items-center justify-center">
        <div className="relative w-64 h-64 flex items-center justify-center">
          <div className="absolute inset-0 bg-emerald-500/5 rounded-full blur-3xl"></div>
          {table.map((card, idx) => {
            const playerRelIdx = (firstPlayerInTrick + idx - Math.max(0, myPlayerIndex) + 4) % 4;
            const pos = ["translate-y-12", "-translate-x-12", "-translate-y-12", "translate-x-12"];
            return (
              <div key={idx} className={`absolute transition-all duration-500 ${pos[playerRelIdx]}`}>
                <TableCard card={card} playerIdx={playerRelIdx} isCollecting={isCollecting} winnerIdx={lastTrickWinnerIndex !== null ? (lastTrickWinnerIndex - Math.max(0, myPlayerIndex) + 4) % 4 : null} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative pb-16 flex flex-col items-center">
        {myPlayerIndex !== -1 && showDealerBadge && dealerIndex === myPlayerIndex && (
          <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-50">
            <div className="bg-blue-500/20 text-blue-300 border border-blue-500/40 backdrop-blur-xl px-3 py-1 rounded-full font-black text-[8px] sm:text-[9px] uppercase tracking-widest shadow-lg">
              ВЫ РАЗДАЁТЕ
            </div>
          </div>
        )}
        {isMyTurn && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-50">
            <div className="bg-yellow-400 text-yellow-950 px-4 py-1 rounded-full font-black text-[10px] uppercase tracking-widest animate-bounce shadow-xl">
              ВАШ ХОД
            </div>
            {afkTimer != null && (
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-xl border-2 border-white ${
                afkTimer > 20 ? 'bg-emerald-500' : afkTimer > 10 ? 'bg-yellow-500' : 'bg-red-500'
              } ${afkTimer <= 5 ? 'animate-pulse' : ''}`}>
                {afkTimer}
              </div>
            )}
          </div>
        )}
        {myPlayerIndex === -1 && (
           <div className="absolute -top-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-50">
             <div className="bg-blue-500 text-white px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-widest shadow-xl">
                РЕЖИМ ПРОСМОТРА
             </div>
           </div>
        )}
        <div className="flex justify-center items-end px-12">
          {myPlayer?.hand.map((card, i) => (
            <Card key={card.id} card={card} index={i} total={myPlayer.hand.length} onClick={() => handleCardClick(card.id)} disabled={!isMyTurn} isSelected={selectedCardId === card.id} />
          ))}
        </div>
      </div>

      {phase === 'ROUND_OVER' && (
        <RoundOverOverlay 
          scores={scores}
          eyes={eyes}
          myTeam={myTeam}
          otherTeam={otherTeam}
          eggsCount={eggsCount}
          votingState={votingState}
          readyPlayers={readyPlayers}
          timeLeft={timeLeft}
          myPlayerIndex={myPlayerIndex}
          players={players}
          submitVote={submitVote}
          setReady={setReady}
          resetRound={resetRound}
          trumpSuit={trumpSuit}
          trumpMapping={trumpMapping}
        />
      )}

      {phase === 'GAME_OVER' && (
        <GameOverOverlay 
          eyes={eyes}
          myTeam={myTeam}
          otherTeam={otherTeam}
          onLeave={() => {
            useGameStore.getState().leaveGame();
            setLobbyView(true);
          }}
          trumpSuit={trumpSuit}
        />
      )}

    </div>
  )
}

export default App
