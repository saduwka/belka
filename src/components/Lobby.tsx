import { useState } from 'react';
import { useGameStore } from '../store/gameStore';

interface LobbyProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  joinId: string;
  setJoinId: (id: string) => void;
  onStartSingle: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (id: string) => void;
  isConnecting?: boolean;
  nameError?: boolean;
}

export const Lobby = ({
  playerName, setPlayerName, joinId, setJoinId,
  onStartSingle, onCreateRoom, onJoinRoom, isConnecting,
  nameError
}: LobbyProps) => {
  const aiEnabled = useGameStore((s) => s.aiEnabled);
  const toggleAiEnabled = useGameStore((s) => s.toggleAiEnabled);

  return (
    <div className="h-screen bg-[#020617] flex items-center justify-center p-6 font-sans text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-emerald-900/20 to-blue-900/20"></div>
      <div className="relative z-10 w-full max-w-sm text-center">
        <h1 className="text-6xl font-black tracking-tighter mb-2 italic drop-shadow-2xl text-emerald-400">БЕЛКА</h1>
        <p className="text-white/40 text-[10px] mb-12 uppercase tracking-[0.5em] font-black">Professional Edition</p>
        
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-xl">
          <div className="text-left">
            <div className="text-[10px] font-black uppercase tracking-widest text-white/50">ИИ боты</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={aiEnabled}
            onClick={toggleAiEnabled}
            className={`relative h-8 w-14 rounded-full border border-white/15 transition-colors ${aiEnabled ? 'bg-blue-500/80' : 'bg-white/10'}`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform ${aiEnabled ? 'left-7' : 'left-1'}`}
            />
          </button>
        </div>

        <div className="mb-8 space-y-2 text-left">
           <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-4">ВАШЕ ИМЯ</label>
            <input 
              type="text" 
              placeholder="Введите имя..." 
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className={`w-full bg-white/5 border rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 transition-all text-sm font-bold placeholder:text-white/10 ${
                nameError 
                ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-shake ring-2 ring-red-500/20' 
                : 'border-white/10 focus:ring-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
              }`}
            />
        </div>

        <div className="space-y-4">
          <button 
            onClick={onStartSingle} 
            disabled={isConnecting}
            className="w-full bg-white text-black font-black py-5 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-2xl uppercase tracking-widest text-xs disabled:opacity-50 disabled:pointer-events-none"
          >
            ОДИНОЧНАЯ ИГРА
          </button>
          
          <button 
            onClick={onCreateRoom} 
            disabled={isConnecting}
            className="w-full bg-emerald-500 text-emerald-950 font-black py-5 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-2xl uppercase tracking-widest text-xs disabled:opacity-50 disabled:pointer-events-none h-14"
          >
            {isConnecting ? (
              <div className="w-4 h-4 border-2 border-emerald-950 border-t-transparent rounded-full animate-spin mx-auto"></div>
            ) : (
              "СОЗДАТЬ КОМНАТУ"
            )}
          </button>
          
          <div className="pt-6 border-t border-white/10 mt-6">
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="ID КОМНАТЫ" 
                value={joinId} 
                onChange={(e) => setJoinId(e.target.value)} 
                className="flex-grow bg-white/10 border border-white/20 rounded-2xl px-6 py-4 text-xs font-bold uppercase tracking-widest focus:outline-none" 
              />
              <button 
                onClick={() => onJoinRoom(joinId)} 
                disabled={isConnecting || !joinId.trim()}
                className="bg-white/20 px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 min-w-[90px]"
              >
                {isConnecting ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
                ) : (
                  "ВОЙТИ"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
