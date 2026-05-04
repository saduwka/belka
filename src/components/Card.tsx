import { Card as CardType } from '../core/types';

const getSuitSymbol = (suit: string) => {
  switch (suit) {
    case 'CLUBS': return '♣️';
    case 'SPADES': return '♠️';
    case 'HEARTS': return '♥️';
    case 'DIAMONDS': return '♦️';
    default: return '';
  }
};

const getRankDisplay = (rank: string) => {
  if (rank === 'JACK') return 'J';
  if (rank === 'QUEEN') return 'Q';
  if (rank === 'KING') return 'K';
  if (rank === 'ACE') return 'A';
  return rank;
};

interface CardProps {
  card: CardType;
  onClick?: () => void;
  disabled?: boolean;
  isSelected?: boolean;
  index: number;
  total: number;
}

export const Card = ({ card, onClick, disabled, isSelected, index, total }: CardProps) => {
  const isRed = card.suit === 'HEARTS' || card.suit === 'DIAMONDS';
  const mid = (total - 1) / 2;
  const angle = (index - mid) * (total > 6 ? 8 : 10);
  const arcY = Math.pow(Math.abs(index - mid), 2) * 2;
  const translateY = isSelected ? -60 : arcY;

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      style={{ 
        transform: `rotate(${angle}deg) translateY(${translateY}px)`,
        transformOrigin: '50% 200%',
        marginLeft: index === 0 ? 0 : '-55px',
        zIndex: isSelected ? 500 : index,
      }}
      className={`
        relative w-[65px] h-[95px] sm:w-[90px] sm:h-[135px] 
        bg-white rounded-xl border shadow-2xl transition-all duration-300 animate-deal
        flex flex-col items-center justify-between py-2 px-1
        ${disabled ? 'grayscale-[0.5]' : 'cursor-pointer hover:brightness-110'}
        ${isSelected ? 'border-emerald-500 ring-4 ring-emerald-500/30' : 'border-slate-200'}
      `}
    >
      <div className={`text-base sm:text-lg font-black self-start pl-1 ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        {getRankDisplay(card.rank)}
      </div>
      <div className={`text-2xl sm:text-4xl ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        {getSuitSymbol(card.suit)}
      </div>
      <div className={`text-base sm:text-lg font-black self-end pr-1 rotate-180 ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        {getRankDisplay(card.rank)}
      </div>
    </div>
  );
};
