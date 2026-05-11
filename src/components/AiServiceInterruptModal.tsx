import type { FC } from 'react';

type Props = {
  onReturnToMenu: () => void;
};

/**
 * Показывается, когда включён ИИ с API, но bot-move недоступен или ответ невалиден.
 * Без подмены движком — только выход в меню.
 */
export const AiServiceInterruptModal: FC<Props> = ({ onReturnToMenu }) => {
  return (
    <div
      className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xl animate-in fade-in duration-300"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ai-interrupt-title"
      aria-describedby="ai-interrupt-desc"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/40 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400/90">ИИ временно недоступен</p>
        <h2 id="ai-interrupt-title" className="mt-2 text-lg font-black tracking-tight text-white sm:text-xl">
          Не удалось получить ход нейросети
        </h2>
        <p id="ai-interrupt-desc" className="mt-4 text-sm leading-relaxed text-white/70">
          Мы уже работаем над восстановлением сервиса. Пока можно выйти в меню и начать партию позже — без подмены
          ходов локальным движком, чтобы партия оставалась честной относительно ИИ.
        </p>
        <button
          type="button"
          onClick={onReturnToMenu}
          className="mt-8 w-full rounded-xl border border-white/20 bg-white/5 py-3.5 text-[11px] font-black uppercase tracking-widest text-white transition hover:border-emerald-500/40 hover:bg-emerald-500/15 active:scale-[0.99]"
        >
          В меню
        </button>
      </div>
    </div>
  );
};
