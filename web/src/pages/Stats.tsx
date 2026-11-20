import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { CatalogDto, ExpenseDto, MonthAgg } from '../api/types';
import {
  addMonths,
  currentYm,
  fmtAmount,
  fmtDeltaPct,
  fmtMonth,
  fmtTRY,
  monthRange,
  tzOffset,
} from '../lib/format';
import {
  byCategory,
  byDay,
  byHour,
  byType,
  calendarGrid,
  topExpenses,
  trendForSeries,
} from '../lib/stats';
import { CategoryDonut, DailyBarChart, HourChart, TrendChart } from '../components/charts';
import MonthNav from '../components/MonthNav';
import { Card, SectionTitle } from '../components/ui';

interface SeriesChip {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind: 'category' | 'type';
}

export default function StatsPage() {
  const [ym, setYm] = useState(currentYm());
  const [rows, setRows] = useState<ExpenseDto[]>([]);
  const [months, setMonths] = useState<MonthAgg[]>([]);
  const [catalog, setCatalog] = useState<CatalogDto | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const { from, to } = monthRange(ym);
    void api<{ rows: ExpenseDto[] }>(`/expenses?from=${from}&to=${to}&limit=500`).then((r) =>
      setRows(r.rows),
    );
  }, [ym]);

  useEffect(() => {
    void api<{ months: MonthAgg[] }>(`/stats/monthly?months=6&tz=${tzOffset()}`).then((r) =>
      setMonths(r.months),
    );
    void api<CatalogDto>('/catalog').then(setCatalog);
  }, []);

  const days = useMemo(() => byDay(rows), [rows]);
  const cats = useMemo(() => byCategory(rows), [rows]);
  const typeList = useMemo(
    () =>
      byType(
        rows,
        catalog?.categories.flatMap((c) => c.types.map((t) => ({ ...t, categoryColor: c.color }))) ?? [],
      ),
    [rows, catalog],
  );
  const hours = useMemo(() => byHour(rows), [rows]);
  const top = useMemo(() => topExpenses(rows, 5), [rows]);
  const grid = useMemo(() => calendarGrid(ym, rows), [ym, rows]);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const dayCount = Math.max(days.length, 1);
  const thisAgg = months.find((m) => m.ym === ym);
  const prevAgg = months.find((m) => m.ym === addMonths(ym, -1));
  const delta = thisAgg && prevAgg ? fmtDeltaPct(thisAgg.total, prevAgg.total) : null;
  const deltaUp = thisAgg && prevAgg ? thisAgg.total - prevAgg.total > 0 : false;
  const topCat = cats[0];

  // Trend grafiği için seçilebilir seriler
  const seriesChips: SeriesChip[] = useMemo(() => {
    if (!catalog) return [];
    const catChips: SeriesChip[] = catalog.categories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      kind: 'category',
    }));
    const typeChips: SeriesChip[] = catalog.categories.flatMap((c) =>
      c.types
        .filter((t) => !t.archived)
        .map((t) => ({ id: t.id, name: t.name, icon: t.icon, color: c.color, kind: 'type' as const })),
    );
    return [...catChips, ...typeChips];
  }, [catalog]);

  const selectedSeries = useMemo(
    () =>
      trendForSeries(
        months,
        seriesChips.filter((s) => selected.includes(s.id)),
      ),
    [months, seriesChips, selected],
  );

  const maxDay = Math.max(1, ...grid.flat().map((c) => c?.total ?? 0));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold tracking-tight">İstatistikler</h1>
      <MonthNav ym={ym} onChange={setYm} label={fmtMonth(ym)} canNext={ym < currentYm()} />

      {/* Özet kartları */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="!p-4">
          <p className="text-xs text-dim">Toplam harcama</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{fmtTRY(total)}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-dim">Harcama yapılan gün başına</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{fmtTRY(Math.round(total / dayCount))}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-dim">En çok harcanan kategori</p>
          <p className="mt-1 truncate text-xl font-bold">
            {topCat ? `${cats[0]!.total > 0 ? '' : ''}${topCat.name}` : '—'}
          </p>
          <p className="text-xs text-dim">{topCat ? fmtTRY(topCat.total) : ''}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-dim">Geçen aya göre</p>
          {delta ? (
            <>
              <p className={`mt-1 text-xl font-bold ${deltaUp ? 'text-danger' : 'text-mint'}`}>{delta}</p>
              <p className="text-xs text-dim">{fmtMonth(addMonths(ym, -1))}: {fmtTRY(prevAgg!.total)}</p>
            </>
          ) : (
            <p className="mt-1 text-xl font-bold text-dim">—</p>
          )}
        </Card>
      </div>

      {/* Günlük dağılım */}
      <section>
        <SectionTitle>Günlük harcama</SectionTitle>
        <Card>
          <DailyBarChart data={days} />
        </Card>
      </section>

      {/* Takvim ısı haritası */}
      <section>
        <SectionTitle>Ay takvimi</SectionTitle>
        <Card>
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-dim">
            {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {grid.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1.5">
                {week.map((cell, ci) => {
                  if (!cell) return <span key={ci} />;
                  const intensity = cell.total / maxDay;
                  const isToday = ym === currentYm() && cell.day === new Date().getDate();
                  return (
                    <div
                      key={ci}
                      title={`${cell.day}: ${fmtTRY(cell.total)}`}
                      className={`flex aspect-square flex-col items-center justify-center rounded-lg text-[10px] tabular-nums ${
                        cell.total > 0 ? 'text-ink' : 'text-dim/40'
                      } ${isToday ? 'ring-1 ring-mint' : ''}`}
                      style={{
                        background:
                          cell.total > 0
                            ? `rgba(52, 211, 153, ${0.12 + intensity * 0.55})`
                            : 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <span>{cell.day}</span>
                      {cell.total > 0 && (
                        <span className="text-[8px] leading-none text-dim">{Math.round(cell.total / 100)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* Kategori dağılımı */}
      <section>
        <SectionTitle>Kategori dağılımı</SectionTitle>
        <Card>
          <CategoryDonut data={cats} />
        </Card>
      </section>

      {/* Tür dağılımı */}
      <section>
        <SectionTitle>Tür dağılımı</SectionTitle>
        <Card>
          {typeList.length === 0 ? (
            <p className="py-6 text-center text-sm text-dim">Bu ay kayıt yok.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {typeList.map((t) => {
                const pct = total > 0 ? (t.total / total) * 100 : 0;
                return (
                  <li key={t.id}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span>
                        {t.icon} {t.name}
                      </span>
                      <span className="tabular-nums">
                        <b>{fmtTRY(t.total)}</b> <span className="text-dim">· %{Math.round(pct)}</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: t.color }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      {/* Trend + karşılaştırma */}
      <section>
        <SectionTitle right={<span className="text-[11px] text-dim">son 6 ay</span>}>
          Aylık trend
        </SectionTitle>
        <Card>
          <TrendChart
            labels={months.map((m) => m.ym)}
            total={months.map((m) => m.total)}
            series={selectedSeries}
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {seriesChips.map((s) => {
              const active = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    setSelected((prev) => (active ? prev.filter((id) => id !== s.id) : [...prev, s.id]))
                  }
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                    active ? 'border-mint bg-mint/10 text-mint' : 'border-line text-dim hover:text-ink'
                  }`}
                >
                  {s.icon} {s.name}
                </button>
              );
            })}
          </div>
        </Card>
      </section>

      {/* Kategori karşılaştırma tablosu */}
      <section>
        <SectionTitle>Kategori karşılaştırma</SectionTitle>
        <Card className="!px-2">
          {thisAgg && prevAgg ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-dim">
                  <th className="px-2 py-2 font-medium">Kategori</th>
                  <th className="px-2 py-2 text-right font-medium">Bu ay</th>
                  <th className="px-2 py-2 text-right font-medium">Geçen ay</th>
                  <th className="px-2 py-2 text-right font-medium">Değişim</th>
                </tr>
              </thead>
              <tbody>
                {(catalog?.categories ?? []).map((c) => {
                  const cur = thisAgg.byCategory[c.id] ?? 0;
                  const prev = prevAgg.byCategory[c.id] ?? 0;
                  if (cur === 0 && prev === 0) return null;
                  const up = cur > prev;
                  return (
                    <tr key={c.id} className="border-t border-line/60">
                      <td className="px-2 py-2.5">
                        <span className="mr-1.5">{c.icon}</span>
                        {c.name}
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{fmtAmount(cur)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-dim">{fmtAmount(prev)}</td>
                      <td
                        className={`px-2 py-2.5 text-right font-medium tabular-nums ${
                          up ? 'text-danger' : 'text-mint'
                        }`}
                      >
                        {fmtDeltaPct(cur, prev)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-line font-bold">
                  <td className="px-2 py-2.5">Toplam</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmtAmount(thisAgg.total)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-dim">{fmtAmount(prevAgg.total)}</td>
                  <td className={`px-2 py-2.5 text-right tabular-nums ${deltaUp ? 'text-danger' : 'text-mint'}`}>
                    {delta}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center text-sm text-dim">Karşılaştırma için veri bekleniyor…</p>
          )}
        </Card>
      </section>

      {/* Saat dağılımı */}
      <section>
        <SectionTitle>Günün saatleri</SectionTitle>
        <Card>
          <HourChart hours={hours} />
          <p className="mt-2 text-center text-[11px] text-dim">Hangi saatlerde daha çok harcıyorsun?</p>
        </Card>
      </section>

      {/* En büyük harcamalar */}
      <section>
        <SectionTitle>Ayın en büyük 5 harcaması</SectionTitle>
        <Card className="!py-1">
          {top.length === 0 ? (
            <p className="py-6 text-center text-sm text-dim">Bu ay kayıt yok.</p>
          ) : (
            top.map((e, i) => (
              <div key={e.id} className="flex items-center gap-3 border-b border-line/50 py-3 last:border-0">
                <span className="w-5 text-center text-xs text-dim">{i + 1}</span>
                <span className="text-lg">{e.typeIcon}</span>
                <div className="flex-1 truncate">
                  <div className="text-sm">{e.typeName}</div>
                  <div className="truncate text-[11px] text-dim">
                    {e.note ? `${e.note} · ` : ''}
                    {new Date(e.spentAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}{' '}
                    {String(new Date(e.spentAt).getHours()).padStart(2, '0')}:
                    {String(new Date(e.spentAt).getMinutes()).padStart(2, '0')}
                  </div>
                </div>
                <span className="font-bold tabular-nums">{fmtTRY(e.amount)}</span>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
