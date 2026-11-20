// Uygulama kabuğu — masaüstünde sol menü, mobilde alt gezinme.

import { el } from './dom.js';
import { iconNode } from './icons.js';

const NAV = [
  { path: '/', label: 'Ana Sayfa', icon: 'home' },
  { path: '/stats', label: 'İstatistik', icon: 'chart' },
  { path: '/history', label: 'Geçmiş', icon: 'history' },
  { path: '/settings', label: 'Ayarlar', icon: 'settings' },
];

/**
 * Kabuğu kurar: sidebar + bottom nav + <main> içeriği kapsayıcısı.
 * Döndürür: { sidebar, bottomNav, main, links }
 */
export function buildShell(onNavigate) {
  const brand = el(
    'div',
    { class: 'sidebar-brand' },
    el('img', { src: '/favicon.svg', alt: 'Nomi' }),
    el('div', {}, el('div', { class: 't' }, 'Nomi'), el('div', { class: 's' }, 'gider takibi')),
  );

  const sidebarNav = el('nav', {});
  const bottomNav = el('div', { class: 'bottomnav' });

  const links = NAV.map((item) => {
    // Sol menü bağlantısı
    const side = el(
      'a',
      {
        href: item.path,
        'data-link': '',
        onclick: (e) => {
          e.preventDefault();
          onNavigate(item.path);
        },
      },
      iconNode(item.icon, 18),
      item.label,
    );
    sidebarNav.appendChild(side);

    // Alt gezinme bağlantısı
    const bottom = el(
      'a',
      {
        href: item.path,
        'data-link': '',
        onclick: (e) => {
          e.preventDefault();
          onNavigate(item.path);
        },
      },
      iconNode(item.icon, 20),
      item.label,
    );
    bottomNav.appendChild(bottom);

    return { item, side, bottom };
  });

  const sidebar = el(
    'aside',
    { class: 'sidebar' },
    brand,
    sidebarNav,
    el('div', { class: 'ver' }, 'Nomi v1.1.0'),
  );

  const main = el('main', { class: 'main' });

  return { sidebar, bottomNav, main, links };
}

/** Aktif rotaya göre menü vurgularını günceller. */
export function markActive(shell, path) {
  for (const { item, side, bottom } of shell.links) {
    side.classList.toggle('active', item.path === path);
    bottom.classList.toggle('active', item.path === path);
  }
}
