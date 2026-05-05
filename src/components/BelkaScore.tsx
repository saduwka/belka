import React from 'react';
import { Suit } from '../core/types';
import { CardBack } from './CardBack';

interface BelkaScoreProps {
  score: number;
  trumpSuit: Suit | null;
}

const getSuitSymbol = (suit: string) => {
  switch (suit) {
    case 'CLUBS': return '♣';
    case 'SPADES': return '♠';
    case 'HEARTS': return '♥';
    case 'DIAMONDS': return '♦';
    default: return '';
  }
};

const CardFace = ({ suit }: { suit: string }) => {
  const isRed = suit === 'HEARTS' || suit === 'DIAMONDS';
  const symbol = getSuitSymbol(suit);
  
  return (
    <div className="w-[54px] h-[80px] rounded-[4px] border border-slate-300 flex flex-col items-center py-1 shadow-md select-none relative overflow-hidden"
         style={{ background: 'radial-gradient(circle at 50% 30%, #ffffff 0%, #f4f7ff 100%)' }}>
      {/* Subtle paper texture overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper-fibers.png")' }} />
      
      {/* Top Left Index */}
      <div className="absolute top-0.5 left-1 flex flex-col items-center scale-[0.8] origin-top-left z-10">
        <span className={`text-[12px] font-black leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>6</span>
        <span className={`text-[8px] leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>{symbol}</span>
      </div>
      
      {/* Pips Grid - 3 rows of 2 (More compact) */}
      <div className="flex flex-col gap-1 mt-2.5 z-10">
        {[0, 1, 2].map(row => (
          <div key={row} className="flex gap-3.5">
            <span className={`text-[13px] leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>{symbol}</span>
            <span className={`text-[13px] leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>{symbol}</span>
          </div>
        ))}
      </div>

      {/* Bottom Right Index */}
      <div className="absolute bottom-0.5 right-1 flex flex-col items-center rotate-180 scale-[0.8] origin-bottom-right z-10">
        <span className={`text-[12px] font-black leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>6</span>
        <span className={`text-[8px] leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>{symbol}</span>
      </div>
    </div>
  );
};


export const BelkaScore = ({ score, trumpSuit }: BelkaScoreProps) => {
  const suit = trumpSuit || 'SPADES';
  const [isChanging, setIsChanging] = React.useState(false);

  React.useEffect(() => {
    setIsChanging(true);
    const timer = setTimeout(() => setIsChanging(false), 600);
    return () => clearTimeout(timer);
  }, [score]);
  
  const getCardTransform = (val: number) => {
    const s = val % 7;
    if (s === 0) return 'translate(0, 0) rotate(0deg)';
    
    // AUTHENTIC RULES:
    // 1 eye: Crooked/Tilted shift to show only ONE corner (index + 1 pip)
    if (s === 1) return 'translate(14px, 4px) rotate(40deg) scale(1.1)';
    
    // 2 eyes: Vertical shift (show top row)
    if (s === 2) return 'translate(0, 26px) rotate(0deg)';
    
    // 3 eyes: Horizontal shift (show left column)
    if (s === 3) return 'translate(28px, 0) rotate(0deg)';
    
    // 4 eyes: Vertical shift (show two rows)
    if (s === 4) return 'translate(0, 42px) rotate(0deg)';
    
    // 5 eyes: Hybrid shift to show 5 pips (covers bottom-right)
    if (s === 5) return 'translate(22px, 44px) rotate(0deg)';
    
    // 6 eyes: Fully open
    return 'translate(0, 84px) rotate(0deg)';
  };

  const card1Score = score > 6 ? 6 : score;
  const card2Score = score > 6 ? (score - 6) : 0;
  
  return (
    <div className={`flex flex-col items-center transition-transform duration-300 ${isChanging ? 'scale-105' : 'scale-100'}`}>
      {/* Container for the card stack - removed overflow-hidden to allow tilted cards to show fully */}
      <div className="relative h-[80px] w-[54px] rounded-[4px] shadow-2xl border border-black/10 bg-slate-800">
        {/* The Base Card */}
        <div className="absolute inset-0 z-0">
          <CardFace suit={suit} />
        </div>

        {/* The Covering Card */}
        <div 
          className="absolute inset-0 transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1) z-10"
          style={{ 
            transform: getCardTransform(score > 6 ? card2Score : card1Score),
            filter: (score % 6 !== 0) ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' : 'none',
            visibility: (score === 6 || score === 12) ? 'hidden' : 'visible'
          }}
        >
          {score > 6 ? (
            <div className="relative w-full h-full">
               <CardFace suit={suit} />
               <div className="absolute inset-0 rounded-[4px] border border-black/5 shadow-inner" />
            </div>
          ) : (
            <CardBack className="w-full h-full" />
          )}
        </div>
      </div>
      
      <div className="mt-2 relative group">
        <div className="absolute inset-0 bg-emerald-500/20 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative bg-black/60 backdrop-blur-md border border-white/10 px-3 py-0.5 rounded-full shadow-xl overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full ${isChanging ? 'animate-[shimmer_1.5s_infinite]' : ''}`} />
          <span className="text-[10px] font-black text-emerald-400/90 tracking-[0.25em] uppercase tabular-nums">
            {score} ГЛАЗ
          </span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
};
