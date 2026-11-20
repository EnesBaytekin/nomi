// Ayarlar — kategori/tür yönetimi, hesap, kullanıcılar, veri dışa aktarma.

import { el, openSheet, toast, confirmClick } from '../dom.js';
import { iconNode } from '../icons.js';
import { api, downloadFile } from '../api.js';
import { auth, logout } from '../auth.js';

const EMOJIS = [
  '🍽️', '🍲', '🍫', '☕', '🛒', '🚕', '🚌', '⛽', '🏠', '💡',
  '🤖', '🖥️', '📱', '🎮', '🎁', '🧴', '💊', '🎬', '✈️', '🛏️',
  '🪙', '📊', '📈', '💰', '🐾', '📚', '🏷️', '💸',
];

const COLORS = [
  '#34d399', '#38bdf8', '#a78bfa', '#fbbf24', '#fb7185',
  '#2dd4bf', '#f97316', '#f472b6', '#818cf8', '#a3e635',
];

export function renderSettingsPage(container) {
  let catalog = null;
  let expanded = null;
  let root = null;

  async function load() {
    catalog = await api('/catalog');
    draw();
  }

  const swap = async (kind, a, b) => {
    await api('/catalog/swap', { method: 'POST', body: { kind, a, b } });
    await load();
  };

  const moveType = async (catId, typeId, dir) => {
    if (!catalog) return;
    const cat = catalog.categories.find((c) => c.id === catId);
    if (!cat) return;
    const idx = cat.types.findIndex((t) => t.id === typeId);
    const neighbor = cat.types[idx + dir];
    if (!neighbor) return;
    await swap('type', typeId, neighbor.id);
  };

  function draw() {
    if (!root) {
      root = el('div', { class: 'page settings-page' });
      container.textContent = '';
      container.appendChild(root);
    }
    root.textContent = '';
    const user = auth.user;

    root.appendChild(el('h1', { class: 'page-title' }, 'Ayarlar'));

    // --- Kategoriler ve türler --------------------------------------------
    const addCatBtn = el(
      'button',
      { class: 'btn ghost small' },
      iconNode('plus', 14),
      'Kategori',
    );
    addCatBtn.addEventListener('click', () => openCategoryDialog({}, () => load()));

    const catList = el('div', { class: 'cat-list' });
    (catalog?.categories ?? []).forEach((c, ci) => {
      const cats = catalog.categories;
      const head = el('div', { class: 'cat-head' });
      head.appendChild(el('span', { class: 'ico' }, c.icon));
      head.appendChild(el('span', { class: 'dot', style: { background: c.color } }));
      const nmBtn = el(
        'button',
        {
          class: 'nm-btn',
          onclick: () => {
            expanded = expanded === c.id ? null : c.id;
            draw();
          },
        },
        c.name,
        el('span', { class: 'cnt' }, `${c.types.length} tür`),
      );
      head.appendChild(nmBtn);

      const actions = el('div', { class: 'actions' });
      const upBtn = el(
        'button',
        { class: 'icon-btn', 'aria-label': 'Yukarı taşı', disabled: ci === 0 },
        iconNode('chevronUp', 16),
      );
      upBtn.addEventListener('click', () =>
        swap('category', c.id, cats[ci - 1].id).catch((e) => toast(e.message, 'err')),
      );
      const downBtn = el(
        'button',
        { class: 'icon-btn', 'aria-label': 'Aşağı taşı', disabled: ci === cats.length - 1 },
        iconNode('chevronDown', 16),
      );
      downBtn.addEventListener('click', () =>
        swap('category', c.id, cats[ci + 1].id).catch((e) => toast(e.message, 'err')),
      );
      const editBtn = el('button', { class: 'text-btn' }, 'düzenle');
      editBtn.addEventListener('click', () =>
        openCategoryDialog({ id: c.id, name: c.name, icon: c.icon, color: c.color }, () => load()),
      );
      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(editBtn);
      head.appendChild(actions);

      const cardEl = el('div', { class: 'cat-card' }, head);

      if (expanded === c.id) {
        const typesBox = el('div', { class: 'cat-types' });
        const ul = el('ul', {});
        c.types.forEach((t, ti) => {
          const li = el('li', {});
          li.appendChild(el('span', {}, t.icon));
          li.appendChild(
            el(
              'span',
              { class: `nm${t.archived ? ' archived' : ''}` },
              t.name,
              t.archived ? el('span', { class: 'arch-tag' }, 'arşivli') : null,
            ),
          );
          const up = el(
            'button',
            { class: 'icon-btn', 'aria-label': 'Yukarı', disabled: ti === 0 },
            iconNode('chevronUp', 14),
          );
          up.addEventListener('click', () => moveType(c.id, t.id, -1).catch((e) => toast(e.message, 'err')));
          const down = el(
            'button',
            { class: 'icon-btn', 'aria-label': 'Aşağı', disabled: ti === c.types.length - 1 },
            iconNode('chevronDown', 14),
          );
          down.addEventListener('click', () => moveType(c.id, t.id, 1).catch((e) => toast(e.message, 'err')));
          const edit = el('button', { class: 'text-btn' }, 'düzenle');
          edit.addEventListener('click', () =>
            openTypeDialog(
              { id: t.id, name: t.name, icon: t.icon, categoryId: c.id, archived: t.archived },
              catalog,
              () => load(),
            ),
          );
          li.appendChild(up);
          li.appendChild(down);
          li.appendChild(edit);
          ul.appendChild(li);
        });
        typesBox.appendChild(ul);
        const addTypeBtn = el(
          'button',
          { class: 'btn ghost wide' },
          iconNode('plus', 14),
          'Bu kategoriye tür ekle',
        );
        addTypeBtn.addEventListener('click', () =>
          openTypeDialog({ categoryId: c.id }, catalog, () => load()),
        );
        typesBox.appendChild(addTypeBtn);
        cardEl.appendChild(typesBox);
      }

      catList.appendChild(cardEl);
    });

    root.appendChild(
      el(
        'section',
        {},
        el('div', { class: 'section-title' }, el('h2', {}, 'Kategoriler ve türler'), addCatBtn),
        catList,
      ),
    );

    // --- Hesap --------------------------------------------------------------
    const who = el(
      'div',
      { class: 'who' },
      'Oturum: ',
      el('b', {}, user?.username ?? ''),
      user?.isAdmin ? el('span', { class: 'admin-badge' }, 'yönetici') : null,
    );
    const logoutBtn = el('button', { class: 'btn soft' }, iconNode('logout', 16), 'Çıkış Yap');
    logoutBtn.addEventListener('click', () => void logout());
    root.appendChild(
      el(
        'section',
        {},
        el('div', { class: 'section-title' }, el('h2', {}, 'Hesap')),
        el('div', { class: 'card account-card' }, who, passwordForm(), logoutBtn),
      ),
    );

    // --- Kullanıcılar (yönetici) ---------------------------------------------
    if (user?.isAdmin) {
      root.appendChild(
        el(
          'section',
          {},
          el('div', { class: 'section-title' }, el('h2', {}, 'Kullanıcılar')),
          usersPanel(),
        ),
      );
    }

    // --- Veri -----------------------------------------------------------------
    const csvBtn = el('button', { class: 'btn soft' }, iconNode('download', 16), 'CSV (Excel)');
    csvBtn.addEventListener('click', async () => {
      await downloadFile('/export?format=csv', 'nomi-giderler.csv');
      toast('CSV indirildi');
    });
    const jsonBtn = el('button', { class: 'btn soft' }, iconNode('download', 16), 'JSON (yedek)');
    jsonBtn.addEventListener('click', async () => {
      await downloadFile(
        '/export?format=json',
        `nomi-yedek-${new Date().toISOString().slice(0, 10)}.json`,
      );
      toast('JSON indirildi');
    });
    root.appendChild(
      el(
        'section',
        {},
        el('div', { class: 'section-title' }, el('h2', {}, 'Veri')),
        el(
          'div',
          { class: 'card data-card' },
          el(
            'p',
            { class: 'muted hint' },
            "Tüm verilerini indir: yedekleme veya Excel'de açmak için.",
          ),
          el('div', { class: 'export-row' }, csvBtn, jsonBtn),
        ),
      ),
    );

    root.appendChild(
      el(
        'p',
        { class: 'foot-note' },
        'Nomi v1.0.0 · veriler sunucuda AES-256-GCM ile şifreli saklanır',
      ),
    );
  }

  load().catch((err) => toast(err instanceof Error ? err.message : 'Yüklenemedi', 'err'));
}

