import { Player } from '../core/types';
import { useGameStore } from '../store/gameStore';

interface WaitingRoomProps {
  roomId: string | null;
  players: Player[];
  spectators: { id: string, name: string }[];
  myPlayerIndex: number;
  readyPlayers: Record<number, boolean>;
  onTakeSlot: (index: number) => void;
  onToggleReady: () => void;
  onStartGame: () => void;
  onLeave: () => void;
}

export const WaitingRoom = ({
  roomId, players, spectators, myPlayerIndex, readyPlayers, 
  onTakeSlot, onToggleReady, onStartGame, onLeave
}: WaitingRoomProps) => {
  const myName = localStorage.getItem('belka_player_name');
  const creator = useGameStore(s => s.creatorName);
  const isHost = myName === creator;
  const isSeated = myPlayerIndex !== -1;

  // Фильтруем зрителей, чтобы там не было тех, кто уже сидит
  const seatedNames = players.filter(p => !p.isBot).map(p => p.name?.trim());
  const actualSpectators = spectators.filter(s => s.name && !seatedNames.includes(s.name.trim()));

  return (
    <div className="h-screen bg-[#020617] flex flex-col items-center justify-center p-6 font-sans text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#064e3b_0%,_#020617_70%)] opacity-40"></div>
      
      <button 
        onClick={onLeave}
        className="absolute top-8 left-8 w-12 h-12 bg-white/5 border border-white/10 rounded-full flex items-center justify-center backdrop-blur-xl hover:bg-white/10 transition-all z-[100]"
      >
        <span className="text-xl">←</span>
      </button>

      <div className="relative z-10 w-full max-w-2xl text-center">
        <div className="mb-12">
          <h2 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.5em] mb-2">ОЖИДАНИЕ ИГРОКОВ</h2>
          <div className="text-4xl font-black italic tracking-tighter">ID: {roomId}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mb-12">
          <div className="space-y-3">
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest text-left ml-2">КОМАНДА А</h3>
            {[0, 2].map(idx => (
              <SlotCard 
                key={idx} 
                player={players[idx]} 
                isMe={myPlayerIndex === idx}
                isReady={Boolean(readyPlayers[idx] || players[idx]?.isBot)}
                onTake={() => onTakeSlot(idx)}
              />
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest text-left ml-2">КОМАНДА Б</h3>
            {[1, 3].map(idx => (
              <SlotCard 
                key={idx} 
                player={players[idx]} 
                isMe={myPlayerIndex === idx}
                isReady={Boolean(readyPlayers[idx] || players[idx]?.isBot)}
                onTake={() => onTakeSlot(idx)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {isSeated && !isHost && (
            <button 
              onClick={onToggleReady}
              className={`w-full py-5 rounded-3xl font-black uppercase tracking-[0.2em] text-sm transition-all ${readyPlayers[myPlayerIndex] ? 'bg-white/10 text-white/40 border border-white/10' : 'bg-white text-black shadow-xl active:scale-95'}`}
            >
              {readyPlayers[myPlayerIndex] ? 'ГОТОВ ✓' : 'ПОДТВЕРДИТЬ ГОТОВНОСТЬ'}
            </button>
          )}

          {isHost && (
            <button 
              onClick={onStartGame}
              className="w-full bg-emerald-500 text-emerald-950 font-black py-5 rounded-3xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_20px_50px_rgba(16,185,129,0.3)] uppercase tracking-[0.2em] text-sm"
            >
              НАЧАТЬ ИГРУ
            </button>
          )}

          {!isHost && !isSeated && (
            <div className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] animate-pulse py-4">
              ВЫБЕРИТЕ МЕСТО, ЧТОБЫ ИГРАТЬ
            </div>
          )}
        </div>

        {actualSpectators.length > 0 && (
          <div className="mt-12 bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl">
            <h4 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-4">ЗРИТЕЛИ ({actualSpectators.length})</h4>
            <div className="flex flex-wrap justify-center gap-2">
              {actualSpectators.map(s => (
                <div key={s.id} className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold border border-white/5">
                  {s.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SlotCard = ({ player, isMe, isReady, onTake }: { player: Player, isMe: boolean, isReady: boolean, onTake: () => void }) => {
  const isEmpty = !player || player.isBot;

  return (
    <div className={`
      relative h-20 rounded-2xl border-2 transition-all duration-500 flex items-center px-6 gap-4 overflow-hidden
      ${isMe ? 'bg-emerald-500/10 border-emerald-500' : 'bg-white/5 border-white/10'}
    `}>
      {isMe && <div className="absolute inset-0 bg-emerald-500/5 animate-pulse"></div>}
      
      <div className={`
        w-12 h-12 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-sm font-black transition-all duration-500 relative
        ${isEmpty ? 'border-white/5 bg-white/5 text-white/10' : 'border-emerald-400 bg-emerald-400/20 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.2)]'}
      `}>
        {isEmpty ? '?' : (player?.name?.[0] || 'P').toUpperCase()}
        {!isEmpty && player?.name?.toLowerCase() === 'sadu' && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-lg animate-bounce drop-shadow-lg z-50">
            👑
          </div>
        )}
      </div>

      <div className="flex-grow text-left">
        <div className={`text-xs font-black uppercase tracking-widest ${isEmpty ? 'text-white/20' : 'text-white'}`}>
          {isEmpty ? 'Свободное место' : (player?.name || 'Загрузка...')}
        </div>
        {!isEmpty && (
          <div className={`text-[8px] font-bold uppercase tracking-widest mt-1 flex items-center gap-1 ${isReady ? 'text-emerald-400' : 'text-white/20'}`}>
            <span>{isReady ? '✓ ГОТОВ' : '○ НЕ ГОТОВ'}</span>
          </div>
        )}
      </div>

      {isEmpty && (
        <button 
          onClick={onTake}
          className="bg-white text-black text-[9px] font-black px-4 py-2 rounded-xl hover:scale-105 transition-all uppercase tracking-widest"
        >
          СЕСТЬ
        </button>
      )}
    </div>
  );
};
