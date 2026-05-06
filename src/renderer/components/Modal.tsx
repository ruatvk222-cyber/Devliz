import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: ModalProps): JSX.Element | null {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-20"
      onClick={onClose}
    >
      <div
        className={`card w-full ${width} mx-4 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost p-1">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-border flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
