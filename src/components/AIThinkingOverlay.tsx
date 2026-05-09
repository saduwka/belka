import { useGameStore } from '../store/gameStore';

export function AIThinkingOverlay() {
  const aiThinking = useGameStore((s) => s.aiThinking);
  if (!aiThinking) return null;

  return (
    <div className="pointer-events-none fixed top-20 left-1/2 z-[600] -translate-x-1/2 animate-in fade-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3 rounded-full border border-white/15 bg-black/40 px-5 py-2.5 shadow-2xl backdrop-blur-xl">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest text-white/90">
          Нейросеть ходит…
        </span>
      </div>
    </div>
  );
}
