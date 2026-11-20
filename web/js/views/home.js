// Ana sayfa — hızlı harcama kaydı.

import { el, toast } from '../dom.js';
import { iconNode } from '../icons.js';
import { api } from '../api.js';
import {
  fmtTRY,
  fromLocalInput,
  parseKeypadAmount,
  toLocalInput,
} from '../format.js';

export function renderHomePage(container) {
  let home = null;
  let amount = '';
  let typeId = null;
  let note = '';
  let showDetail = false;
  let spentAtLocal = '';
  let saving = false;
  let root = null;

  const amountDisplay = el('div', { class: 'amount-display' });
  const quickRow = el('div', { class: 'quick-row' });
  const typeGrid = el('div', { class: 'type-grid' });
  const detailToggle = el('button', { class: 'detail-toggle', type: 'button' });
  const detailBody = el('div', { class: 'detail-body' });
  const detailBox = el('div', { class: 'detail-box' }, detailToggle);
  const saveBtn = el(
    'button',
    { class: 'save-btn', type: 'button' },
    iconNode('check', 22, 3),
    'Kaydet',
  );
  const todayBox = el('div', { class: 'today-box' });

  let noteInput = null;
  let whenInput = null;

  async function load() {
    const data = await api('/home');
    home = data;
    // En son kullanılan tür önceden seçili gelsin: en az dokunuş
    const last = data.recentTypeIds[0] ?? (data.types[0] && data.types[0].id);
    if (last) typeId = typeId ?? last;
    draw();
  }

  // --- tuş takımı davranışı ----------------------------------------------

  const pushDigit = (d) => {
    const [int, dec] = amount.split(',');
    if (amount.includes(',')) {
      if ((dec?.length ?? 0) >= 2) return;
      amount = amount + d;
    } else if ((int?.length ?? 0) >= 9) {
      return;
    } else {
      amount = amount === '0' ? d : amount + d;
    }
    draw();
  };

  const pushComma = () => {
    if (amount.includes(',')) return;
    amount = amount === '' ? '0,' : amount + ',';
    draw();
  };

  const backspace = () => {
    amount = amount.slice(0, -1);
    draw();
  };

  const clear = () => {
    amount = '';
    draw();
  };

  const pushTripleZero = () => {
    if (amount === '' || amount.includes(',') || amount.length > 6) return;
    amount = amount + '000';
    draw();
  };

  const quickAdd = (n) => {
    const next = parseKeypadAmount(amount) + n * 100;
    amount = fmtInput(next);
    draw();
  };

  const save = async () => {
    const kurus = parseKeypadAmount(amount);
    if (!typeId || kurus <= 0 || saving) return;
    saving = true;
    draw();
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
      toast(`Kaydedildi · ${fmtTRY(kurus)}`);
      amount = '';
      note = '';
      spentAtLocal = '';
      showDetail = false;
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Kaydedilemedi', 'err');
    } finally {
      saving = false;
      draw();
    }
  };

  const deleteToday = async (id) => {
    try {
      await api(`/expenses/${id}`, { method: 'DELETE' });
      toast('Silindi');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Silinemedi', 'err');
    }
  };

  // --- çizim --------------------------------------------------------------

  function draw() {
    if (!root) {
      root = el('div', { class: 'page home-page' });
      container.textContent = '';
      container.appendChild(root);
    }
    root.textContent = '';

    const kurus = parseKeypadAmount(amount);

    // Üst başlık + toplamlar
    const totals = el('div', { class: 'totals' });
    if (home) {
      totals.appendChild(el('span', {}, 'Bugün: ', el('b', { class: 'tnum' }, fmtTRY(home.todayTotal))));
      totals.appendChild(el('span', {}, 'Bu ay: ', el('b', { class: 'tnum' }, fmtTRY(home.monthTotal))));
    }
    root.appendChild(
      el(
        'div',
        { class: 'page-head' },
        el(
          'div',
          {},
          el('h1', {}, 'Hızlı Kayıt'),
          el('p', { class: 'sub' }, 'Ne kadar harcadın?'),
        ),
        totals,
      ),
    );

    // Tutar ekranı
    amountDisplay.className = `amount-display${kurus > 0 ? ' has' : ''}`;
    amountDisplay.textContent = '';
    amountDisplay.appendChild(document.createTextNode(formatDisplay(amount)));
    amountDisplay.appendChild(el('span', { class: 'cur' }, '₺'));

    quickRow.textContent = '';
    for (const n of [10, 50, 100, 500]) {
      quickRow.appendChild(
        el('button', { class: 'quick-chip', type: 'button', onclick: () => quickAdd(n) }, `+${n}`),
      );
    }
    root.appendChild(el('div', { class: 'amount-screen' }, amountDisplay, quickRow));

    // Tür seçimi
    typeGrid.textContent = '';
    for (const t of orderedTypesOf(home)) {
      const active = typeId === t.id;
      typeGrid.appendChild(
        el(
          'button',
          {
            class: `type-tile${active ? ' active' : ''}`,
            type: 'button',
            onclick: () => {
              typeId = t.id;
              draw();
            },
          },
          el('span', { class: 'ico' }, t.icon),
          el('span', { class: 'nm' }, t.name),
        ),
      );
    }
    root.appendChild(el('div', {}, el('p', { class: 'field-label' }, 'Ne için?'), typeGrid));

    // Detay (not + tarih)
    detailToggle.textContent = '';
    detailToggle.appendChild(iconNode('note', 16));
    detailToggle.appendChild(
      document.createTextNode(note ? `Not: ${note}` : 'Not ekle (isteğe bağlı)'),
    );
    detailToggle.appendChild(
      el(
        'span',
        { class: 'when' },
        iconNode('clock', 13),
        spentAtLocal ? spentAtLocal.replace('T', ' ') : 'şimdi',
      ),
    );
    detailToggle.onclick = () => {
      showDetail = !showDetail;
      if (showDetail && !spentAtLocal) spentAtLocal = toLocalInput(Date.now());
      draw();
    };

    if (showDetail) {
      detailBody.textContent = '';
      noteInput = el('input', {
        class: 'input',
        placeholder: 'Not (ör. market, kahve…)',
        maxLength: 280,
      });
      noteInput.value = note;
      noteInput.addEventListener('input', () => (note = noteInput.value));
      whenInput = el('input', { class: 'input', type: 'datetime-local' });
      whenInput.value = spentAtLocal;
      whenInput.addEventListener('input', () => (spentAtLocal = whenInput.value));
      detailBody.appendChild(noteInput);
      detailBody.appendChild(
        el(
          'div',
          { class: 'detail-row' },
          whenInput,
          el(
            'button',
            {
              class: 'now-btn',
              type: 'button',
              onclick: () => {
                spentAtLocal = toLocalInput(Date.now());
                whenInput.value = spentAtLocal;
              },
            },
            'Şimdi',
          ),
        ),
      );
      if (detailBody.parentNode !== detailBox) detailBox.appendChild(detailBody);
    } else {
      detailBody.remove();
    }
    root.appendChild(detailBox);

    // Tuş takımı
    root.appendChild(buildKeypad());

    // Kaydet
    saveBtn.disabled = kurus <= 0 || !typeId || saving;
    saveBtn.onclick = save;
    root.appendChild(saveBtn);

    // Bugünün kayıtları
    if (home && home.today.length > 0) {
      todayBox.textContent = '';
      todayBox.appendChild(el('p', { class: 'field-label' }, 'Bugün'));
      const ul = el('ul', {});
      for (const e of home.today) {
        ul.appendChild(
          el(
            'li',
            {},
            el('span', { class: 'ico' }, e.typeIcon),
            el('span', { class: 'nm' }, e.typeName),
            el('span', { class: 'amt tnum' }, fmtTRY(e.amount)),
            el(
              'button',
              { class: 'mini-del', 'aria-label': 'Sil', onclick: () => deleteToday(e.id) },
              'sil',
            ),
          ),
        );
      }
      todayBox.appendChild(ul);
      root.appendChild(todayBox);
    }
  }

  function buildKeypad() {
    const grid = el('div', { class: 'keypad' });
    const key = (content, onClick, aria, cls) => {
      const b = el(
        'button',
        { class: `key${cls ? ` ${cls}` : ''}`, type: 'button', 'aria-label': aria },
        content,
      );
      b.addEventListener('click', onClick);
      return b;
    };
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      grid.appendChild(key(d, () => pushDigit(d)));
    }
    grid.appendChild(key(iconNode('backspace', 22), () => backspace(), 'Sil'));
    grid.appendChild(key('0', () => pushDigit('0')));
    grid.appendChild(key(',', () => pushComma(), 'Virgül'));
    grid.appendChild(key('000', () => pushTripleZero()));
    grid.appendChild(key('Temizle', () => clear(), undefined, 'clear'));
    return grid;
  }

  // En son kullanılan türler öne gelecek şekilde sırala
  function orderedTypesOf(h) {
    if (!h) return [];
    const rank = new Map(h.recentTypeIds.map((id, i) => [id, i]));
    return [...h.types].sort(
      (a, b) => (rank.has(a.id) ? rank.get(a.id) : 99) - (rank.has(b.id) ? rank.get(b.id) : 99),
    );
  }

  /** Tuş takımı dizgisini okunur biçime getirir: "1234,5" → "1.234,5" */
  function formatDisplay(s) {
    if (!s) return '0';
    const [int, dec] = s.split(',');
    const grouped = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(
      Number(int || '0'),
    );
    return s.includes(',') ? `${grouped},${dec ?? ''}` : grouped;
  }

  /** Kuruşu tuş takımı dizgisine çevirir */
  function fmtInput(k) {
    const lira = Math.floor(k / 100);
    const rem = k % 100;
    if (rem === 0) return String(lira);
    return `${lira},${String(rem).padStart(2, '0')}`;
  }

  load().catch((err) => toast(err instanceof Error ? err.message : 'Yüklenemedi', 'err'));
}
