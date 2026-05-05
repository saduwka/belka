import { Suit } from '../core/types';

const getSuitSymbol = (suit: string) => {
  switch (suit) {
    case 'CLUBS': return '♣️';
    case 'SPADES': return '♠️';
    case 'HEARTS': return '♥️';
    case 'DIAMONDS': return '♦️';
    default: return '';
  }
};

import { CardBack } from './CardBack';

export const MiniFan = ({ count, position }: { count: number, position: 'top' | 'left' | 'right' }) => {
  const displayCount = Math.min(count, 8);
  const cards = Array.from({ length: displayCount });
  const mid = (displayCount - 1) / 2;
  
  return (
    <div className={`relative ${position === 'top' ? 'h-[60px] w-[100px]' : 'w-[50px] h-[100px]'} flex items-center justify-center z-0`}>
      {cards.map((_, i) => {
        const idx = i - mid;
        // Same logic as player hand but tighter
        const angle = idx * 8;
        const arc = Math.pow(Math.abs(idx), 2) * 1.5;
        
        let transform = '';
        if (position === 'top') {
          // Arc like player hand but upside down and tight
          transform = `translateX(${idx * 6}px) translateY(${arc - 10}px) rotate(${-angle}deg) rotate(180deg)`;
        } else if (position === 'left') {
          // Arc facing center
          transform = `translateY(${idx * 4}px) translateX(${30 - arc}px) rotate(${angle}deg)`;
        } else {
          // Arc facing center (mirrored)
          transform = `translateY(${idx * 4}px) translateX(${arc - 30}px) rotate(${-angle}deg)`;
        }

        return (
          <CardBack
            key={i}
            width={40}
            height={60}
            patternScale={0.5}
            style={{ transform, zIndex: i }}
            className="absolute shadow-lg !rounded-[3px]"
          />
        );
      })}
    </div>
  );
};

interface PlayerInfoProps {
  name: string;
  relation: 'ME' | 'PARTNER' | 'ENEMY' | 'TEAM_A' | 'TEAM_B';
  active?: boolean;
  cardsCount: number;
  assignedSuit?: Suit;
  position: 'bottom' | 'top' | 'left' | 'right';
  isAdmin?: boolean;
}

export const PlayerInfo = ({ name, relation, active, cardsCount, assignedSuit, position, isAdmin }: PlayerInfoProps) => {
  const isMe = relation === 'ME';
  const bgColor = (relation === 'PARTNER' || relation === 'TEAM_A' || isMe) 
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
    : 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    
  const label = isMe ? 'ВЫ' : 
                relation === 'PARTNER' ? 'ПАРТНЕР' : 
                relation === 'ENEMY' ? 'СОПЕРНИК' : 
                relation === 'TEAM_A' ? 'КОМАНДА А' : 'КОМАНДА Б';

  return (
  <div className={`flex flex-col items-center gap-1 transition-all duration-500 ${active ? 'scale-110' : 'opacity-80'}`}>
    {position === 'top' && <MiniFan count={cardsCount} position="top" />}
    
    <div className="flex items-center gap-3">
       {position === 'left' && <MiniFan count={cardsCount} position="left" />}
       
       <div className={`
          relative w-12 h-12 sm:w-16 sm:h-16 rounded-full border-4 flex items-center justify-center shadow-2xl
          ${active ? 'border-emerald-500 bg-emerald-500/20' : 'border-white/10 bg-black/40 backdrop-blur-md'}
        `}>
          <span className="text-xl sm:text-2xl font-black text-white">{isMe ? 'Я' : name[0]}</span>
          {active && <div className="absolute inset-0 rounded-full animate-ping border-2 border-emerald-400 opacity-30"></div>}
          
          {assignedSuit && (
            <div className="absolute -top-1 -left-1 bg-white w-5 h-5 sm:w-7 sm:h-7 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] sm:text-sm shadow-md z-30">
              {getSuitSymbol(assignedSuit)}
            </div>
          )}

          {isAdmin && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-lg sm:text-2xl drop-shadow-lg animate-bounce z-40">
              👑
            </div>
          )}
          
          <div className="absolute -bottom-1 -right-1 bg-red-600 px-1.5 py-0.5 min-w-[20px] rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white shadow-lg z-30">
            {cardsCount}
          </div>
        </div>

       {position === 'right' && <MiniFan count={cardsCount} position="right" />}
    </div>
    
    <div className={`px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-widest border ${bgColor}`}>
      {isMe ? label : `${label} • ${name}`}
    </div>
  </div>
  );
};