// --- parola formu -----------------------------------------------------------

function passwordForm() {
  const wrap = el('div', { class: 'pw-form' });
  let current = '';
  let next = '';
  let busy = false;

  const currentInput = el('input', {
    class: 'input',
    type: 'password',
    placeholder: 'Mevcut parola',
    autoComplete: 'current-password',
  });
  const nextInput = el('input', {
    class: 'input',
    type: 'password',
    placeholder: 'Yeni parola (en az 8 karakter)',
    autoComplete: 'new-password',
  });
  const submitBtn = el('button', { class: 'btn soft' }, 'Parolayı Güncelle');

  const refresh = () => {
    submitBtn.disabled = busy || !current || next.length < 8;
  };
  currentInput.addEventListener('input', () => {
    current = currentInput.value;
    refresh();
  });
  nextInput.addEventListener('input', () => {
    next = nextInput.value;
    refresh();
  });
  submitBtn.disabled = true;

  submitBtn.addEventListener('click', async () => {
    busy = true;
    submitBtn.disabled = true;
    try {
      await api('/auth/password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      toast('Parola değiştirildi');
      currentInput.value = '';
      nextInput.value = '';
      current = '';
      next = '';
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Değiştirilemedi', 'err');
    } finally {
      busy = false;
      refresh();
    }
  });

  wrap.appendChild(el('p', { class: 'lbl' }, 'Parola değiştir'));
  wrap.appendChild(currentInput);
  wrap.appendChild(nextInput);
  wrap.appendChild(submitBtn);
  return wrap;
}

// --- kullanıcılar paneli -----------------------------------------------------

function usersPanel() {
  const card = el('div', { class: 'card users-card' });
  const list = el('ul', { class: 'user-list' });
  let username = '';
  let password = '';

  const nameInput = el('input', { class: 'input', placeholder: 'Yeni kullanıcı adı' });
  const passInput = el('input', {
    class: 'input',
    type: 'password',
    placeholder: 'Parola (en az 8 karakter)',
    autoComplete: 'new-password',
  });
  const addBtn = el('button', { class: 'btn soft' }, iconNode('plus', 16), 'Kullanıcı Ekle');

  const refreshBtn = () => {
    addBtn.disabled = username.trim().length < 3 || password.length < 8;
  };
  nameInput.addEventListener('input', () => {
    username = nameInput.value;
    refreshBtn();
  });
  passInput.addEventListener('input', () => {
    password = passInput.value;
    refreshBtn();
  });
  addBtn.disabled = true;

  addBtn.addEventListener('click', async () => {
    try {
      await api('/users', { body: { username: username.trim(), password } });
      toast('Kullanıcı eklendi');
      nameInput.value = '';
      passInput.value = '';
      username = '';
      password = '';
      addBtn.disabled = true;
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Eklenemedi', 'err');
    }
  });

  async function load() {
    const res = await api('/users');
    list.textContent = '';
    for (const u of res.users) {
      const li = el(
        'li',
        {},
        el(
          'span',
          { class: 'nm' },
          u.username,
          u.isAdmin ? el('span', { class: 'admin' }, 'yönetici') : null,
        ),
      );
      if (u.id !== auth.user?.id) {
        const del = el('button', { class: 'text-btn' }, 'sil');
        confirmClick(del, async () => {
          try {
            await api(`/users/${u.id}`, { method: 'DELETE' });
            toast('Kullanıcı silindi');
            await load();
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Silinemedi', 'err');
          }
        }, 'Emin misin?');
        li.appendChild(del);
      }
      list.appendChild(li);
    }
  }

  load().catch((err) => toast(err instanceof Error ? err.message : 'Yüklenemedi', 'err'));

  card.appendChild(list);
  card.appendChild(el('div', { class: 'user-add' }, nameInput, passInput, addBtn));
  return card;
}

// --- emoji + renk seçiciler ---------------------------------------------------

function emojiPicker(value, onChange) {
  const grid = el('div', { class: 'emoji-grid' });
  for (const e of EMOJIS) {
    const b = el('button', { type: 'button', class: value === e ? 'active' : '' }, e);
    b.addEventListener('click', () => onChange(e));
    grid.appendChild(b);
  }
  return el('div', {}, el('p', { class: 'picker-label' }, 'Simge'), grid);
}

function colorPicker(value, onChange) {
  const row = el('div', { class: 'color-row' });
  for (const c of COLORS) {
    const b = el('button', { class: `color-dot${value === c ? ' active' : ''}`, 'aria-label': `Renk ${c}` });
    b.style.background = c;
    b.addEventListener('click', () => onChange(c));
    row.appendChild(b);
  }
  return el('div', {}, el('p', { class: 'picker-label' }, 'Renk'), row);
}

// --- kategori diyaloğu --------------------------------------------------------

function openCategoryDialog(state, onDone) {
  const isEdit = state.id !== undefined;
  let name = isEdit ? (state.name ?? '') : '';
  let icon = isEdit ? (state.icon ?? '🏷️') : '🏷️';
  let color = isEdit ? (state.color ?? '#34d399') : COLORS[0];

  let body = null;
  let saveBtn = null;

  const bodySlot = el('div');
  const close = openSheet(isEdit ? 'Kategoriyi Düzenle' : 'Yeni Kategori', bodySlot);
  body = bodySlot;
  drawBody();

  function drawBody() {
    if (!body) return;
    body.textContent = '';
    const wrap = el('div', { class: 'edit-form' });

    const nameInput = el('input', { class: 'input', placeholder: 'Kategori adı', maxLength: 40 });
    nameInput.value = name;
    nameInput.addEventListener('input', () => {
      name = nameInput.value;
      if (saveBtn) saveBtn.disabled = !name.trim();
    });
    wrap.appendChild(nameInput);
    wrap.appendChild(
      emojiPicker(icon, (e) => {
        icon = e;
        drawBody();
      }),
    );
    wrap.appendChild(
      colorPicker(color, (c) => {
        color = c;
        drawBody();
      }),
    );

    const actions = el('div', { class: 'dialog-actions' });
    saveBtn = el(
      'button',
      { class: 'btn primary grow', disabled: !name.trim() },
      isEdit ? 'Kaydet' : 'Ekle',
    );
    saveBtn.addEventListener('click', () => submit());
    actions.appendChild(saveBtn);
    if (isEdit) {
      const delBtn = el('button', { class: 'btn danger' }, 'Sil');
      confirmClick(delBtn, () => remove(), 'Emin misin?');
      actions.appendChild(delBtn);
    }
    wrap.appendChild(actions);
    body.appendChild(wrap);
  }

  async function submit() {
    try {
      if (isEdit) {
        await api(`/categories/${state.id}`, { method: 'PATCH', body: { name, icon, color } });
        toast('Kategori güncellendi');
      } else {
        await api('/categories', { body: { name, icon, color } });
        toast('Kategori eklendi');
      }
      close();
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'İşlem başarısız', 'err');
    }
  }

  async function remove() {
    try {
      await api(`/categories/${state.id}`, { method: 'DELETE' });
      toast('Kategori silindi');
      close();
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Silinemedi', 'err');
    }
  }
}

