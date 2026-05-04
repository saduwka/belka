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
  if (rank === 'JACK') return 'В';
  if (rank === 'QUEEN') return 'Д';
  if (rank === 'KING') return 'К';
  if (rank === 'ACE') return 'Т';
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
      w-16 h-24 sm:w-20 sm:h-28 bg-white rounded-xl border-2 border-slate-200 shadow-2xl 
      flex flex-col items-center justify-center animate-play-${playerIdx} ${collectionClass}
    `}>
      <div className={`text-2xl sm:text-3xl ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        {getSuitSymbol(card.suit)}
      </div>
      <div className={`text-lg sm:text-xl font-black ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        {getRankDisplay(card.rank)}
      </div>
    </div>
  );
};
