import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Download, LogOut, Plus } from 'lucide-react';
import { api, downloadFile } from '../api/client';
import type { CatalogDto, User } from '../api/types';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';
import { Button, Card, ConfirmButton, Input, SectionTitle, Sheet } from '../components/ui';

const EMOJIS = [
  '🍽️', '🍲', '🍫', '☕', '🛒', '🚕', '🚌', '⛽', '🏠', '💡',
  '🤖', '🖥️', '📱', '🎮', '🎁', '🧴', '💊', '🎬', '✈️', '🛏️',
  '🪙', '📊', '📈', '💰', '🐾', '📚', '🏷️', '💸',
];

const COLORS = [
  '#34d399', '#38bdf8', '#a78bfa', '#fbbf24', '#fb7185',
  '#2dd4bf', '#f97316', '#f472b6', '#818cf8', '#a3e635',
];

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [catalog, setCatalog] = useState<CatalogDto | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [catDialog, setCatDialog] = useState<
    { id?: string; name?: string; icon?: string; color?: string } | null
  >(null);
  const [typeDialog, setTypeDialog] = useState<
    { id?: string; name?: string; icon?: string; categoryId: string; archived?: boolean } | null
  >(null);

  const load = useCallback(async () => {
    setCatalog(await api<CatalogDto>('/catalog'));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const swap = async (kind: 'category' | 'type', a: string, b: string) => {
    await api('/catalog/swap', { method: 'POST', body: { kind, a, b } });
    await load();
  };

  const moveType = async (catId: string, typeId: string, dir: -1 | 1) => {
    if (!catalog) return;
    const cat = catalog.categories.find((c) => c.id === catId)!;
    const idx = cat.types.findIndex((t) => t.id === typeId);
    const neighbor = cat.types[idx + dir];
    if (!neighbor) return;
    await swap('type', typeId, neighbor.id);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold tracking-tight">Ayarlar</h1>

      {/* Kategoriler ve türler */}
      <section>
        <SectionTitle
          right={
            <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setCatDialog({})}>
              <Plus size={14} /> Kategori
            </Button>
          }
        >
          Kategoriler ve türler
        </SectionTitle>
        <div className="flex flex-col gap-2">
          {(catalog?.categories ?? []).map((c, ci) => (
            <Card key={c.id} className="!p-0">
              <div className="flex items-center gap-2 px-3 py-3">
                <span className="text-lg">{c.icon}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                <button className="flex-1 text-left text-sm font-semibold" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                  {c.name}
                  <span className="ml-2 text-xs font-normal text-dim">{c.types.length} tür</span>
                </button>
                <div className="flex items-center">
                  <button
                    className="rounded-lg p-1.5 text-dim hover:text-ink disabled:opacity-20"
                    disabled={ci === 0}
                    onClick={() => swap('category', c.id, catalog!.categories[ci - 1]!.id)}
                    aria-label="Yukarı taşı"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-dim hover:text-ink disabled:opacity-20"
                    disabled={ci === catalog!.categories.length - 1}
                    onClick={() => swap('category', c.id, catalog!.categories[ci + 1]!.id)}
                    aria-label="Aşağı taşı"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    className="rounded-lg px-2 py-1 text-xs text-dim hover:text-ink"
                    onClick={() => setCatDialog({ id: c.id, name: c.name, icon: c.icon, color: c.color })}
                  >
                    düzenle
                  </button>
                </div>
              </div>

              {expanded === c.id && (
                <div className="border-t border-line px-3 py-2">
                  <ul className="flex flex-col">
                    {c.types.map((t, ti) => (
                      <li key={t.id} className="flex items-center gap-2 py-1.5">
                        <span>{t.icon}</span>
                        <span className={`flex-1 text-sm ${t.archived ? 'text-dim line-through' : ''}`}>
                          {t.name}
                          {t.archived && <span className="ml-2 text-[10px] text-dim">arşivli</span>}
                        </span>
                        <button className="rounded-lg p-1 text-dim hover:text-ink disabled:opacity-20" disabled={ti === 0} onClick={() => moveType(c.id, t.id, -1)} aria-label="Yukarı">
                          <ChevronUp size={14} />
                        </button>
                        <button className="rounded-lg p-1 text-dim hover:text-ink disabled:opacity-20" disabled={ti === c.types.length - 1} onClick={() => moveType(c.id, t.id, 1)} aria-label="Aşağı">
                          <ChevronDown size={14} />
                        </button>
                        <button
                          className="rounded-lg px-2 py-0.5 text-xs text-dim hover:text-ink"
                          onClick={() => setTypeDialog({ id: t.id, name: t.name, icon: t.icon, categoryId: c.id, archived: t.archived })}
                        >
                          düzenle
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="ghost"
                    className="mt-1 w-full !py-2 text-xs"
                    onClick={() => setTypeDialog({ categoryId: c.id })}
                  >
                    <Plus size={14} /> Bu kategoriye tür ekle
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* Hesap */}
      <section>
        <SectionTitle>Hesap</SectionTitle>
        <Card className="flex flex-col gap-4">
          <div className="text-sm">
            Oturum: <b>{user?.username}</b>
            {user?.isAdmin && <span className="ml-2 rounded-full bg-mint/15 px-2 py-0.5 text-[10px] font-semibold text-mint">yönetici</span>}
          </div>
          <PasswordForm />
          <Button variant="soft" onClick={() => void logout()}>
            <LogOut size={16} /> Çıkış Yap
          </Button>
        </Card>
      </section>

      {/* Kullanıcılar (yönetici) */}
      {user?.isAdmin && (
        <section>
          <SectionTitle>Kullanıcılar</SectionTitle>
          <UsersPanel />
        </section>
      )}

      {/* Veri */}
      <section>
        <SectionTitle>Veri</SectionTitle>
        <Card className="flex flex-col gap-2">
          <p className="text-xs text-dim">
            Tüm verilerini indir: yedekleme veya Excel'de açmak için.
          </p>
          <div className="flex gap-2">
            <Button
              variant="soft"
              className="flex-1"
              onClick={async () => {
                await downloadFile('/export?format=csv', `nomi-giderler.csv`);
                toast.show('CSV indirildi');
              }}
            >
              <Download size={16} /> CSV (Excel)
            </Button>
            <Button
              variant="soft"
              className="flex-1"
              onClick={async () => {
                await downloadFile('/export?format=json', `nomi-yedek-${new Date().toISOString().slice(0, 10)}.json`);
                toast.show('JSON indirildi');
              }}
            >
              <Download size={16} /> JSON (yedek)
            </Button>
          </div>
        </Card>
      </section>

      <p className="pb-2 text-center text-[11px] text-dim/60">
        Nomi v1.1.0 · veriler sunucuda AES-256-GCM ile şifreli saklanır
      </p>

      {/* Diyaloglar */}
      {catDialog && (
        <CategoryDialog
          state={catDialog}
          onClose={() => setCatDialog(null)}
          onDone={() => {
            setCatDialog(null);
            void load();
          }}
        />
      )}
      {typeDialog && (
        <TypeDialog
          state={typeDialog}
          categories={catalog?.categories ?? []}
          onClose={() => setTypeDialog(null)}
          onDone={() => {
            setTypeDialog(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

// --- Diyaloglar ---

function CategoryDialog({
  state,
  onClose,
  onDone,
}: {
  state: { id?: string; name?: string; icon?: string; color?: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const isEdit = state.id !== undefined;
  const [name, setName] = useState(isEdit ? state.name ?? '' : '');
  const [icon, setIcon] = useState(isEdit ? state.icon ?? '🏷️' : '🏷️');
  const [color, setColor] = useState(isEdit ? state.color ?? '#34d399' : COLORS[0]!);

  const submit = async () => {
    try {
      if (isEdit) {
        await api(`/categories/${state.id}`, { method: 'PATCH', body: { name, icon, color } });
        toast.show('Kategori güncellendi');
      } else {
        await api('/categories', { body: { name, icon, color } });
        toast.show('Kategori eklendi');
      }
      onDone();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'İşlem başarısız', 'err');
    }
  };

  const remove = async () => {
    try {
      await api(`/categories/${state.id}`, { method: 'DELETE' });
      toast.show('Kategori silindi');
      onDone();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Silinemedi', 'err');
    }
  };

  return (
    <Sheet open onClose={onClose} title={isEdit ? 'Kategoriyi Düzenle' : 'Yeni Kategori'}>
      <div className="flex flex-col gap-3">
        <Input placeholder="Kategori adı" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <EmojiPicker value={icon} onChange={setIcon} />
        <ColorPicker value={color} onChange={setColor} />
        <div className="mt-1 flex gap-2">
          <Button className="flex-1" onClick={submit} disabled={!name.trim()}>
            {isEdit ? 'Kaydet' : 'Ekle'}
          </Button>
          {isEdit && (
            <ConfirmButton
              onConfirm={remove}
              confirmLabel="Emin misin?"
              className="rounded-xl bg-danger/15 px-4 py-2.5 text-sm font-semibold text-danger"
            >
              Sil
            </ConfirmButton>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function TypeDialog({
  state,
  categories,
  onClose,
  onDone,
}: {
  state: { id?: string; name?: string; icon?: string; categoryId: string; archived?: boolean };
  categories: CatalogDto['categories'];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const isEdit = state.id !== undefined;
  const [name, setName] = useState(isEdit ? state.name ?? '' : '');
  const [icon, setIcon] = useState(isEdit ? state.icon ?? '💸' : '💸');
  const [categoryId, setCategoryId] = useState(state.categoryId);
  const [archived, setArchived] = useState(state.archived ?? false);

  const submit = async () => {
    try {
      if (isEdit) {
        await api(`/types/${state.id}`, { method: 'PATCH', body: { name, icon, categoryId, archived } });
        toast.show('Tür güncellendi');
      } else {
        await api('/types', { body: { name, icon, categoryId } });
        toast.show('Tür eklendi');
      }
      onDone();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'İşlem başarısız', 'err');
    }
  };

  const remove = async () => {
    try {
      await api(`/types/${state.id}`, { method: 'DELETE' });
      toast.show('Tür silindi');
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Silinemedi';
      toast.show(/harcamalar var/i.test(msg) ? `${msg} — türü arşivleyebilirsin.` : msg, 'err');
    }
  };

  return (
    <Sheet open onClose={onClose} title={isEdit ? 'Türü Düzenle' : 'Yeni Tür'}>
      <div className="flex flex-col gap-3">
        <Input placeholder="Tür adı" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <EmojiPicker value={icon} onChange={setIcon} />
        <div>
          <p className="mb-1 text-xs text-dim">Kategori</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  categoryId === c.id ? 'border-mint bg-mint/10 text-mint' : 'border-line text-dim'
                }`}
              >
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-[#34d399]" />
            Arşivle (yeni kayıtlarda görünmez, geçmiş korunur)
          </label>
        )}
        <div className="mt-1 flex gap-2">
          <Button className="flex-1" onClick={submit} disabled={!name.trim()}>
            {isEdit ? 'Kaydet' : 'Ekle'}
          </Button>
          {isEdit && (
            <ConfirmButton
              onConfirm={remove}
              confirmLabel="Emin misin?"
              className="rounded-xl bg-danger/15 px-4 py-2.5 text-sm font-semibold text-danger"
            >
              Sil
            </ConfirmButton>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs text-dim">Simge</p>
      <div className="grid grid-cols-7 gap-1 sm:grid-cols-14">
        {EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => onChange(e)}
            className={`rounded-lg py-1.5 text-lg transition ${value === e ? 'bg-mint/15 ring-1 ring-mint' : 'hover:bg-surface2'}`}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs text-dim">Renk</p>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`h-7 w-7 rounded-full transition ${value === c ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-surface' : ''}`}
            style={{ background: c }}
            aria-label={`Renk ${c}`}
          />
        ))}
      </div>
    </div>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      toast.show('Parola değiştirildi');
      setCurrent('');
      setNext('');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Değiştirilemedi', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-dim">Parola değiştir</p>
      <Input type="password" placeholder="Mevcut parola" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      <Input type="password" placeholder="Yeni parola (en az 8 karakter)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      <Button variant="soft" onClick={submit} disabled={busy || !current || next.length < 8}>
        Parolayı Güncelle
      </Button>
    </div>
  );
}

function UsersPanel() {
  const toast = useToast();
  const [users, setUsers] = useState<User[] | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { user } = useAuth();

  const load = useCallback(async () => {
    const res = await api<{ users: User[] }>('/users');
    setUsers(res.users);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    try {
      await api('/users', { body: { username: username.trim(), password } });
      toast.show('Kullanıcı eklendi');
      setUsername('');
      setPassword('');
      await load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Eklenemedi', 'err');
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/users/${id}`, { method: 'DELETE' });
      toast.show('Kullanıcı silindi');
      await load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Silinemedi', 'err');
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <ul className="flex flex-col">
        {(users ?? []).map((u) => (
          <li key={u.id} className="flex items-center gap-2 border-b border-line/40 py-2 last:border-0">
            <span className="flex-1 text-sm">
              {u.username}
              {u.isAdmin && <span className="ml-2 text-[10px] font-semibold text-mint">yönetici</span>}
            </span>
            {u.id !== user?.id && (
              <ConfirmButton
                onConfirm={() => remove(u.id)}
                confirmLabel="Emin misin?"
                className="rounded-lg px-2 py-1 text-xs text-dim hover:text-danger"
              >
                sil
              </ConfirmButton>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <Input placeholder="Yeni kullanıcı adı" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Input type="password" placeholder="Parola (en az 8 karakter)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <Button variant="soft" onClick={add} disabled={username.trim().length < 3 || password.length < 8}>
          <Plus size={16} /> Kullanıcı Ekle
        </Button>
      </div>
    </Card>
  );
}
