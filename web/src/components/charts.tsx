import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtTRY } from '../lib/format';
import type { DayBucket, NamedTotal, TrendSeries } from '../lib/stats';

const axisStyle = { fill: '#8a97b6', fontSize: 11 };

/** Gün bazlı harcama sütun grafiği */
export function DailyBarChart({ data }: { data: DayBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
        <CartesianGrid stroke="#1f2c49" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={(d: string) => String(Number(d.slice(-2)))}
          tick={axisStyle}
          interval="preserveStartEnd"
        />
        <YAxis tick={axisStyle} tickFormatter={(v: number) => `${Math.round(v / 100)}`} width={46} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          formatter={(value) => [fmtTRY(Number(value)), 'Harcama']}
          labelFormatter={(label) => `${Number(String(label).slice(-2))} gün`}
        />
        <Bar dataKey="total" fill="#34d399" radius={[5, 5, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Kategori dağılımı (donut) + gösterge */
export function CategoryDonut({ data }: { data: NamedTotal[] }) {
  const total = data.reduce((s, d) => s + d.total, 0);
  if (total === 0) return <p className="py-8 text-center text-sm text-dim">Bu ay kayıt yok.</p>;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.id} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => fmtTRY(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex w-full flex-col gap-2">
        {data.map((d) => (
          <li key={d.id} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="flex-1 truncate">{d.name}</span>
            <span className="tabular-nums text-dim">
              %{Math.round((d.total / total) * 100)}
            </span>
            <span className="w-24 text-right font-semibold tabular-nums">{fmtTRY(d.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Saat dağılımı */
export function HourChart({ hours }: { hours: number[] }) {
  const data = hours.map((total, h) => ({ hour: `${h}`, total }));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
        <CartesianGrid stroke="#1f2c49" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="hour" tick={axisStyle} interval={2} />
        <YAxis tick={axisStyle} tickFormatter={(v: number) => `${Math.round(v / 100)}`} width={46} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          formatter={(value) => [fmtTRY(Number(value)), 'Harcama']}
          labelFormatter={(h) => `${h}:00`}
        />
        <Bar dataKey="total" fill="#38bdf8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Aylık trend — toplam ve/veya seçili seriler */
export function TrendChart({
  labels,
  total,
  series,
}: {
  labels: string[];
  total: number[];
  series: TrendSeries[];
}) {
  const data = labels.map((ym, i) => {
    const row: Record<string, string | number> = { ym, total: total[i] ?? 0 };
    for (const s of series) row[s.id] = s.values[i] ?? 0;
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid stroke="#1f2c49" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="ym" tickFormatter={(ym: string) => ym.slice(5)} tick={axisStyle} />
        <YAxis tick={axisStyle} tickFormatter={(v: number) => `${Math.round(v / 100)}`} width={46} />
        <Tooltip formatter={(value) => fmtTRY(Number(value))} labelFormatter={(ym) => String(ym)} />
        {series.length === 0 ? (
          <Line type="monotone" dataKey="total" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3 }} />
        ) : (
          series.map((s) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 2.5 }}
            />
          ))
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
