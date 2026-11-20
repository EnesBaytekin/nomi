// Geçmiş — aylık liste, güne göre gruplu; satıra dokununca düzenleme.

import { el, openSheet, toast, confirmClick } from '../dom.js';
import { iconNode } from '../icons.js';
import { api } from '../api.js';
import {
  addMonths,
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
} from '../format.js';

export function renderHistoryPage(container) {
  let ym = currentYm();
  let rows = null;
  let root = null;

  async function load() {
    rows = null;
    draw();
    const { from, to } = monthRange(ym);
    const res = await api(`/expenses?from=${from}&to=${to}&limit=500`);
    rows = res.rows;
    draw();
  }

  function groupedOf() {
    if (!rows) return [];
    const map = new Map();
    for (const r of rows) {
      const d = new Date(r.spentAt);
      d.setHours(0, 0, 0, 0);
      const arr = map.get(d.getTime());
      if (arr) arr.push(r);
      else map.set(d.getTime(), [r]);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }

  function setMonth(next) {
    ym = next;
    load().catch((err) => toast(err.message, 'err'));
  }

  function draw() {
    if (!root) {
      root = el('div', { class: 'page history-page' });
      container.textContent = '';
      container.appendChild(root);
    }
    root.textContent = '';

    root.appendChild(el('h1', { class: 'page-title' }, 'Geçmiş'));
    root.appendChild(monthNav());

    const total = rows ? rows.reduce((s, r) => s + r.amount, 0) : 0;
    root.appendChild(
      el(
        'p',
        { class: 'muted history-total' },
        'Toplam: ',
        el('b', { class: 'tnum' }, fmtTRY(total)),
        ` · ${rows ? rows.length : '…'} kayıt`,
      ),
    );

    if (rows === null) {
      root.appendChild(el('p', { class: 'empty' }, 'Yükleniyor…'));
    }

    if (rows !== null && rows.length === 0) {
      root.appendChild(el('div', { class: 'card empty' }, 'Bu ay kayıt yok.'));
    }

    for (const [dayTs, items] of groupedOf()) {
      const head = el(
        'div',
        { class: 'day-head' },
        el('h2', {}, fmtDayLong(dayTs)),
        el('span', { class: 'sum tnum' }, fmtTRY(items.reduce((s, r) => s + r.amount, 0))),
      );
      const card = el('div', { class: 'card flush' });
      const list = el('div', { class: 'exp-list' });
      for (const e of items) {
        const row = el(
          'button',
          { class: 'exp-row', type: 'button' },
          el('span', { class: 'ico' }, e.typeIcon),
          el(
            'div',
            { class: 'mid' },
            el('div', { class: 'nm' }, e.typeName),
            e.note ? el('div', { class: 'nt' }, e.note) : null,
          ),
          el(
            'div',
            { class: 'end' },
            el('div', { class: 'amt tnum' }, fmtAmount(e.amount)),
            el('div', { class: 'tm' }, fmtTime(e.spentAt)),
          ),
        );
        row.addEventListener('click', () => openEditSheet(e));
        list.appendChild(row);
      }
      card.appendChild(list);
      root.appendChild(el('div', {}, head, card));
    }
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

  function openEditSheet(expense) {
    let catalog = null;
    let amountStr = (expense.amount / 100).toString().replace('.', ',');
    let typeId = expense.typeId;
    let note = expense.note ?? '';
    let spentAt = toLocalInput(expense.spentAt);
    let busy = false;

    api('/catalog').then((c) => {
      catalog = c;
      drawBody();
    });

    let body = null;
    let saveBtn = null;

    const bodySlot = el('div');
    const close = openSheet('Harcamayı Düzenle', bodySlot);
    body = bodySlot;
    drawBody();

    const kurus = () => parseKeypadAmount(amountStr);

    function drawBody() {
      if (!body) return;
      body.textContent = '';
      const wrap = el('div', { class: 'edit-form' });

      const amountInput = el('input', {
        class: 'input tnum amount-input',
        inputMode: 'decimal',
      });
      amountInput.value = amountStr;
      amountInput.addEventListener('input', () => {
        amountStr = amountInput.value.replace(/[^\d,]/g, '');
        if (amountInput.value !== amountStr) amountInput.value = amountStr;
        if (saveBtn) saveBtn.disabled = busy || kurus() <= 0;
      });
      wrap.appendChild(amountInput);

      const whenInput = el('input', { class: 'input', type: 'datetime-local' });
      whenInput.value = spentAt;
      whenInput.addEventListener('input', () => (spentAt = whenInput.value));
      wrap.appendChild(whenInput);

      const gridWrap = el('div', { class: 'type-picker' });
      const grid = el('div', { class: 'type-grid' });
      if (catalog) {
        for (const c of catalog.categories) {
          for (const t of c.types.filter((x) => !x.archived)) {
            grid.appendChild(
              el(
                'button',
                {
                  class: `type-tile${typeId === t.id ? ' active' : ''}`,
                  type: 'button',
                  onclick: () => {
                    typeId = t.id;
                    drawBody();
                  },
                },
                el('span', { class: 'ico' }, t.icon),
                el('span', { class: 'nm' }, t.name),
              ),
            );
          }
        }
      } else {
        grid.appendChild(el('p', { class: 'empty' }, '…'));
      }
      gridWrap.appendChild(grid);
      wrap.appendChild(gridWrap);

      const noteInput = el('input', { class: 'input', placeholder: 'Not', maxLength: 280 });
      noteInput.value = note;
      noteInput.addEventListener('input', () => (note = noteInput.value));
      wrap.appendChild(noteInput);

      const actions = el('div', { class: 'dialog-actions' });
      saveBtn = el(
        'button',
        { class: 'btn soft grow', disabled: busy || kurus() <= 0 },
        'Kaydet',
      );
      saveBtn.addEventListener('click', () => save());
      const delBtn = el('button', { class: 'btn danger' }, 'Sil');
      confirmClick(delBtn, () => remove(), 'Silmek istediğine emin misin?');
      actions.appendChild(saveBtn);
      actions.appendChild(delBtn);
      wrap.appendChild(actions);

      body.appendChild(wrap);
    }

    async function save() {
      if (kurus() <= 0 || !typeId) return;
      busy = true;
      try {
        await api(`/expenses/${expense.id}`, {
          method: 'PATCH',
          body: {
            amount: kurus(),
            typeId,
            note: note.trim() || null,
            spentAt: fromLocalInput(spentAt),
          },
        });
        toast('Güncellendi');
        close();
        await load();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Güncellenemedi', 'err');
      } finally {
        busy = false;
      }
    }

    async function remove() {
      busy = true;
      try {
        await api(`/expenses/${expense.id}`, { method: 'DELETE' });
        toast('Silindi');
        close();
        await load();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Silinemedi', 'err');
      } finally {
        busy = false;
      }
    }
  }

  load().catch((err) => toast(err instanceof Error ? err.message : 'Yüklenemedi', 'err'));
}
