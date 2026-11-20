import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function MonthNav({
  ym,
  onChange,
  label,
  canNext,
}: {
  ym: string;
  onChange: (ym: string) => void;
  label: string;
  canNext: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-surface/70 px-2 py-2">
      <button
        onClick={() => onChange(shift(ym, -1))}
        className="rounded-xl p-2 text-dim hover:bg-surface2 hover:text-ink"
        aria-label="Önceki ay"
      >
        <ChevronLeft size={20} />
      </button>
      <span className="text-sm font-bold">{label}</span>
      <button
        onClick={() => canNext && onChange(shift(ym, 1))}
        disabled={!canNext}
        className="rounded-xl p-2 text-dim hover:bg-surface2 hover:text-ink disabled:opacity-25"
        aria-label="Sonraki ay"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

function shift(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
