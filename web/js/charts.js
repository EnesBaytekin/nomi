// El yapımı SVG grafikler — recharts karşılıkları (görsel davranış korunmuştur).

import { fmtTRY } from './format.js';

const GRID = '#1f2c49';
const AXIS = '#8a97b6';
const FONT = 11;

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, text) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Verilen kaba, genişliğe duyarlı SVG grafik çizer; genişlik değişince yeniden çizer. */
function mountResponsive(container, render) {
  const draw = () => {
    const w = Math.floor(container.clientWidth || 320);
    container.textContent = '';
    container.appendChild(render(w));
  };
  // İlk çizim DOM'a eklendikten sonra (genişlik ölçülebilir olsun)
  requestAnimationFrame(() => {
    draw();
    const ro = new ResizeObserver(() => {
      const w = Math.floor(container.clientWidth || 320);
      if (container.firstChild && Number(container.firstChild.getAttribute('data-w')) === w) return;
      draw();
    });
    ro.observe(container);
  });
}

function niceMax(v) {
  if (v <= 0) return 100;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function roundedTopRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/** Sütun grafiği iskeleti: ızgara + y etiketleri. Plot alan bilgilerini döndürür. */
function barFrame(svg, W, H, values, yFmt) {
  const M = { top: 8, right: 8, bottom: 20, left: 40 };
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const max = niceMax(Math.max(...values, 0));

  // 5 bölütlü ızgara + y etiketleri (üstten alta: max → 0)
  for (let i = 0; i <= 4; i++) {
    const y = M.top + (ph * i) / 4;
    svg.appendChild(
      svgEl('line', {
        x1: M.left, x2: W - M.right, y1: y, y2: y,
        stroke: GRID, 'stroke-dasharray': '3 3', 'stroke-width': 1,
      }),
    );
    const val = max - (max * i) / 4;
    svg.appendChild(
      svgEl('text', {
        x: M.left - 6, y: y + 4, fill: AXIS, 'font-size': FONT,
        'text-anchor': 'end', 'dominant-baseline': 'middle',
      }, yFmt(val)),
    );
  }
  return { M, pw, ph, max };
}

const liraTick = (v) => `${Math.round(v / 100)}`;

function xLabel(svg, x, y, text) {
  svg.appendChild(svgEl('text', { x, y, fill: AXIS, 'font-size': FONT, 'text-anchor': 'middle' }, text));
}

/** Gün bazlı harcama sütun grafiği (DailyBarChart) */
export function dailyBarChart(container, data) {
  mountResponsive(container, (W) => {
    const H = 220;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'data-w': W });
    const values = data.map((d) => d.total);
    const { M, pw, ph, max } = barFrame(svg, W, H, values, liraTick);

    const n = data.length || 1;
    const slot = pw / n;
    const barW = Math.min(26, slot * 0.7);

    // x etiketleri: baştaki/sondaki korunur, ~8 etikete sığdır
    const step = Math.max(1, Math.ceil(n / 8));
    const shown = new Set();
    for (let i = 0; i < n; i += step) shown.add(i);
    shown.add(n - 1);

    data.forEach((d, i) => {
      const x = M.left + slot * i + (slot - barW) / 2;
      const h = max > 0 ? (d.total / max) * ph : 0;
      if (d.total > 0) {
        const bar = svgEl('path', {
          d: roundedTopRect(x, M.top + ph - h, barW, h, 5),
          fill: '#34d399',
          class: 'bar',
        });
        bar.appendChild(svgEl('title', {}, `${Number(d.day.slice(-2))} gün · ${fmtTRY(d.total)}`));
        svg.appendChild(bar);
      }
      if (shown.has(i)) xLabel(svg, M.left + slot * i + slot / 2, H - 5, String(Number(d.day.slice(-2))));
    });
    return svg;
  });
}

