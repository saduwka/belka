interface ActionButtonsProps {
  isMultiplayer: boolean;
  onReset: () => void;
  onMenu: () => void;
}

export const ActionButtons = ({ isMultiplayer, onReset, onMenu }: ActionButtonsProps) => {
  return (
    <div className="absolute bottom-6 right-4 z-[500] flex flex-col gap-3 items-end">
      <button 
        onClick={onReset} 
        className="w-12 h-12 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all"
        title={isMultiplayer ? 'Раздать' : 'Заново'}
      >
        <span className="text-xl">🔄</span>
      </button>
      <button 
        onClick={onMenu} 
        className="w-12 h-12 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all"
        title="Меню"
      >
        <span className="text-xl">🏠</span>
      </button>
    </div>
  );
};
