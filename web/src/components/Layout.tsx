import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, BarChart3, History, Settings } from 'lucide-react';

const items = [
  { to: '/', label: 'Ana Sayfa', icon: Home },
  { to: '/stats', label: 'İstatistik', icon: BarChart3 },
  { to: '/history', label: 'Geçmiş', icon: History },
  { to: '/settings', label: 'Ayarlar', icon: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      {/* Masaüstü kenar çubuğu */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-surface/60 px-4 py-6 backdrop-blur md:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <img src="/favicon.svg" alt="Nomi" className="h-9 w-9 rounded-xl" />
          <div>
            <div className="text-lg font-bold tracking-tight">Nomi</div>
            <div className="text-xs text-dim">gider takibi</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-mint/15 text-mint' : 'text-dim hover:bg-surface2 hover:text-ink'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-dim/60">v1.0.0</div>
      </aside>

      {/* İçerik */}
      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 md:pb-10 md:pl-4 md:ml-60 lg:max-w-4xl">
        {children}
      </main>

      {/* Mobil alt gezinme */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface/90 backdrop-blur-lg md:hidden">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                isActive ? 'text-mint' : 'text-dim'
              }`
            }
          >
            <Icon size={20} strokeWidth={2.2} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
