import { useEffect, useRef } from 'react';

interface Toast {
  id: number;
  text: string;
  kind?: 'info' | 'warn' | 'success';
}

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export type { Toast };

export default function Toasts({ toasts, onDismiss }: Props) {
  const timers = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    for (const t of toasts) {
      if (timers.current.has(t.id)) continue;
      const handle = window.setTimeout(() => onDismiss(t.id), 4000);
      timers.current.set(t.id, handle);
    }
    // cleanup dismissed
    for (const id of timers.current.keys()) {
      if (!toasts.some((t) => t.id === id)) {
        window.clearTimeout(timers.current.get(id));
        timers.current.delete(id);
      }
    }
  }, [toasts, onDismiss]);

  return (
    <div className="fixed bottom-4 inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((t) => {
        const color =
          t.kind === 'warn'
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
            : t.kind === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
              : 'bg-sky-500/15 border-sky-500/40 text-sky-100';
        return (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-sm w-full text-sm border rounded-2xl px-4 py-3 backdrop-blur-md shadow-lg animate-[slideup_0.2s_ease] ${color}`}
            onClick={() => onDismiss(t.id)}
          >
            {t.text}
          </div>
        );
      })}
    </div>
  );
}
