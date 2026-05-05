import React from 'react';
import { Suit } from '../core/types';
import { CardBack } from './CardBack';

interface BelkaScoreProps {
  score: number;
  trumpSuit: Suit | null;
  compact?: boolean;
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

const CardFace = ({ suit, compact }: { suit: string; compact?: boolean }) => {
  const isRed = suit === 'HEARTS' || suit === 'DIAMONDS';
  const symbol = getSuitSymbol(suit);

  return (
    <div className={`${compact ? 'w-[40px] h-[60px]' : 'w-[54px] h-[80px]'} rounded-[4px] border border-slate-300 flex flex-col items-center py-1 shadow-md select-none relative overflow-hidden`}
         style={{ background: 'radial-gradient(circle at 50% 30%, #ffffff 0%, #f4f7ff 100%)' }}>
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper-fibers.png")' }} />

      <div className={`absolute top-0.5 left-0.5 flex flex-col items-center ${compact ? 'scale-[0.6]' : 'scale-[0.8]'} origin-top-left z-10`}>
        <span className={`text-[12px] font-black leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>6</span>
        <span className={`text-[8px] leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>{symbol}</span>
      </div>

      <div className={`flex flex-col ${compact ? 'gap-0.5 mt-2' : 'gap-1 mt-2.5'} z-10`}>
        {[0, 1, 2].map(row => (
          <div key={row} className={`flex ${compact ? 'gap-2' : 'gap-3.5'}`}>
            <span className={`${compact ? 'text-[10px]' : 'text-[13px]'} leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>{symbol}</span>
            <span className={`${compact ? 'text-[10px]' : 'text-[13px]'} leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>{symbol}</span>
          </div>
        ))}
      </div>

      <div className={`absolute bottom-0.5 right-0.5 flex flex-col items-center rotate-180 ${compact ? 'scale-[0.6]' : 'scale-[0.8]'} origin-bottom-right z-10`}>
        <span className={`text-[12px] font-black leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>6</span>
        <span className={`text-[8px] leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>{symbol}</span>
      </div>
    </div>
  );
};


export const BelkaScore = ({ score, trumpSuit, compact }: BelkaScoreProps) => {
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

    if (compact) {
      if (s === 1) return 'translate(10px, 3px) rotate(40deg) scale(1.1)';
      if (s === 2) return 'translate(0, 20px) rotate(0deg)';
      if (s === 3) return 'translate(20px, 0) rotate(0deg)';
      if (s === 4) return 'translate(0, 32px) rotate(0deg)';
      if (s === 5) return 'translate(16px, 33px) rotate(0deg)';
      return 'translate(0, 63px) rotate(0deg)';
    }

    if (s === 1) return 'translate(14px, 4px) rotate(40deg) scale(1.1)';
    if (s === 2) return 'translate(0, 26px) rotate(0deg)';
    if (s === 3) return 'translate(28px, 0) rotate(0deg)';
    if (s === 4) return 'translate(0, 42px) rotate(0deg)';
    if (s === 5) return 'translate(22px, 44px) rotate(0deg)';
    return 'translate(0, 84px) rotate(0deg)';
  };

  const card1Score = score > 6 ? 6 : score;
  const card2Score = score > 6 ? (score - 6) : 0;

  const cardW = compact ? 'w-[40px]' : 'w-[54px]';
  const cardH = compact ? 'h-[60px]' : 'h-[80px]';

  return (
    <div className={`flex flex-col items-center transition-transform duration-300 ${isChanging ? 'scale-105' : 'scale-100'}`}>
      <div className={`relative ${cardH} ${cardW} rounded-[4px] shadow-2xl bg-slate-800`}>
        {/* The Base Card */}
        <div className="absolute inset-0 z-0">
          <CardFace suit={suit} compact={compact} />
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
               <CardFace suit={suit} compact={compact} />
               <div className="absolute inset-0 rounded-[4px] border border-black/5 shadow-inner" />
            </div>
          ) : (
            <CardBack className="w-full h-full absolute inset-[-1px]" />
          )}
        </div>
      </div>

      <div className="mt-1.5 sm:mt-2 relative group">
        <div className="absolute inset-0 bg-emerald-500/20 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative bg-black/60 backdrop-blur-md border border-white/10 px-2 sm:px-3 py-0.5 rounded-full shadow-xl overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full ${isChanging ? 'animate-[shimmer_1.5s_infinite]' : ''}`} />
          <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-black text-emerald-400/90 tracking-[0.2em] sm:tracking-[0.25em] uppercase tabular-nums`}>
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
