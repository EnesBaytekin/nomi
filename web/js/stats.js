// Gruplama/istatistik yardımcıları.

import { dayKey } from './format.js';

/** → [{ day: '2026-11-12', ts, total }] gün sıralı */
export function byDay(rows) {
  const map = new Map();
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

export function byCategory(rows) {
  return groupTotals(rows, (r) => ({
    id: r.categoryId,
    name: r.categoryName,
    icon: '📁',
    color: r.categoryColor,
  }));
}

export function byType(rows, types) {
  const meta = new Map(types.map((t) => [t.id, t]));
  return groupTotals(rows, (r) => {
    const t = meta.get(r.typeId);
    return {
      id: r.typeId,
      name: r.typeName,
      icon: r.typeIcon,
      color: (t && t.categoryColor) ?? r.categoryColor,
    };
  });
}

function groupTotals(rows, keyOf) {
  const map = new Map();
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

export function byHour(rows) {
  const hours = new Array(24).fill(0);
  for (const r of rows) hours[new Date(r.spentAt).getHours()] += r.amount;
  return hours;
}

export function topExpenses(rows, n = 5) {
  return [...rows].sort((a, b) => b.amount - a.amount).slice(0, n);
}

/** Ay gün sayısı (yerel) */
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Takvim ısı haritası: hafta satırları (Pzt başlangıç), her hücre { day, total } */
export function calendarGrid(ym, rows) {
  const [y, m] = ym.split('-').map(Number);
  const totals = new Map();
  for (const r of rows) {
    const k = dayKey(r.spentAt);
    totals.set(k, (totals.get(k) ?? 0) + r.amount);
  }
  const first = new Date(y, m - 1, 1);
  const count = daysInMonth(ym);
  const offset = (first.getDay() + 6) % 7; // Pazartesi = 0

  const grid = [];
  let week = new Array(offset).fill(null);
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
export function trendForSeries(months, series) {
  return series.map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    color: s.color,
    values: months.map((m) => (s.kind === 'category' ? m.byCategory[s.id] : m.byType[s.id]) ?? 0),
  }));
}
