import type { FC } from 'react';

type Props = {
  failedPolls: number;
  isFetching: boolean;
  onReturnToMenu: () => void;
};

/**
 * Пока bot-move не вернул валидный ход — партия на паузе, в фоне идут повторы запроса.
 */
export const AiServiceInterruptModal: FC<Props> = ({ failedPolls, isFetching, onReturnToMenu }) => {
  return (
    <div
      className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xl animate-in fade-in duration-300"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ai-interrupt-title"
      aria-describedby="ai-interrupt-desc"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/40 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400/90">Ожидание ИИ</p>
        <h2 id="ai-interrupt-title" className="mt-2 text-lg font-black tracking-tight text-white sm:text-xl">
          Ждём ответ сервиса
        </h2>
        <p id="ai-interrupt-desc" className="mt-4 text-sm leading-relaxed text-white/70">
          Партия не продолжается без хода нейросети. Мы автоматически повторяем запрос, пока не придёт корректный
          ответ. Если нужно выйти — используйте кнопку ниже.
        </p>
        <div className="mt-6 flex min-h-[2.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          {isFetching ? (
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-emerald-400/90">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Запрос…
            </div>
          ) : (
            <p className="text-center text-[10px] font-bold uppercase tracking-widest text-white/45">
              Следующая попытка скоро
            </p>
          )}
          {failedPolls > 0 && (
            <p className="text-center text-[10px] text-white/50">
              Неудачных повторов подряд: <span className="font-black text-white/80">{failedPolls}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onReturnToMenu}
          className="mt-6 w-full rounded-xl border border-white/20 bg-white/5 py-3.5 text-[11px] font-black uppercase tracking-widest text-white transition hover:border-white/30 hover:bg-white/10 active:scale-[0.99]"
        >
          В меню
        </button>
      </div>
    </div>
  );
};
