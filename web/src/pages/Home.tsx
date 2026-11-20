import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock, StickyNote } from 'lucide-react';
import { api } from '../api/client';
import type { ExpenseDto, HomeDto } from '../api/types';
import { fmtTRY, fromLocalInput, parseKeypadAmount, toLocalInput } from '../lib/format';
import { useToast } from '../state/toast';
import Keypad from '../components/Keypad';
import { Input } from '../components/ui';

export default function HomePage() {
  const toast = useToast();
  const [home, setHome] = useState<HomeDto | null>(null);
  const [amount, setAmount] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [spentAtLocal, setSpentAtLocal] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await api<HomeDto>('/home');
    setHome(data);
    return data;
  }, []);

  useEffect(() => {
    void load().then((data) => {
      // En son kullanılan tür önceden seçili gelsin: en az dokunuş
      const last = data.recentTypeIds[0] ?? data.types[0]?.id;
      if (last) setTypeId((prev) => prev ?? last);
    });
  }, [load]);

  const kurus = parseKeypadAmount(amount);

  const orderedTypes = useMemo(() => {
    if (!home) return [];
    const rank = new Map(home.recentTypeIds.map((id, i) => [id, i]));
    return [...home.types].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
  }, [home]);

  const pushDigit = (d: string) => {
    setAmount((prev) => {
      const [int, dec] = prev.split(',');
      if (prev.includes(',')) {
        if ((dec?.length ?? 0) >= 2) return prev;
        return prev + d;
      }
      if ((int?.length ?? 0) >= 9) return prev;
      return prev === '0' ? d : prev + d;
    });
  };

  const pushComma = () => setAmount((prev) => (prev.includes(',') ? prev : prev === '' ? '0,' : prev + ','));
  const backspace = () => setAmount((prev) => prev.slice(0, -1));
  const clear = () => setAmount('');
  const pushTripleZero = () =>
    setAmount((prev) => (prev === '' || prev.includes(',') || prev.length > 6 ? prev : prev + '000'));

  const quickAdd = (n: number) => {
    setAmount((prev) => {
      const next = parseKeypadAmount(prev) + n * 100;
      return fmtInput(next);
    });
  };

  const save = async () => {
    if (!typeId || kurus <= 0 || saving) return;
    setSaving(true);
    try {
      await api('/expenses', {
        method: 'POST',
        body: {
          typeId,
          amount: kurus,
          note: note.trim() || null,
          ...(spentAtLocal ? { spentAt: fromLocalInput(spentAtLocal) } : {}),
        },
      });
      navigator.vibrate?.(12);
      toast.show(`Kaydedildi · ${fmtTRY(kurus)}`);
      setAmount('');
      setNote('');
      setSpentAtLocal('');
      setShowDetail(false);
      await load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Kaydedilemedi', 'err');
    } finally {
      setSaving(false);
    }
  };

  const deleteToday = async (id: string) => {
    try {
      await api(`/expenses/${id}`, { method: 'DELETE' });
      toast.show('Silindi');
      await load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Silinemedi', 'err');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Üst özet */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Hızlı Kayıt</h1>
          <p className="text-xs text-dim">Ne kadar harcadın?</p>
        </div>
        {home && (
          <div className="flex flex-col items-end text-xs text-dim">
            <span>
              Bugün: <b className="text-ink">{fmtTRY(home.todayTotal)}</b>
            </span>
            <span>
              Bu ay: <b className="text-ink">{fmtTRY(home.monthTotal)}</b>
            </span>
          </div>
        )}
      </div>

      {/* Tutar ekranı */}
      <div className="rounded-3xl border border-line bg-surface/70 p-5 text-center">
        <div
          className={`min-h-16 break-all text-5xl font-bold tracking-tight transition ${
            kurus > 0 ? 'text-ink' : 'text-dim/40'
          }`}
        >
          {formatDisplay(amount)}
          <span className="ml-2 text-2xl text-dim">₺</span>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {[10, 50, 100, 500].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => quickAdd(n)}
              className="rounded-full bg-surface2 px-3.5 py-1.5 text-xs font-semibold text-dim transition active:scale-95 hover:text-mint"
            >
              +{n}
            </button>
          ))}
        </div>
      </div>

      {/* Tür seçimi */}
      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-dim">Ne için?</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {orderedTypes.map((t) => {
            const active = typeId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeId(t.id)}
                className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 transition active:scale-95 ${
                  active ? 'border-mint bg-mint/10' : 'border-line bg-surface/60 hover:border-dim/40'
                }`}
              >
                <span className="text-xl leading-none">{t.icon}</span>
                <span className={`text-[11px] font-medium leading-tight ${active ? 'text-mint' : 'text-ink/80'}`}>
                  {t.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detay (not + tarih) */}
      <div className="rounded-2xl border border-line bg-surface/50">
        <button
          type="button"
          onClick={() => {
            setShowDetail((v) => !v);
            if (!spentAtLocal) setSpentAtLocal(toLocalInput(Date.now()));
          }}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm text-dim"
        >
          <StickyNote size={16} />
          {note ? `Not: ${note}` : 'Not ekle (isteğe bağlı)'}
          <span className="ml-auto flex items-center gap-1 text-xs">
            <Clock size={13} />
            {spentAtLocal ? spentAtLocal.replace('T', ' ') : 'şimdi'}
          </span>
        </button>
        {showDetail && (
          <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
            <Input
              placeholder="Not (ör. market, kahve…)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={280}
            />
            <div className="flex items-center gap-2">
              <Input
                type="datetime-local"
                value={spentAtLocal}
                onChange={(e) => setSpentAtLocal(e.target.value)}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setSpentAtLocal(toLocalInput(Date.now()))}
                className="rounded-xl bg-surface2 px-3 py-2.5 text-xs font-semibold text-dim hover:text-ink"
              >
                Şimdi
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tuş takımı */}
      <Keypad
        onDigit={pushDigit}
        onComma={pushComma}
        onBackspace={backspace}
        onClear={clear}
        onTripleZero={pushTripleZero}
      />

      {/* Kaydet */}
      <button
        type="button"
        onClick={save}
        disabled={kurus <= 0 || !typeId || saving}
        className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-mint text-lg font-bold text-[#052e21] shadow-lg shadow-mint/20 transition active:scale-[0.98] disabled:opacity-30 disabled:shadow-none"
      >
        <Check size={22} strokeWidth={3} />
        Kaydet
      </button>

      {/* Bugünün kayıtları */}
      {home && home.today.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface/50 p-3">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-dim">Bugün</p>
          <ul className="flex flex-col">
            {home.today.map((e: ExpenseDto) => (
              <li key={e.id} className="flex items-center gap-3 px-1 py-2 text-sm">
                <span className="text-lg">{e.typeIcon}</span>
                <span className="flex-1 truncate">{e.typeName}</span>
                <span className="font-semibold">{fmtTRY(e.amount)}</span>
                <button
                  onClick={() => deleteToday(e.id)}
                  className="rounded-lg px-2 py-1 text-xs text-dim hover:text-danger"
                  aria-label="Sil"
                >
                  sil
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Tuş takımı dizgisini okunur biçime getirir: "1234,5" → "1.234,5" */
function formatDisplay(s: string): string {
  if (!s) return '0';
  const [int, dec] = s.split(',');
  const grouped = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(int || '0'));
  return s.includes(',') ? `${grouped},${dec ?? ''}` : grouped;
}

/** Kuruşu tuş takımı dizgisine çevirir */
function fmtInput(kurus: number): string {
  const lira = Math.floor(kurus / 100);
  const rem = kurus % 100;
  if (rem === 0) return String(lira);
  return `${lira},${String(rem).padStart(2, '0')}`;
}
