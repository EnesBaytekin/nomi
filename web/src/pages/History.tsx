import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { CatalogDto, ExpenseDto } from '../api/types';
import {
  currentYm,
  fmtAmount,
  fmtDayLong,
  fmtMonth,
  fmtTRY,
  fmtTime,
  fromLocalInput,
  monthRange,
  parseKeypadAmount,
  toLocalInput,
} from '../lib/format';
import MonthNav from '../components/MonthNav';
import { Button, Card, ConfirmButton, Input, Sheet } from '../components/ui';
import { useToast } from '../state/toast';

export default function HistoryPage() {
  const [ym, setYm] = useState(currentYm());
  const [rows, setRows] = useState<ExpenseDto[] | null>(null);
  const [editing, setEditing] = useState<ExpenseDto | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const { from, to } = monthRange(ym);
    const res = await api<{ rows: ExpenseDto[] }>(`/expenses?from=${from}&to=${to}&limit=500`);
    setRows(res.rows);
  }, [ym]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    if (!rows) return [];
    const map = new Map<number, ExpenseDto[]>();
    for (const r of rows) {
      const d = new Date(r.spentAt);
      d.setHours(0, 0, 0, 0);
      const arr = map.get(d.getTime());
      if (arr) arr.push(r);
      else map.set(d.getTime(), [r]);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [rows]);

  const total = rows?.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold tracking-tight">Geçmiş</h1>
      <MonthNav ym={ym} onChange={setYm} label={fmtMonth(ym)} canNext={ym < currentYm()} />
      <p className="px-1 text-sm text-dim">
        Toplam: <b className="text-ink">{fmtTRY(total)}</b> · {rows?.length ?? '…'} kayıt
      </p>

      {rows === null && <p className="py-8 text-center text-sm text-dim">Yükleniyor…</p>}

      {rows !== null && rows.length === 0 && (
        <Card className="py-10 text-center text-sm text-dim">Bu ay kayıt yok.</Card>
      )}

      {grouped.map(([dayTs, items]) => (
        <div key={dayTs}>
          <div className="mb-1.5 flex items-baseline justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-dim">{fmtDayLong(dayTs)}</h2>
            <span className="text-xs font-semibold text-dim tabular-nums">
              {fmtTRY(items.reduce((s, r) => s + r.amount, 0))}
            </span>
          </div>
          <Card className="!py-0.5">
            {items.map((e) => (
              <button
                key={e.id}
                onClick={() => setEditing(e)}
                className="flex w-full items-center gap-3 border-b border-line/40 py-3 text-left last:border-0"
              >
                <span className="text-xl">{e.typeIcon}</span>
                <div className="flex-1 truncate">
                  <div className="text-sm font-medium">{e.typeName}</div>
                  {e.note && <div className="truncate text-[11px] text-dim">{e.note}</div>}
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold tabular-nums">{fmtAmount(e.amount)}</div>
                  <div className="text-[11px] text-dim">{fmtTime(e.spentAt)}</div>
                </div>
              </button>
            ))}
          </Card>
        </div>
      ))}

      <EditSheet
        expense={editing}
        onClose={() => setEditing(null)}
        onChanged={() => {
          setEditing(null);
          void load();
        }}
      />
    </div>
  );
}

function EditSheet({
  expense,
  onClose,
  onChanged,
}: {
  expense: ExpenseDto | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [catalog, setCatalog] = useState<CatalogDto | null>(null);
  const [amountStr, setAmountStr] = useState('');
  const [typeId, setTypeId] = useState<string>('');
  const [note, setNote] = useState('');
  const [spentAt, setSpentAt] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (catalog) return;
    void api<CatalogDto>('/catalog').then(setCatalog);
  }, [catalog]);

  useEffect(() => {
    if (expense) {
      setAmountStr((expense.amount / 100).toString().replace('.', ','));
      setTypeId(expense.typeId);
      setNote(expense.note ?? '');
      setSpentAt(toLocalInput(expense.spentAt));
    }
  }, [expense]);

  if (!expense) return null;

  const kurus = parseKeypadAmount(amountStr);

  const save = async () => {
    if (kurus <= 0 || !typeId) return;
    setBusy(true);
    try {
      await api(`/expenses/${expense.id}`, {
        method: 'PATCH',
        body: { amount: kurus, typeId, note: note.trim() || null, spentAt: fromLocalInput(spentAt) },
      });
      toast.show('Güncellendi');
      onChanged();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Güncellenemedi', 'err');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/expenses/${expense.id}`, { method: 'DELETE' });
      toast.show('Silindi');
      onChanged();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Silinemedi', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Harcamayı Düzenle">
      <div className="flex flex-col gap-3">
        <Input
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value.replace(/[^\d,]/g, ''))}
          className="text-center text-2xl font-bold"
        />
        <Input
          type="datetime-local"
          value={spentAt}
          onChange={(e) => setSpentAt(e.target.value)}
        />
        <div className="max-h-56 overflow-y-auto rounded-xl border border-line p-2">
          <div className="grid grid-cols-3 gap-1.5">
            {(catalog?.categories ?? []).flatMap((c) =>
              c.types
                .filter((t) => !t.archived)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTypeId(t.id)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 text-[11px] ${
                      typeId === t.id ? 'border-mint bg-mint/10 text-mint' : 'border-line text-ink/80'
                    }`}
                  >
                    <span className="text-base">{t.icon}</span>
                    {t.name}
                  </button>
                )),
            )}
          </div>
        </div>
        <Input
          placeholder="Not"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
        />
        <div className="mt-1 flex gap-2">
          <Button variant="soft" className="flex-1" onClick={save} disabled={busy || kurus <= 0}>
            Kaydet
          </Button>
          <ConfirmButton
            onConfirm={remove}
            confirmLabel="Silmek istediğine emin misin?"
            className="rounded-xl bg-danger/15 px-4 py-2.5 text-sm font-semibold text-danger transition active:scale-[0.97]"
          >
            Sil
          </ConfirmButton>
        </div>
      </div>
    </Sheet>
  );
}
