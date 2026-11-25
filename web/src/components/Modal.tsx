import { X } from '@phosphor-icons/react';
import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--color-foreground)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
