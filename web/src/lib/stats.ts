import type { ExpenseDto, MonthAgg } from '../api/types';
import { dayKey } from './format';

export interface DayBucket {
  day: string; // 2026-11-12
  ts: number;
  total: number;
}

export interface Named {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface NamedTotal extends Named {
  total: number;
}

export function byDay(rows: ExpenseDto[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const r of rows) {
    const key = dayKey(r.spentAt);
    const existing = map.get(key);
    if (existing) {
      existing.total += r.amount;
    } else {
      map.set(key, { day: key, ts: r.spentAt, total: r.amount });
    }
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function byCategory(rows: ExpenseDto[]): NamedTotal[] {
  return groupTotals(rows, (r) => ({
    id: r.categoryId,
    name: r.categoryName,
    icon: '📁',
    color: r.categoryColor,
  }));
}

export function byType(rows: ExpenseDto[], types: Array<{ id: string; name: string; icon: string; categoryColor: string }>): NamedTotal[] {
  const meta = new Map(types.map((t) => [t.id, t]));
  return groupTotals(rows, (r) => {
    const t = meta.get(r.typeId);
    return {
      id: r.typeId,
      name: r.typeName,
      icon: r.typeIcon,
      color: t?.categoryColor ?? r.categoryColor,
    };
  });
}

function groupTotals(rows: ExpenseDto[], keyOf: (r: ExpenseDto) => Named): NamedTotal[] {
  const map = new Map<string, NamedTotal>();
  for (const r of rows) {
    const k = keyOf(r);
    const existing = map.get(k.id);
    if (existing) {
      existing.total += r.amount;
    } else {
      map.set(k.id, { ...k, total: r.amount });
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function byHour(rows: ExpenseDto[]): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const r of rows) hours[new Date(r.spentAt).getHours()]! += r.amount;
  return hours;
}

export function topExpenses(rows: ExpenseDto[], n = 5): ExpenseDto[] {
  return [...rows].sort((a, b) => b.amount - a.amount).slice(0, n);
}

/** Ay gün sayısı (yerel) */
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(y, m, 0).getDate();
}

/** Takvim ısı haritası: hafta satırları (Pzt başlangıç), her hücre gün + toplam */
export function calendarGrid(ym: string, rows: ExpenseDto[]): Array<Array<{ day: number; total: number } | null>> {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const totals = new Map<string, number>();
  for (const r of rows) {
    const k = dayKey(r.spentAt);
    totals.set(k, (totals.get(k) ?? 0) + r.amount);
  }
  const first = new Date(y, m - 1, 1);
  const count = daysInMonth(ym);
  const offset = (first.getDay() + 6) % 7; // Pazartesi = 0

  const grid: Array<Array<{ day: number; total: number } | null>> = [];
  let week: Array<{ day: number; total: number } | null> = new Array(offset).fill(null);
  for (let day = 1; day <= count; day++) {
    const key = `${ym}-${String(day).padStart(2, '0')}`;
    week.push({ day, total: totals.get(key) ?? 0 });
    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
  }
  if (week.length > 0) grid.push([...week, ...new Array(7 - week.length).fill(null)]);
  return grid;
}

/** Seçili serilerin (kategori/tür) aylık toplamları — trend grafiği için */
export interface TrendSeries {
  id: string;
  name: string;
  icon: string;
  color: string;
  values: number[]; // months dizisiyle hizalı
}

export function trendForSeries(
  months: MonthAgg[],
  series: Array<{ id: string; name: string; icon: string; color: string; kind: 'category' | 'type' }>,
): TrendSeries[] {
  return series.map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    color: s.color,
    values: months.map((m) => (s.kind === 'category' ? m.byCategory[s.id] : m.byType[s.id]) ?? 0),
  }));
}
