import { GameState } from '../core/types';

interface GameOverOverlayProps {
  eyes: [number, number];
  myTeam: number;
  otherTeam: number;
  onLeave: () => void;
}

export const GameOverOverlay = ({
  eyes, myTeam, otherTeam, onLeave
}: GameOverOverlayProps) => {
  const isVictory = eyes[myTeam] >= 12 && eyes[otherTeam] < 12;
  const isDefeat = eyes[otherTeam] >= 12 && eyes[myTeam] < 12;
  const isDraw = eyes[myTeam] >= 12 && eyes[otherTeam] >= 12; // Rare but possible

  let title = 'ИГРА ОКОНЧЕНА';
  let color = 'text-white';
  
  if (isVictory) {
    title = 'ПОБЕДА!';
    color = 'text-emerald-400 drop-shadow-[0_0_20px_rgba(16,185,129,0.5)]';
  } else if (isDefeat) {
    title = 'ПОРАЖЕНИЕ';
    color = 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]';
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-[2000] flex items-center justify-center p-8 backdrop-blur-2xl animate-in zoom-in duration-700">
      <div className="text-center w-full max-w-sm flex flex-col items-center">
        <h2 className={`text-5xl font-black mb-12 italic tracking-[0.2em] uppercase ${color}`}>
          {title}
        </h2>
        
        <div className="flex justify-center items-center gap-10 mb-16">
          <div className="flex flex-col items-center">
            <span className="text-xs font-black opacity-40 uppercase tracking-[0.2em] mb-4">МЫ</span>
            <span className="text-7xl font-black text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">{eyes[myTeam]}</span>
            <span className="text-[10px] font-black opacity-40 uppercase tracking-widest mt-2">ГЛАЗ</span>
          </div>
          <div className="text-4xl font-black opacity-10 pt-4 pb-8">:</div>
          <div className="flex flex-col items-center">
            <span className="text-xs font-black opacity-40 uppercase tracking-[0.2em] mb-4">ОНИ</span>
            <span className="text-7xl font-black text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">{eyes[otherTeam]}</span>
            <span className="text-[10px] font-black opacity-40 uppercase tracking-widest mt-2">ГЛАЗ</span>
          </div>
        </div>

        <button 
          onClick={onLeave} 
          className="w-full py-5 rounded-3xl font-black uppercase tracking-[0.2em] transition-all bg-white text-black shadow-[0_10px_40px_rgba(255,255,255,0.2)] active:scale-95 hover:bg-slate-200"
        >
          ВЕРНУТЬСЯ В ЛОББИ
        </button>
      </div>
    </div>
  );
};
