import { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { useMultiplayerStore } from './store/multiplayerStore'
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
    isFirstRound, playedSuits, isTurboMode, toggleTurboMode
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

  useEffect(() => {
    if (table.length === 4) {
      const delay = isTurboMode ? 50 : 2500;
      const timer = setTimeout(() => setIsCollecting(true), delay);
      return () => clearTimeout(timer);
    } else {
      setIsCollecting(false);
    }
  }, [table.length, isTurboMode]);

  // Скрипт авто-игры
  useEffect(() => {
    if (!isAutoPlay) return;

    if (phase === 'PLAYING' && currentPlayerIndex === myPlayerIndex && myPlayerIndex !== -1 && table.length < 4) {
      const delay = isTurboMode ? 0 : 1000;
      const timer = setTimeout(() => {
        const myHand = players[myPlayerIndex].hand;
        const played = useGameStore.getState().playedSuits;
        import('./core/engine').then(({ getBestBotMove }) => {
          const bestCard = getBestBotMove(myHand, table, trumpSuit, played);
          if (bestCard) playCard(myPlayerIndex, bestCard.id);
        });
      }, delay);
      return () => clearTimeout(timer);
    }

    // В Турбо-режиме нажимаем "Готов" автоматически, чтобы тест шел быстро
    if (phase === 'ROUND_OVER' && myPlayerIndex !== -1 && isTurboMode) {
      if (!readyPlayers[myPlayerIndex]) {
        setReady(myPlayerIndex);
      }
    }
  }, [isAutoPlay, phase, currentPlayerIndex, myPlayerIndex, table.length, players, trumpSuit, votingState, readyPlayers, isTurboMode]);

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
        onLeave={() => setLobbyView(true)}
      />
    );
  }

  if (players.length === 0) return null;
  const myPlayer = myPlayerIndex !== -1 ? players[myPlayerIndex] : null;
  const myTeam = myPlayer ? myPlayer.team : 0;
  const otherTeam = 1 - myTeam;
  const isMyTurn = myPlayerIndex !== -1 && currentPlayerIndex === myPlayerIndex && phase === 'PLAYING';

  // Не показываем масти игроков в первом раунде, пока не вышел валет крести
  const hasJackAppeared = table.some(c => c.id === 'CLUBS_JACK');
  const showMapping = !isFirstRound || hasJackAppeared;

  return (
    <div className={`h-[100dvh] bg-[#020617] flex flex-col overflow-hidden font-sans select-none relative text-white touch-none ${isTurboMode ? 'turbo-active' : ''}`}>
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
        isAutoPlay={isAutoPlay}
        onAutoPlayToggle={toggleAutoPlay}
        isTurboMode={isTurboMode}
        onTurboToggle={toggleTurboMode}
        onReset={() => isMultiplayer ? resetRound() : initGame()}
        onMenu={() => setLobbyView(true)}
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
        {isMyTurn && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-950 px-4 py-1 rounded-full font-black text-[10px] uppercase tracking-widest animate-bounce z-50 shadow-xl">
            ВАШ ХОД
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
        />
      )}

      {phase === 'GAME_OVER' && (
        <GameOverOverlay 
          eyes={eyes}
          myTeam={myTeam}
          otherTeam={otherTeam}
          onLeave={() => setLobbyView(true)}
        />
      )}
    </div>
  )
}

export default App
