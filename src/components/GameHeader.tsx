import { Suit } from '../core/types';
import { PlayerInfo } from './PlayerInfo';
import { BelkaScore } from './BelkaScore';

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
  const myTeamSuit = trumpMapping ? (myTeam === 0 ? trumpMapping[0] : trumpMapping[1]) : null;
  const otherTeamSuit = trumpMapping ? (otherTeam === 0 ? trumpMapping[0] : trumpMapping[1]) : null;

  return (
    <div className="absolute top-0 left-0 right-0 z-50 p-2 sm:p-4 flex justify-between items-start pointer-events-none">
      <div className="flex flex-col gap-2 pointer-events-auto">
        <div className="flex gap-2">
          <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-2 sm:p-3 rounded-2xl flex flex-col gap-1">
            <span className="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest leading-none">ОЧКИ</span>
            <span className="text-lg sm:text-xl font-black text-emerald-400 leading-none">{scores[myTeam]}</span>
          </div>
          <div className="bg-white/10 backdrop-blur-xl border border-white/10 p-1.5 sm:p-2 rounded-2xl flex flex-col items-center justify-center min-w-[40px] sm:min-w-[50px] shadow-2xl relative">
            <span className="text-[7px] sm:text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">КОЗЫРЬ</span>
            <span className="text-xl sm:text-2xl leading-none">{getSuitSymbol(trumpSuit || 'CLUBS')}</span>
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
      <div className="flex gap-2 sm:gap-4 items-center pointer-events-auto">
        <div className="flex gap-2 sm:gap-3 items-center bg-black/40 backdrop-blur-xl border border-white/10 p-1.5 sm:p-2 rounded-3xl">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[7px] opacity-40 uppercase font-black tracking-widest">ВЫ</span>
            <BelkaScore score={eyes[myTeam]} trumpSuit={myTeamSuit} compact />
          </div>
          <div className="w-[1px] h-8 sm:h-10 bg-white/10 mx-0.5 sm:mx-1" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[7px] opacity-40 uppercase font-black tracking-widest">ОНИ</span>
            <BelkaScore score={eyes[otherTeam]} trumpSuit={otherTeamSuit} compact />
          </div>
        </div>
      </div>
    </div>
  );
};
