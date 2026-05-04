import { Suit } from '../core/types';
import { PlayerInfo } from './PlayerInfo';

interface GameHeaderProps {
  scores: [number, number];
  myTeam: number;
  otherTeam: number;
  eyes: [number, number];
  trumpSuit: Suit | null;
  eggsCount: number;
  isMultiplayer: boolean;
  roomId: string | null;
  players: any[];
  myPlayerIndex: number;
  currentPlayerIndex: number;
  trumpMapping?: Record<number, Suit>;
  getSuitSymbol: (suit: string) => string;
}

export const GameHeader = ({
  scores, myTeam, otherTeam, eyes, trumpSuit, eggsCount,
  isMultiplayer, roomId, players, myPlayerIndex, currentPlayerIndex,
  trumpMapping, getSuitSymbol
}: GameHeaderProps) => {
  return (
    <div className="absolute top-0 left-0 right-0 z-50 p-4 flex justify-between items-start pointer-events-none">
      <div className="flex flex-col gap-2 pointer-events-auto">
        <div className="flex gap-2">
          <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-3 rounded-2xl flex flex-col gap-1">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-none">ОЧКИ</span>
            <span className="text-xl font-black text-emerald-400 leading-none">{scores[myTeam]}</span>
          </div>
          <div className="bg-white/10 backdrop-blur-xl border border-white/10 p-2 rounded-2xl flex flex-col items-center justify-center min-w-[50px] shadow-2xl relative">
            <span className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">КОЗЫРЬ</span>
            <span className="text-2xl leading-none">{getSuitSymbol(trumpSuit || 'CLUBS')}</span>
            {eggsCount > 0 && (
              <div className="absolute -bottom-2 bg-yellow-400 text-yellow-950 text-[7px] font-black px-1.5 rounded-full animate-pulse shadow-lg">
                ЯЙЦА: {eggsCount}
              </div>
            )}
          </div>
        </div>
        {isMultiplayer && (
          <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest w-fit backdrop-blur-md">
            ID: {roomId}
          </div>
        )}
      </div>
      <div className="flex gap-2 items-center pointer-events-auto">
        <div className="flex gap-1">
          <div className="bg-white/5 border border-white/10 p-2 rounded-xl text-center min-w-[44px]">
            <span className="block text-[7px] opacity-40 uppercase font-black">ВЫ</span>
            <span className="font-black text-xs">{eyes[myTeam]}👁️</span>
          </div>
          <div className="bg-white/5 border border-white/10 p-2 rounded-xl text-center min-w-[44px]">
            <span className="block text-[7px] opacity-40 uppercase font-black">ОНИ</span>
            <span className="font-black text-xs">{eyes[otherTeam]}👁️</span>
          </div>
        </div>
      </div>
    </div>
  );
};
