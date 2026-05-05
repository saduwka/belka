import { GameState } from '../core/types';
import { BelkaScore } from './BelkaScore';

interface RoundOverOverlayProps {
  scores: [number, number];
  eyes: [number, number];
  myTeam: number;
  otherTeam: number;
  eggsCount: number;
  votingState: GameState['votingState'];
  readyPlayers: Record<number, boolean>;
  timeLeft: number | null;
  myPlayerIndex: number;
  players: GameState['players'];
  submitVote: (vote: 'TAKE' | 'HANG') => void;
  setReady: (playerIndex: number) => void;
  resetRound: () => void;
  trumpSuit: string | null;
  trumpMapping?: Record<number, any>;
}

export const RoundOverOverlay = ({
  scores, eyes, myTeam, otherTeam, eggsCount, votingState,
  readyPlayers, timeLeft, myPlayerIndex, players,
  submitVote, setReady, resetRound, trumpSuit, trumpMapping
}: RoundOverOverlayProps) => {
  const myTeamSuit = trumpMapping ? (myTeam === 0 ? trumpMapping[0] : trumpMapping[1]) : null;
  const otherTeamSuit = trumpMapping ? (otherTeam === 0 ? trumpMapping[0] : trumpMapping[1]) : null;

  return (
    <div className="fixed inset-0 bg-black/90 z-[2000] flex items-center justify-center p-8 backdrop-blur-xl animate-in fade-in duration-500">
      <div className="text-center w-full max-w-sm">
        <h2 className="text-2xl font-black mb-8 italic text-white/40 tracking-[0.3em] uppercase">ИТОГ РАУНДА</h2>
        
        <div className="flex justify-center items-center gap-10 mb-8">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black opacity-40 uppercase tracking-[0.2em] mb-2">МЫ</span>
            <span className="text-6xl font-black text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">{scores[myTeam]}</span>
          </div>
          <div className="text-3xl font-black opacity-10 pt-4">:</div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black opacity-40 uppercase tracking-[0.2em] mb-2">ОНИ</span>
            <span className="text-6xl font-black text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">{scores[otherTeam]}</span>
          </div>
        </div>

        {scores[0] === 60 && scores[1] === 60 ? (
          <div className="mb-12">
            <div className="text-5xl font-black text-yellow-400 tracking-tighter mb-2 italic animate-pulse">ЯЙЦА!</div>
            <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">НИЧЬЯ — ГЛАЗА ПЕРЕХОДЯТ ДАЛЬШЕ</div>
          </div>
        ) : (
          <div className="flex justify-center gap-12 mb-10 items-end">
            <div className="flex flex-col items-center gap-2">
              <span className="text-[8px] opacity-40 font-black uppercase tracking-widest">ГЛАЗА МЫ</span>
              <BelkaScore score={eyes[myTeam]} trumpSuit={myTeamSuit} />
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-[8px] opacity-40 font-black uppercase tracking-widest">ГЛАЗА ОНИ</span>
              <BelkaScore score={eyes[otherTeam]} trumpSuit={otherTeamSuit} />
            </div>
          </div>
        )}
        
        <div className="mb-12">
          {votingState ? (
            <div className="bg-white/5 border border-white/10 p-6 rounded-3xl backdrop-blur-md">
               {votingState.result ? (
                  <div className="animate-bounce">
                     <div className="text-[10px] font-black text-white/40 uppercase mb-2">РЕШЕНО:</div>
                     <div className="text-2xl font-black text-yellow-400 uppercase tracking-widest">
                        {votingState.result === 'TAKE' ? `ОТКРЫТЬ ${eggsCount} ГЛАЗА` : 'ПОВЕСИТЬ ЯЙЦА'}
                     </div>
                  </div>
               ) : (
                  <div className="flex flex-col gap-3">
                     <div className="text-xs font-black text-white/60 mb-6 uppercase tracking-widest">ВЫБОР ПОБЕДИТЕЛЕЙ: {eggsCount} ГЛ.</div>
                     {votingState.team === myTeam ? (
                        <>
                          <button onClick={() => submitVote('TAKE')} disabled={votingState.votes[myPlayerIndex] !== undefined} className={`py-4 rounded-2xl font-black text-xs uppercase transition-all ${votingState.votes[myPlayerIndex] === 'TAKE' ? 'bg-emerald-500 text-black' : 'bg-white text-black'}`}>ОТКРЫТЬ {eggsCount} ГЛАЗА</button>
                          <button onClick={() => submitVote('HANG')} disabled={votingState.votes[myPlayerIndex] !== undefined} className={`py-4 rounded-2xl font-black text-xs uppercase transition-all border-2 ${votingState.votes[myPlayerIndex] === 'HANG' ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-white/20 text-white'}`}>ПОВЕСИТЬ ЯЙЦА</button>
                        </>
                     ) : (
                        <div className="text-sm font-black text-white/40 uppercase tracking-widest italic animate-pulse">ВРАГИ РЕШАЮТ СУДЬБУ ЯИЦ...</div>
                     )}
                  </div>
               )}
            </div>
          ) : (
            <div className="h-10">
              {scores[myTeam] > 30 && scores[myTeam] < 60 && <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-[0.2em] animate-bounce">У НАС ЕСТЬ СПАС!</div>}
              {scores[otherTeam] > 30 && scores[otherTeam] < 60 && <div className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-[0.2em] animate-bounce">У НИХ ЕСТЬ СПАС!</div>}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-6">
           <button 
              onClick={() => setReady(myPlayerIndex)} 
              disabled={readyPlayers[myPlayerIndex]}
              className={`w-full py-5 rounded-3xl font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden ${readyPlayers[myPlayerIndex] ? 'bg-white/10 text-white/40' : 'bg-emerald-500 text-emerald-950 shadow-[0_10px_40px_rgba(16,185,129,0.3)] active:scale-95'}`}
           >
              {readyPlayers[myPlayerIndex] ? 'ГОТОВ' : 'СЛЕДУЮЩИЙ РАУНД'}
              {timeLeft !== null && !readyPlayers[myPlayerIndex] && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black opacity-60">
                   {timeLeft}с
                </div>
              )}
           </button>

           <div className="flex gap-2">
              {players.map((p, i) => (
                <div key={i} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black transition-all ${readyPlayers[i] ? 'bg-emerald-500 border-emerald-500 text-emerald-950' : 'bg-white/5 border-white/20 text-white/20'}`}>
                   {readyPlayers[i] ? '✓' : p.name[0]}
                </div>
              ))}
           </div>

           {timeLeft !== null && (
             <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
                АВТОСТАРТ ЧЕРЕЗ {timeLeft} СЕКУНД
             </div>
           )}
        </div>
      </div>
    </div>
  );
};
