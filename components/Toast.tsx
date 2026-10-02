'use client';
import { useEffect } from 'react';

export interface ToastData { id: number; message: string; undo?: () => void }

export function Toast({ toast, onDone }: { toast: ToastData | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4" aria-live="polite">
      {toast && (
        <div className="pointer-events-auto flex items-center gap-4 rounded-full bg-[var(--text)] px-5 py-2.5 text-sm text-[var(--bg)]">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => { toast.undo?.(); onDone(); }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
