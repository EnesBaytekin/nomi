// İstatistikler — özet kartları, takvim ısı haritası, grafikler, karşılaştırma.

import { el, toast } from '../dom.js';
import { iconNode } from '../icons.js';
import { api } from '../api.js';
import {
  addMonths,
  currentYm,
  fmtAmount,
  fmtDeltaPct,
  fmtMonth,
  fmtTRY,
  monthRange,
  tzOffset,
} from '../format.js';
import {
  byCategory,
  byDay,
  byHour,
  byType,
  calendarGrid,
  topExpenses,
  trendForSeries,
} from '../stats.js';
import { dailyBarChart, donutChart, hourChart, trendChart } from '../charts.js';

export function renderStatsPage(container) {
  let ym = currentYm();
  let rows = [];
  let months = [];
  let catalog = null;
  let selected = [];
  let root = null;
  let charts = []; // [container, renderFn] — DOM'a girdikten sonra çizilir

  async function loadMonth() {
    const { from, to } = monthRange(ym);
    const r = await api(`/expenses?from=${from}&to=${to}&limit=500`);
    rows = r.rows;
    draw();
  }

  api(`/stats/monthly?months=6&tz=${tzOffset()}`)
    .then((r) => {
      months = r.months;
      draw();
    })
    .catch((err) => toast(err.message, 'err'));

  api('/catalog')
    .then((c) => {
      catalog = c;
      draw();
    })
    .catch(() => {});

  function compute() {
    const days = byDay(rows);
    const cats = byCategory(rows);
    const typeList = byType(
      rows,
      catalog
        ? catalog.categories.flatMap((c) => c.types.map((t) => ({ ...t, categoryColor: c.color })))
        : [],
    );
    const hours = byHour(rows);
    const top = topExpenses(rows, 5);
    const grid = calendarGrid(ym, rows);

    const total = rows.reduce((s, r) => s + r.amount, 0);
    const dayCount = Math.max(days.length, 1);
    const thisAgg = months.find((m) => m.ym === ym);
    const prevAgg = months.find((m) => m.ym === addMonths(ym, -1));
    const delta = thisAgg && prevAgg ? fmtDeltaPct(thisAgg.total, prevAgg.total) : null;
    const deltaUp = thisAgg && prevAgg ? thisAgg.total - prevAgg.total > 0 : false;
    const topCat = cats[0];

    const seriesChips = [];
    if (catalog) {
      for (const c of catalog.categories) {
        seriesChips.push({ id: c.id, name: c.name, icon: c.icon, color: c.color, kind: 'category' });
        for (const t of c.types.filter((t) => !t.archived)) {
          seriesChips.push({ id: t.id, name: t.name, icon: t.icon, color: c.color, kind: 'type' });
        }
      }
    }
    const selectedSeries = trendForSeries(months, seriesChips.filter((s) => selected.includes(s.id)));

    return {
      days, cats, typeList, hours, top, grid, total, dayCount,
      thisAgg, prevAgg, delta, deltaUp, topCat, seriesChips, selectedSeries,
    };
  }

  function setMonth(next) {
    ym = next;
    loadMonth().catch((err) => toast(err.message, 'err'));
    draw();
  }

  function draw() {
    if (!root) {
      root = el('div', { class: 'page stats-page' });
      container.textContent = '';
      container.appendChild(root);
    }
    root.textContent = '';
    charts = [];

    const d = compute();

    root.appendChild(el('h1', { class: 'page-title' }, 'İstatistikler'));
    root.appendChild(monthNav());

    // Özet kartları
    const cards = el('div', { class: 'stat-cards' });
    cards.appendChild(statCard('Toplam harcama', fmtTRY(d.total)));
    cards.appendChild(statCard('Harcama yapılan gün başına', fmtTRY(Math.round(d.total / d.dayCount))));
    cards.appendChild(
      statCard('En çok harcanan kategori', d.topCat ? d.topCat.name : '—', d.topCat ? fmtTRY(d.topCat.total) : ''),
    );
    const deltaCard = el('div', { class: 'card' });
    deltaCard.appendChild(el('p', { class: 'lbl' }, 'Geçen aya göre'));
    if (d.delta) {
      deltaCard.appendChild(
        el('p', { class: `val tnum ${d.deltaUp ? 'danger' : 'mint'}` }, d.delta),
      );
      deltaCard.appendChild(
        el('p', { class: 'muted sub-line' }, `${fmtMonth(addMonths(ym, -1))}: ${fmtTRY(d.prevAgg.total)}`),
      );
    } else {
      deltaCard.appendChild(el('p', { class: 'val muted' }, '—'));
    }
    cards.appendChild(deltaCard);
    root.appendChild(cards);

    // Günlük dağılım
    const dailyBox = el('div', { class: 'card chart-box' });
    root.appendChild(section('Günlük harcama', dailyBox));
    charts.push([dailyBox, () => dailyBarChart(dailyBox, d.days)]);

    // Takvim ısı haritası
    const heatCard = el('div', { class: 'card' });
    heatCard.appendChild(
      el(
        'div',
        { class: 'heat-head' },
        ...['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map((x) => el('span', {}, x)),
      ),
    );
    const maxDay = Math.max(1, ...d.grid.flat().map((c) => (c ? c.total : 0)));
    const heatBody = el('div', { class: 'heat-body' });
    for (const week of d.grid) {
      const row = el('div', { class: 'heat-week' });
      for (const cell of week) {
        if (!cell) {
          row.appendChild(el('span'));
          continue;
        }
        const intensity = cell.total / maxDay;
        const isToday = ym === currentYm() && cell.day === new Date().getDate();
        const cellEl = el(
          'div',
          {
            class: `heat-cell${cell.total > 0 ? ' has' : ''}${isToday ? ' today' : ''}`,
            title: `${cell.day}: ${fmtTRY(cell.total)}`,
          },
          el('span', {}, String(cell.day)),
          cell.total > 0 ? el('span', { class: 'mini' }, String(Math.round(cell.total / 100))) : null,
        );
        cellEl.style.background =
          cell.total > 0 ? `rgba(52, 211, 153, ${0.12 + intensity * 0.55})` : 'rgba(255,255,255,0.03)';
        row.appendChild(cellEl);
      }
      heatBody.appendChild(row);
    }
    heatCard.appendChild(heatBody);
    root.appendChild(section('Ay takvimi', heatCard));

    // Kategori dağılımı
    const donutCard = el('div', { class: 'card' });
    if (d.cats.reduce((s, c) => s + c.total, 0) === 0) {
      donutCard.appendChild(el('p', { class: 'empty' }, 'Bu ay kayıt yok.'));
    } else {
      const donutWrap = el('div', { class: 'donut-wrap' });
      const donutSlot = el('div', { class: 'donut-slot' });
      donutWrap.appendChild(donutSlot);
      charts.push([donutSlot, () => donutChart(donutSlot, d.cats)]);
      const legend = el('ul', { class: 'legend' });
      const grand = d.cats.reduce((s, c) => s + c.total, 0);
      for (const c of d.cats) {
        legend.appendChild(
          el(
            'li',
            {},
            el('span', { class: 'dot', style: { background: c.color } }),
            el('span', { class: 'nm' }, c.name),
            el('span', { class: 'pct tnum' }, `%${Math.round((c.total / grand) * 100)}`),
            el('span', { class: 'amt tnum' }, fmtTRY(c.total)),
          ),
        );
      }
      donutWrap.appendChild(legend);
      donutCard.appendChild(donutWrap);
    }
    root.appendChild(section('Kategori dağılımı', donutCard));

    // Tür dağılımı
    const typeCard = el('div', { class: 'card' });
    if (d.typeList.length === 0) {
      typeCard.appendChild(el('p', { class: 'empty pad' }, 'Bu ay kayıt yok.'));
    } else {
      const ul = el('ul', { class: 'type-bars' });
      for (const t of d.typeList) {
        const pct = d.total > 0 ? (t.total / d.total) * 100 : 0;
        ul.appendChild(
          el(
            'li',
            {},
            el(
              'div',
              { class: 'row' },
              el('span', {}, `${t.icon} ${t.name}`),
              el(
                'span',
                { class: 'tnum' },
                el('b', {}, fmtTRY(t.total)),
                el('span', { class: 'muted' }, ` · %${Math.round(pct)}`),
              ),
            ),
            el(
              'div',
              { class: 'track' },
              el('div', { class: 'fill', style: { width: `${pct}%`, background: t.color } }),
            ),
          ),
        );
      }
      typeCard.appendChild(ul);
    }
    root.appendChild(section('Tür dağılımı', typeCard));

    // Trend + seri seçim çipleri
    const trendCard = el('div', { class: 'card' });
    const trendBox = el('div', { class: 'chart-box' });
    trendCard.appendChild(trendBox);
    charts.push([
      trendBox,
      () => trendChart(trendBox, months.map((m) => m.ym), months.map((m) => m.total), d.selectedSeries),
    ]);
    const chips = el('div', { class: 'chips' });
    for (const s of d.seriesChips) {
      const active = selected.includes(s.id);
      chips.appendChild(
        el(
          'button',
          {
            class: `chip${active ? ' active' : ''}`,
            onclick: () => {
              selected = active ? selected.filter((id) => id !== s.id) : [...selected, s.id];
              draw();
            },
          },
          `${s.icon} ${s.name}`,
        ),
      );
    }
    trendCard.appendChild(chips);
    root.appendChild(section('Aylık trend', trendCard, el('span', { class: 'right' }, 'son 6 ay')));

    // Kategori karşılaştırma tablosu
    const cmpCard = el('div', { class: 'card tight' });
    if (d.thisAgg && d.prevAgg) {
      const table = el('table', { class: 'cmp-table' });
      table.appendChild(
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', {}, 'Kategori'),
            el('th', { class: 'num' }, 'Bu ay'),
            el('th', { class: 'num' }, 'Geçen ay'),
            el('th', { class: 'num' }, 'Değişim'),
          ),
        ),
      );
      const tbody = el('tbody', {});
      if (catalog) {
        for (const c of catalog.categories) {
          const cur = d.thisAgg.byCategory[c.id] ?? 0;
          const prev = d.prevAgg.byCategory[c.id] ?? 0;
          if (cur === 0 && prev === 0) continue;
          const up = cur > prev;
          tbody.appendChild(
            el(
              'tr',
              {},
              el('td', {}, el('span', { class: 'td-icon' }, c.icon), c.name),
              el('td', { class: 'num tnum strong' }, fmtAmount(cur)),
              el('td', { class: 'num tnum muted' }, fmtAmount(prev)),
              el('td', { class: `num tnum ${up ? 'danger' : 'mint'}` }, fmtDeltaPct(cur, prev)),
            ),
          );
        }
      }
      tbody.appendChild(
        el(
          'tr',
          { class: 'total' },
          el('td', {}, 'Toplam'),
          el('td', { class: 'num tnum' }, fmtAmount(d.thisAgg.total)),
          el('td', { class: 'num tnum muted' }, fmtAmount(d.prevAgg.total)),
          el('td', { class: `num tnum ${d.deltaUp ? 'danger' : 'mint'}` }, d.delta ?? ''),
        ),
      );
      table.appendChild(tbody);
      cmpCard.appendChild(table);
    } else {
      cmpCard.appendChild(el('p', { class: 'empty pad' }, 'Karşılaştırma için veri bekleniyor…'));
    }
    root.appendChild(section('Kategori karşılaştırma', cmpCard));

    // Saat dağılımı (metin grafiğin altında)
    const hourBox = el('div', { class: 'card chart-box' });
    root.appendChild(section('Günün saatleri', hourBox));
    charts.push([hourBox, () => hourChart(hourBox, d.hours)]);
    hourBox.appendChild(el('p', { class: 'chart-tip' }, 'Hangi saatlerde daha çok harcıyorsun?'));

    // En büyük harcamalar
    const topCard = el('div', { class: 'card slim' });
    if (d.top.length === 0) {
      topCard.appendChild(el('p', { class: 'empty pad' }, 'Bu ay kayıt yok.'));
    } else {
      d.top.forEach((e, i) => {
        const dt = new Date(e.spentAt);
        topCard.appendChild(
          el(
            'div',
            { class: 'top-row' },
            el('span', { class: 'idx' }, String(i + 1)),
            el('span', { class: 'ico' }, e.typeIcon),
            el(
              'div',
              { class: 'mid' },
              el('div', { class: 'nm' }, e.typeName),
              el(
                'div',
                { class: 'nt' },
                `${e.note ? `${e.note} · ` : ''}${dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
              ),
            ),
            el('span', { class: 'amt tnum' }, fmtTRY(e.amount)),
          ),
        );
      });
    }
    root.appendChild(section('Ayın en büyük 5 harcaması', topCard));

    // Grafikleri çiz (kutular DOM'a girdikten sonra genişlik ölçülebilir)
    requestAnimationFrame(() => {
      for (const [, fn] of charts) fn();
    });
  }

  function monthNav() {
    const prev = el(
      'button',
      { 'aria-label': 'Önceki ay', onclick: () => setMonth(addMonths(ym, -1)) },
      iconNode('chevronLeft', 20),
    );
    const next = el(
      'button',
      {
        'aria-label': 'Sonraki ay',
        disabled: ym >= currentYm(),
        onclick: () => ym < currentYm() && setMonth(addMonths(ym, 1)),
      },
      iconNode('chevronRight', 20),
    );
    return el('div', { class: 'month-nav' }, prev, el('span', { class: 'lbl' }, fmtMonth(ym)), next);
  }

  function statCard(label, value, sub) {
    const c = el('div', { class: 'card' });
    c.appendChild(el('p', { class: 'lbl' }, label));
    c.appendChild(el('p', { class: 'val tnum' }, value));
    if (sub) c.appendChild(el('p', { class: 'muted sub-line' }, sub));
    return c;
  }

  function section(title, cardEl, right) {
    return el(
      'section',
      {},
      el('div', { class: 'section-title' }, el('h2', {}, title), right ?? el('span')),
      cardEl,
    );
  }

  loadMonth().catch((err) => toast(err instanceof Error ? err.message : 'Yüklenemedi', 'err'));
}
