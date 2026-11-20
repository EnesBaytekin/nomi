import { useEffect, useState } from 'react';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';
import { Button, Input } from '../components/ui';
import { api } from '../api/client';

export default function LoginPage() {
  const { login, setup } = useAuth();
  const toast = useToast();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ needsSetup: boolean }>('/auth/status')
      .then((r) => setNeedsSetup(r.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsSetup && password !== password2) {
      setError('Parolalar eşleşmiyor');
      return;
    }
    setBusy(true);
    try {
      if (needsSetup) {
        await setup(username.trim(), password);
        toast.show('Nomi hazır. Hoş geldin! 🎉');
      } else {
        await login(username.trim(), password);
        toast.show('Hoş geldin 👋');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/favicon.svg" alt="Nomi" className="h-20 w-20 rounded-3xl shadow-xl" />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Nomi</h1>
            <p className="mt-1 text-sm text-dim">
              {needsSetup ? 'Kurulum: ilk kullanıcı yönetici olur' : 'Hesabına giriş yap'}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            placeholder="Kullanıcı adı"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
            minLength={3}
          />
          <Input
            type="password"
            placeholder="Parola"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            required
            minLength={8}
          />
          {needsSetup && (
            <Input
              type="password"
              placeholder="Parola (tekrar)"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={busy || needsSetup === null} className="mt-2 w-full py-3 text-base">
            {busy ? '…' : needsSetup ? 'Kurulumu Tamamla' : 'Giriş Yap'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-dim/70">
          Oturumun bu cihazda 7 gün boyunca tazelenerek açık kalır.
        </p>
      </div>
    </div>
  );
}
