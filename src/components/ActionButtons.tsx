interface ActionButtonsProps {
  isMultiplayer: boolean;
  aiEnabled: boolean;
  onAiToggle: () => void;
  isAutoPlay: boolean;
  onAutoPlayToggle: () => void;
  isTurboMode: boolean;
  onTurboToggle: () => void;
  onReset: () => void;
  onMenu: () => void;
  isAdmin?: boolean;
}

export const ActionButtons = ({ isMultiplayer, aiEnabled, onAiToggle, isAutoPlay, onAutoPlayToggle, isTurboMode, onTurboToggle, onReset, onMenu, isAdmin }: ActionButtonsProps) => {
  return (
    <div className="absolute bottom-6 right-4 z-[500] flex flex-col gap-3 items-end">
      <button 
        type="button"
        onClick={onAiToggle} 
        className={`w-12 h-12 backdrop-blur-xl border rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all ${aiEnabled ? 'border-blue-400/40 bg-blue-500/30 shadow-[0_0_18px_rgba(59,130,246,0.35)]' : 'border-white/10 bg-black/40'}`}
        title={aiEnabled ? 'Нейроботы: вкл.' : 'Нейроботы: выкл. (локальная логика)'}
      >
        <span className="text-lg">🧠</span>
      </button>
      <button 
        onClick={onAutoPlayToggle} 
        className={`w-12 h-12 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all ${isAutoPlay ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-black/40'}`}
        title="Авто-игра (Бот-режим)"
      >
        <span className="text-xl">🤖</span>
      </button>
      {isAdmin && (
        <button 
          onClick={onTurboToggle} 
          className={`w-12 h-12 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all ${isTurboMode ? 'bg-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.5)]' : 'bg-black/40'}`}
          title="Турбо-режим (для тестов)"
        >
          <span className="text-xl">⚡</span>
        </button>
      )}
      
      {isAdmin && (
        <button 
          onClick={onReset} 
          className="w-12 h-12 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all"
          title={isMultiplayer ? 'Раздать' : 'Заново'}
        >
          <span className="text-xl">🔄</span>
        </button>
      )}

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
