import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { X } from 'lucide-react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';
  const styles = {
    primary: 'bg-mint text-[#052e21] hover:bg-mint/90',
    soft: 'bg-surface2 text-ink hover:bg-line/60',
    ghost: 'text-dim hover:text-ink hover:bg-surface2',
    danger: 'bg-danger/15 text-danger hover:bg-danger/25',
  } as const;
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-sm text-ink placeholder:text-dim/60 outline-none focus:border-mint/60 ${className}`}
      {...props}
    />
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface/70 p-4 ${className}`}>{children}</div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-dim">{children}</h2>
      {right}
    </div>
  );
}

/** Mobil öncelikli alt sayfa / modal */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 shadow-2xl md:max-w-lg md:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-dim hover:bg-surface2 hover:text-ink"
            aria-label="Kapat"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Emin misin? Tekrar dokun',
  className = '',
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
}) {
  return (
    <button
      className={className}
      onClick={(e) => {
        const el = e.currentTarget;
        if (el.dataset.armed === '1') {
          el.dataset.armed = '0';
          el.textContent = '';
          el.appendChild(children as unknown as Node);
          onConfirm();
          return;
        }
        el.dataset.armed = '1';
        el.dataset.orig = el.innerHTML;
        el.textContent = confirmLabel;
        setTimeout(() => {
          if (el.dataset.armed === '1') {
            el.dataset.armed = '0';
            el.innerHTML = el.dataset.orig ?? '';
          }
        }, 2500);
      }}
    >
      {children}
    </button>
  );
}
