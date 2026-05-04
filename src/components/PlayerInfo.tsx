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

export const MiniFan = ({ count, position }: { count: number, position: 'top' | 'left' | 'right' }) => {
  const displayCount = Math.min(count, 5);
  const cards = Array.from({ length: displayCount });
  
  return (
    <div className={`flex relative ${position === 'top' ? 'h-6' : 'w-6 h-12'} items-center justify-center z-0`}>
      {cards.map((_, i) => {
        const offset = (i - (displayCount - 1) / 2) * 8;
        let transform = '';
        if (position === 'top') transform = `translateX(${offset}px) rotate(${offset}deg) translateY(-10px)`;
        else transform = `translateY(${offset}px) rotate(${offset}deg)`;

        return (
          <div
            key={i}
            style={{ transform, zIndex: i }}
            className={`absolute ${position === 'top' ? 'w-6 h-10' : 'w-10 h-6'} bg-gradient-to-br from-red-800 to-red-600 rounded-sm border border-white/10 shadow-sm`}
          />
        );
      })}
    </div>
  );
};

interface PlayerInfoProps {
  name: string;
  team: number;
  active?: boolean;
  cardsCount: number;
  isMe?: boolean;
  assignedSuit?: Suit;
  position: 'bottom' | 'top' | 'left' | 'right';
}

export const PlayerInfo = ({ name, team, active, cardsCount, isMe, assignedSuit, position }: PlayerInfoProps) => (
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
          
          <div className="absolute -bottom-1 -right-1 bg-red-600 px-1.5 py-0.5 min-w-[20px] rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white shadow-lg z-30">
            {cardsCount}
          </div>
        </div>

       {position === 'right' && <MiniFan count={cardsCount} position="right" />}
    </div>
    
    <div className={`px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-widest ${team === 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
      {isMe ? 'ВЫ' : (team === 0 ? 'ПАРТНЕР' : 'ВРАГ')}
    </div>
  </div>
);
