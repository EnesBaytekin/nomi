import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './state/auth';
import Layout from './components/Layout';
import LoginPage from './pages/Login';
import HomePage from './pages/Home';
import StatsPage from './pages/Stats';
import HistoryPage from './pages/History';
import SettingsPage from './pages/Settings';

export default function App() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <img src="/favicon.svg" alt="Nomi" className="h-14 w-14 animate-pulse rounded-2xl" />
          <span className="text-sm text-dim">Yükleniyor…</span>
        </div>
      </div>
    );
  }

  if (status === 'anon') {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace state={{ from: location.pathname }} />} />
      </Routes>
    </Layout>
  );
}
