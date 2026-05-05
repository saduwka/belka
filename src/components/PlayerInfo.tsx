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

  const isVertical = position === 'left' || position === 'right';
  const cw = isVertical ? 24 : 26;
  const ch = isVertical ? 36 : 40;

  return (
    <div
      className="relative flex items-center justify-center z-0"
      style={{
        width: isVertical ? 50 : 100,
        height: isVertical ? 70 : 42,
      }}
    >
      {cards.map((_, i) => {
        const idx = i - mid;
        const angle = idx * 4;

        let transform = '';
        if (position === 'top') {
          // Horizontal fan, flipped upside-down toward top player
          const spread = idx * 8;
          transform = `translateX(${spread}px) rotate(${-angle + 180}deg)`;
        } else if (position === 'left') {
          // Vertical fan: cards rotated 90° so long side faces center, fanning toward left
          transform = `translateX(${-Math.abs(idx) * 1}px) rotate(${angle + 90}deg)`;
        } else {
          // Vertical fan: cards rotated -90° so long side faces center, fanning toward right
          transform = `translateX(${Math.abs(idx) * 1}px) rotate(${-angle - 90}deg)`;
        }

        return (
          <CardBack
            key={i}
            width={cw}
            height={ch}
            patternScale={0.5}
            style={{
              transform,
              zIndex: i,
              position: 'absolute',
              top: isVertical ? `${i * 5}px` : undefined,
            }}
            className="shadow-md !rounded-[2px]"
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
  afkTimer?: number | null;
}

export const PlayerInfo = ({ name, relation, active, cardsCount, assignedSuit, position, isAdmin, afkTimer }: PlayerInfoProps) => {
  const isMe = relation === 'ME';
  const bgColor = (relation === 'PARTNER' || relation === 'TEAM_A' || isMe) 
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
    : 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    
  const label = isMe ? 'ВЫ' : 
                relation === 'PARTNER' ? 'ПАРТНЕР' : 
                relation === 'ENEMY' ? 'СОПЕРНИК' : 
                relation === 'TEAM_A' ? 'КОМАНДА А' : 'КОМАНДА Б';

  const avatar = (
    <div className={`
      relative w-12 h-12 sm:w-16 sm:h-16 rounded-full border-4 flex items-center justify-center shadow-2xl shrink-0
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

      {afkTimer != null && (
        <div className={`absolute -bottom-1 -left-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white shadow-lg z-30 ${
          afkTimer > 20 ? 'bg-emerald-500' : afkTimer > 10 ? 'bg-yellow-500' : 'bg-red-500'
        }`}>
          {afkTimer}
        </div>
      )}
    </div>
  );

  const labelEl = (
    <div className={`px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-widest border ${bgColor}`}>
      {isMe ? label : `${label} • ${name}`}
    </div>
  );

  // Left/right: horizontal layout with fan toward table center
  if (position === 'left') {
    return (
      <div className={`flex flex-col items-center gap-1 transition-all duration-500 ${active ? 'scale-110' : 'opacity-80'}`}>
        <div className="flex items-center gap-1">
          {avatar}
          <MiniFan count={cardsCount} position="left" />
        </div>
        {labelEl}
      </div>
    );
  }

  if (position === 'right') {
    return (
      <div className={`flex flex-col items-center gap-1 transition-all duration-500 ${active ? 'scale-110' : 'opacity-80'}`}>
        <div className="flex items-center gap-1">
          <MiniFan count={cardsCount} position="right" />
          {avatar}
        </div>
        {labelEl}
      </div>
    );
  }

  // Top/bottom: vertical layout
  return (
    <div className={`flex flex-col items-center gap-1 transition-all duration-500 ${active ? 'scale-110' : 'opacity-80'}`}>
      {position === 'top' && <MiniFan count={cardsCount} position="top" />}
      {avatar}
      {labelEl}
    </div>
  );
};