/** Saat dağılımı (HourChart) */
export function hourChart(container, hours) {
  mountResponsive(container, (W) => {
    const H = 160;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'data-w': W });
    const { M, pw, ph, max } = barFrame(svg, W, H, hours, liraTick);

    const slot = pw / 24;
    const barW = Math.min(26, slot * 0.72);
    for (let h = 0; h < 24; h++) {
      const x = M.left + slot * h + (slot - barW) / 2;
      const bh = max > 0 ? (hours[h] / max) * ph : 0;
      if (hours[h] > 0) {
        const bar = svgEl('path', {
          d: roundedTopRect(x, M.top + ph - bh, barW, bh, 4),
          fill: '#38bdf8',
          class: 'bar',
        });
        bar.appendChild(svgEl('title', {}, `${h}:00 · ${fmtTRY(hours[h])}`));
        svg.appendChild(bar);
      }
      if (h % 2 === 0) xLabel(svg, M.left + slot * h + slot / 2, H - 5, String(h));
    }
    return svg;
  });
}

/** Aylık trend — toplam ve/veya seçili seriler (TrendChart) */
export function trendChart(container, labels, total, series) {
  mountResponsive(container, (W) => {
    const H = 240;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'data-w': W });
    const lines =
      series.length > 0
        ? series.map((s) => ({ name: s.name, color: s.color, values: s.values }))
        : [{ color: '#34d399', values: total, wide: true }];
    const { M, pw, ph, max } = barFrame(svg, W, H, total, liraTick);

    const n = Math.max(labels.length, 1);
    const px = (i) => M.left + (pw * i) / Math.max(n - 1, 1);
    const py = (v) => M.top + ph - (max > 0 ? (v / max) * ph : 0);

    for (const ln of lines) {
      const pts = ln.values.map((v, i) => `${px(i)},${py(v)}`).join(' ');
      svg.appendChild(
        svgEl('polyline', {
          points: pts, fill: 'none', stroke: ln.color,
          'stroke-width': ln.wide ? 2.5 : 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        }),
      );
      ln.values.forEach((v, i) => {
        const c = svgEl('circle', { cx: px(i), cy: py(v), r: ln.wide ? 3 : 2.5, fill: ln.color });
        c.appendChild(svgEl('title', {}, `${labels[i]} · ${fmtTRY(v)}`));
        svg.appendChild(c);
      });
    }

    labels.forEach((ym, i) => xLabel(svg, px(i), H - 5, ym.slice(5)));
    return svg;
  });
}

/** Kategori dağılımı donut (CategoryDonut) — sabit 176px kutuya çizilir */
export function donutChart(container, data) {
  const total = data.reduce((s, d) => s + d.total, 0);
  const svg = svgEl('svg', { viewBox: '0 0 176 176', width: 176, height: 176 });
  container.textContent = '';
  container.appendChild(svg);
  if (total <= 0) return;

  const cx = 88;
  const cy = 88;
  const R = 68; // dış 80.96 (88*0.92), iç 54.56 (88*0.62) — recharts ile aynı
  const SW = 26.4;

  const multi = data.length > 1;
  let cumDeg = 0; // 12'den itibaren saat yönünde
  for (const d of data) {
    const deg = (d.total / total) * 360;
    const gap = multi ? 2 : 0;
    const seg = Math.max(deg - gap, 0.5);
    const start = cumDeg + gap / 2;
    const u = (seg / 360) * 100;
    const off = (((25 - (start / 360) * 100) % 100) + 100) % 100;
    const c = svgEl('circle', {
      cx, cy, r: R,
      fill: 'none', stroke: d.color,
      'stroke-width': SW,
      pathLength: 100,
      'stroke-dasharray': `${u} ${100 - u}`,
      'stroke-dashoffset': off,
    });
    c.appendChild(svgEl('title', {}, `${d.name} · ${fmtTRY(d.total)}`));
    svg.appendChild(c);
    cumDeg += deg;
  }
}
