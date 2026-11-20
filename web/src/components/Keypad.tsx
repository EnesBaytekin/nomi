import { Delete } from 'lucide-react';

interface KeypadProps {
  onDigit: (d: string) => void;
  onComma: () => void;
  onBackspace: () => void;
  onClear: () => void;
  onTripleZero: () => void;
}

const btn =
  'flex h-14 items-center justify-center rounded-2xl bg-surface2 text-xl font-semibold text-ink transition active:scale-95 active:bg-line/70 select-none';

export default function Keypad({ onDigit, onComma, onBackspace, onClear, onTripleZero }: KeypadProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} type="button" className={btn} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <button type="button" className={btn} onClick={onBackspace} aria-label="Sil">
        <Delete size={22} />
      </button>
      <button type="button" className={btn} onClick={() => onDigit('0')}>
        0
      </button>
      <button type="button" className={btn} onClick={onComma} aria-label="Virgül">
        ,
      </button>
      <button type="button" className={btn} onClick={onTripleZero}>
        000
      </button>
      <button
        type="button"
        className="col-span-4 flex h-10 items-center justify-center rounded-xl text-xs font-medium text-dim transition active:scale-[0.98] hover:text-ink"
        onClick={onClear}
      >
        Temizle
      </button>
    </div>
  );
}
