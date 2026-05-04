import { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { useMultiplayerStore } from './store/multiplayerStore'
import { Card } from './components/Card'
import { PlayerInfo } from './components/PlayerInfo'
import { TableCard } from './components/TableCard'
import { RoundOverOverlay } from './components/RoundOverOverlay'
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
    spectators, takeSlot, toggleLobbyReady, startGame
  } = useGameStore();

  const { createRoom, joinRoom } = useMultiplayerStore();
  const [isCollecting, setIsCollecting] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const [lobbyView, setLobbyView] = useState(true);
  const [joinId, setJoinId] = useState('');
  const [playerName, setPlayerName] = useState(localStorage.getItem('belka_player_name') || '');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (table.length === 4) {
      const timer = setTimeout(() => setIsCollecting(true), 2500);
      return () => clearTimeout(timer);
    } else {
      setIsCollecting(false);
    }
  }, [table.length]);

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
    const finalName = playerName.trim() || 'Игрок';
    localStorage.setItem('belka_player_name', finalName);
    const id = await createRoom();
    initGame(id, 0, finalName);
    setLobbyView(false);
  };

  const handleJoinRoom = async (id: string) => {
    const finalName = playerName.trim() || 'Игрок';
    localStorage.setItem('belka_player_name', finalName);
    const r = await joinRoom(id);
    if (r.success) {
      initGame(id, -1, finalName);
      setLobbyView(false);
    }
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

  return (
    <div className="h-[100dvh] bg-[#020617] flex flex-col overflow-hidden font-sans select-none relative text-white touch-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#064e3b_0%,_#020617_70%)] opacity-40"></div>
      
      {/* Toast Overlay */}
      <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-xs space-y-2 px-4">
        {toasts.map(t => (
          <div key={t.id} className="bg-red-500 text-white p-4 rounded-2xl shadow-2xl font-black text-center text-xs animate-in slide-in-from-top duration-300">{t.message}</div>
        ))}
      </div>

      <ActionButtons 
        isMultiplayer={isMultiplayer}
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
      {[1, 2, 3].map(offset => {
        const idx = (Math.max(0, myPlayerIndex) + offset) % 4;
        const positions: ('left' | 'top' | 'right')[] = ['left', 'top', 'right'];
        return (
          <div key={idx} className={`absolute ${offset === 1 ? 'left-2' : offset === 2 ? 'top-2 left-1/2 -translate-x-1/2' : 'right-2'} top-[40%] -translate-y-1/2 z-50`}>
             <PlayerInfo 
                name={players[idx]?.name || '...'} 
                team={players[idx]?.team || 0} 
                active={currentPlayerIndex === idx} 
                cardsCount={players[idx]?.hand.length || 0} 
                assignedSuit={trumpMapping?.[idx]} 
                position={positions[offset - 1]} 
              />
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
           <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-widest z-50 shadow-xl">
              РЕЖИМ ПРОСМОТРА
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
    </div>
  )
}

export default App