// --- tür diyaloğu --------------------------------------------------------------

function openTypeDialog(state, catalog, onDone) {
  const isEdit = state.id !== undefined;
  let name = isEdit ? (state.name ?? '') : '';
  let icon = isEdit ? (state.icon ?? '💸') : '💸';
  let categoryId = state.categoryId;
  let archived = state.archived ?? false;

  let body = null;
  let saveBtn = null;

  const bodySlot = el('div');
  const close = openSheet(isEdit ? 'Türü Düzenle' : 'Yeni Tür', bodySlot);
  body = bodySlot;
  drawBody();

  function drawBody() {
    if (!body) return;
    body.textContent = '';
    const wrap = el('div', { class: 'edit-form' });

    const nameInput = el('input', { class: 'input', placeholder: 'Tür adı', maxLength: 40 });
    nameInput.value = name;
    nameInput.addEventListener('input', () => {
      name = nameInput.value;
      if (saveBtn) saveBtn.disabled = !name.trim();
    });
    wrap.appendChild(nameInput);
    wrap.appendChild(
      emojiPicker(icon, (e) => {
        icon = e;
        drawBody();
      }),
    );

    const catChips = el('div', { class: 'cat-chips' });
    for (const c of catalog.categories) {
      catChips.appendChild(
        el(
          'button',
          {
            class: `chip${categoryId === c.id ? ' active' : ''}`,
            onclick: () => {
              categoryId = c.id;
              drawBody();
            },
          },
          `${c.icon} ${c.name}`,
        ),
      );
    }
    wrap.appendChild(el('div', {}, el('p', { class: 'picker-label' }, 'Kategori'), catChips));

    if (isEdit) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = archived;
      cb.addEventListener('change', () => (archived = cb.checked));
      wrap.appendChild(
        el('label', { class: 'arch-check' }, cb, 'Arşivle (yeni kayıtlarda görünmez, geçmiş korunur)'),
      );
    }

    const actions = el('div', { class: 'dialog-actions' });
    saveBtn = el(
      'button',
      { class: 'btn primary grow', disabled: !name.trim() },
      isEdit ? 'Kaydet' : 'Ekle',
    );
    saveBtn.addEventListener('click', () => submit());
    actions.appendChild(saveBtn);
    if (isEdit) {
      const delBtn = el('button', { class: 'btn danger' }, 'Sil');
      confirmClick(delBtn, () => remove(), 'Emin misin?');
      actions.appendChild(delBtn);
    }
    wrap.appendChild(actions);
    body.appendChild(wrap);
  }

  async function submit() {
    try {
      if (isEdit) {
        await api(`/types/${state.id}`, {
          method: 'PATCH',
          body: { name, icon, categoryId, archived },
        });
        toast('Tür güncellendi');
      } else {
        await api('/types', { body: { name, icon, categoryId } });
        toast('Tür eklendi');
      }
      close();
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'İşlem başarısız', 'err');
    }
  }

  async function remove() {
    try {
      await api(`/types/${state.id}`, { method: 'DELETE' });
      toast('Tür silindi');
      close();
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Silinemedi';
      toast(/harcamalar var/i.test(msg) ? `${msg} — türü arşivleyebilirsin.` : msg, 'err');
    }
  }
}
