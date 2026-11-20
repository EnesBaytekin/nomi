// Giriş noktası: auth başlatma, history tabanlı router, görünüm değişimi, SW kaydı.

import { onAuthChange, initAuth, auth } from './auth.js';
import { renderLoginPage } from './views/login.js';
import { renderHomePage } from './views/home.js';
import { renderStatsPage } from './views/stats.js';
import { renderHistoryPage } from './views/history.js';
import { renderSettingsPage } from './views/settings.js';
import { buildShell, markActive } from './layout.js';

const app = document.getElementById('app');

const ROUTES = {
  '/': renderHomePage,
  '/stats': renderStatsPage,
  '/history': renderHistoryPage,
  '/settings': renderSettingsPage,
};

const shell = buildShell((path) => navigate(path));
let shellBuilt = false;
let cleanup = null;
let currentPath = null;

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  render();
}

window.addEventListener('popstate', render);

function render() {
  const rawPath = location.pathname;
  const view = ROUTES[rawPath] ?? renderHomePage;
  const activePath = ROUTES[rawPath] ? rawPath : '/';

  if (auth.status !== 'auth') {
    // Görünümü kapat, kabuğu sök, giriş ekranını çiz
    if (cleanup) {
      cleanup();
      cleanup = null;
      currentPath = null;
    }
    if (shellBuilt) {
      app.textContent = '';
      shellBuilt = false;
    }
    renderLoginPage(app);
    return;
  }

  if (!shellBuilt) {
    app.textContent = '';
    app.appendChild(shell.sidebar);
    app.appendChild(shell.main);
    app.appendChild(shell.bottomNav);
    shellBuilt = true;
  }

  markActive(shell, activePath);

  if (currentPath === activePath && cleanup) return; // aynı görünüm

  if (cleanup) cleanup();
  currentPath = activePath;
  shell.main.textContent = '';
  cleanup = view(shell.main) || null;
}

// --- service worker -------------------------------------------------------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW olmadan da çalışır */
    });
  });
}

// --- başlat ---------------------------------------------------------------

onAuthChange(() => render());
void initAuth();
