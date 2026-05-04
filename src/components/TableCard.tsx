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

interface TableCardProps {
  card: CardType;
  playerIdx: number;
  isCollecting: boolean;
  winnerIdx: number | null;
}

export const TableCard = ({ card, playerIdx, isCollecting, winnerIdx }: TableCardProps) => {
  const isRed = card.suit === 'HEARTS' || card.suit === 'DIAMONDS';
  const collectionClass = isCollecting && winnerIdx !== null ? `collecting-trick-${winnerIdx}` : '';

  return (
    <div className={`
      relative w-16 h-24 sm:w-[90px] sm:h-[135px] 
      bg-white rounded-xl border-2 border-slate-200 shadow-2xl 
      flex flex-col items-center justify-between py-2 px-1
      animate-play-${playerIdx} ${collectionClass}
    `}>
      <div className={`text-xs sm:text-lg font-black self-start pl-1 ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        {getRankDisplay(card.rank)}
      </div>
      
      <div className={`text-2xl sm:text-4xl ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        {getSuitSymbol(card.suit)}
      </div>

      <div className={`text-xs sm:text-lg font-black self-end pr-1 rotate-180 ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        {getRankDisplay(card.rank)}
      </div>
    </div>
  );
};
