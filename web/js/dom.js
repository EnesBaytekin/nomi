// Mini DOM yardımcıları — React'siz bildirimsel element üretimi.

import { iconNode } from './icons.js';

/**
 * el('div', { class: 'x', onclick: fn, ... }, ...children)
 * children: string → metin düğümü, Node → eklenir, null/false → atlanır, dizi → düzleştirilir.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2), v);
    } else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'indeterminate') {
      node[k] = v;
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(node.style, v);
    } else if (k === 'dataset') {
      Object.assign(node.dataset, v);
    } else {
      node.setAttribute(k, v === true ? '' : v);
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === true) continue;
    if (Array.isArray(c)) {
      append(node, c);
    } else if (c instanceof Node) {
      node.appendChild(c);
    } else {
      node.appendChild(document.createTextNode(String(c)));
    }
  }
}

/** Öğeyi boşaltıp yenisiyle değiştirir. */
export function replace(container, node) {
  container.textContent = '';
  if (node) container.appendChild(node);
}

// --- toast ---------------------------------------------------------------

let toastBox = null;
let toastSeq = 1;

/** toast('Kaydedildi') veya toast('Hata', 'err') */
export function toast(message, kind = 'ok') {
  if (!toastBox) {
    toastBox = el('div', { class: 'toasts' });
    document.body.appendChild(toastBox);
  }
  const id = toastSeq++;
  while (toastBox.children.length >= 3) toastBox.firstChild.remove();
  const item = el('div', { class: `toast ${kind}`, dataset: { id } }, message);
  toastBox.appendChild(item);
  setTimeout(() => item.remove(), 2400);
}

// --- alt sayfa (sheet / modal) --------------------------------------------

/**
 * openSheet('Başlık', gövdeElemanı) → close() döndürür.
 * Escape ve arka plan tıklaması kapatır.
 */
export function openSheet(title, bodyEl) {
  const closeBtn = el(
    'button',
    { class: 'sheet-close', 'aria-label': 'Kapat', onclick: () => close() },
    iconNode('x'),
  );
  const panel = el(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-label': title },
    el('div', { class: 'sheet-head' }, el('h3', {}, title), closeBtn),
    bodyEl,
  );
  const overlay = el(
    'div',
    { class: 'sheet-overlay' },
    el('div', { class: 'sheet-backdrop', onclick: () => close() }),
    panel,
  );
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }
  document.body.appendChild(overlay);
  return close;
}

// --- iki dokunuşlu silme onayı ---------------------------------------------

/**
 * confirmClick(btn, onConfirm, 'Emin misin? Tekrar dokun')
 * İlk dokunuşta metni onay sorusuna çevirir, 2.5 sn sonra geri döner.
 */
export function confirmClick(btn, onConfirm, confirmLabel = 'Emin misin? Tekrar dokun') {
  btn.addEventListener('click', () => {
    if (btn.dataset.armed === '1') {
      btn.dataset.armed = '0';
      btn.innerHTML = btn.dataset.orig || '';
      onConfirm();
      return;
    }
    btn.dataset.armed = '1';
    btn.dataset.orig = btn.innerHTML;
    btn.textContent = confirmLabel;
    setTimeout(() => {
      if (btn.dataset.armed === '1') {
        btn.dataset.armed = '0';
        btn.innerHTML = btn.dataset.orig || '';
      }
    }, 2500);
  });
}
