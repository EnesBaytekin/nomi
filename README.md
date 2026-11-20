# Nomi 💰

Kişisel gider takibi — mobil öncelikli web uygulaması (PWA). Cebindeki her harcamayı **tutar + tür** seçimiyle saniyeler içinde kaydet; kategorilere göre özet, grafikler ve saatlik desenler üzerinden harcama alışkanlıklarını gör.

> **Nomi** yerel çalışır, verileriniz kendi sunucunuzda şifreli tutulur. Sıfır bulut bağımlılığı.

---

## Özellikler

- **Hızlı giriş** — Ana ekranda tutarı yaz, türünü seç, bitti. Tek dokunuşla sık kullanılan türler.
- **Türler & kategoriler** — Yemek, Abur cubur, Ulaşım, Yapay zeka, Sunucu, Telefon, Hediye, Altın, Borsa, Konaklama, Kişisel, Eğlence hazır gelir; hepsi Ayarlar'dan düzenlenebilir. Kategoriler türleri gruplar; istatistikler kategori bazında toplanır.
- **İstatistikler** — Günlük/aylık grafikler, kategori/tür seçimi ve karşılaştırması, aylar arası değişim oranları, saatlik harcama deseni, takvim ısı haritası.
- **Geçmiş** — Ay ay liste, satır içi düzenleme ve silme, CSV dışa aktarma.
- **PWA** — Android ana ekranına kurulur, tam ekran çalışır; masaüstünde de duyarlı (responsive) arayüz.
- **Çok kullanıcılı** — Sunucuda birden fazla yerel kullanıcı tanımlanabilir; her kullanıcının verisi ayrı tutulur ve kendi anahtarıyla şifrelenir.

## Mimari

```
nomi/
├── server/   Fastify 5 + better-sqlite3 + zod   (REST API, kimlik doğrulama, şifreleme)
├── web/      React 18 + Vite + Tailwind 4 + Recharts (PWA istemcisi)
└── data/     SQLite veritabanı (üretim, git'e girmez)
```

Tek komutla geliştirme: `npm run dev` (API + Vite birlikte ayağa kalkar; `/api` istekleri proxy'lenir).

## Neden SQLite (ilişkisel) — zaman serisi veritabanı değerlendirmesi

Gider verisi "zamanla işaretlenen değerler" gibi görünse de zaman serisi (TSDB) bir veritabanı bu kullanım için uygun değil:

| Kriter | TSDB (InfluxDB, Timescale…) | İlişkisel (SQLite) |
|---|---|---|
| Yazma deseni | Yüksek frekanslı, değiştirilemez kayıt | Kişide günde birkaç kayıt — arka plan gereksiz |
| Düzeltme/silme | Zor / modele aykırı | Doğal — yanlış girişler düzenlenir |
| Sorgular | Zaman aralığı agregasyonlarına odaklı | Kullanıcı, kategori, tür ile **join + gruplama** serbest |
| Şifreli satır verisi | Zorlanır | Satır bazlı şifreleme kolay |
| İşletim maliyeti | Ayrı servis, bellek tüketimi | Tek dosya, tek proses, sıfır bakım |
| Yedekleme | Anlık görüntü araçları | `cp` / `sqlite3 .backup` |

Kullanıcı başına günde ~10 kayıtla yıllık ~4.000 satır — SQLite bu hacmi haber bile etmez. Kategori/tür/join ağırlıklı sorgular, satır bazlı şifreleme ihtiyacı ve "tek dosya yedekle" sadeliği ilişkisel modeli açık ara öne çıkarır. MySQL/PostgreSQL'e geçiş gerekirse zaten standart SQL yazıyoruz; şema taşınabilir.

## Güvenlik

- **Şifreler** `scrypt` ile (kullanıcıya özel salt) hash'lenir; düz metin hiçbir yerde durmaz.
- **Access token** — JWT (HS256), **10 dakika** ömür. Sessiz yenilenir, kullanıcıyı rahatsız etmez.
- **Refresh token** — opak rastgele token, veritabanında SHA-256 özeti tutulur; **7 gün** ömür ve **kayan pencere**: uygulamayı her açışınızda süre sıfırlanır. Bir hafta boyunca en az bir kez girerseniz şifre sorulmaz.
- **Rotasyon + replay koruması** — Her yenilemede refresh token değişir; eski token yeniden kullanılırsa ailenin tamamı iptal edilir.
- **Veri şifreleme** — Gider `{tutar, not}` alanları **AES-256-GCM** ile şifreli saklanır. Kullanıcı başına rastgele **DEK** üretilir, DEK yalnızca `MASTER_KEY` ile sarmalanır (envelope şifreleme). DB dosyası çalınsa bile veriler okunamaz.
- **Çerez** — Refresh çerezi `httpOnly`, `SameSite=Strict`, `Path=/api/auth`; `COOKIE_SECURE=true` ile yalnız HTTPS.
- **Kullanıcı verisi izolasyonu** — Tüm sorgular oturum sahibiyle sınırlıdır.

## Geliştirme Kurulumu

Gereksinim: Node.js 20+ (22 önerilir)

```bash
git clone https://github.com/EnesBaytekin/nomi.git
cd nomi
npm install

# gizli anahtarları üret
cp .env.example .env
openssl rand -base64 32   # → JWT_SECRET
openssl rand -base64 32   # → MASTER_KEY

npm run dev
# API   → http://localhost:3000
# Web   → http://localhost:5173
```

İlk açılışta `/api/auth/status` `needsSetup` döner; arayüz **ilk kullanıcıyı yönetici olarak** oluşturur.

### Ortam değişkenleri

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `JWT_SECRET` | JWT imza anahtarı (32 byte, base64) — **zorunlu** | — |
| `MASTER_KEY` | Veri şifreleme ana anahtarı (32 byte, base64) — **zorunlu**, kaybedilirse veriler kurtarılamaz | — |
| `HOST` | Sunucu adresi | `0.0.0.0` |
| `PORT` | Sunucu portu | `3000` |
| `DB_PATH` | SQLite dosya yolu (çalışma dizinine göre) | `./data/nomi.db` |
| `COOKIE_SECURE` | Refresh çerezi yalnız HTTPS'de taşınır | `false` |
| `NODE_ENV` | `production` → statik web arayüzü `web/dist` servis edilir | `development` |
| `WEB_ORIGIN` | Geliştirme CORS kaynağı | `http://localhost:5173` |

## Üretim Dağıtımı

### Docker (önerilen)

```bash
cp .env.example .env       # anahtarları üret, COOKIE_SECURE=true yap (TLS arkasında)
docker compose up -d --build
# uygulama http://localhost:3000 üzerinde (web + API aynı sunucuda)
```

`NODE_ENV=production` iken Fastify, `web/dist` çıktısını da servis eder; tek konteyner yeterlidir. Veritabanı konteyner içinde `/app/data` altındadır — compose bunu `./data` klasörüne bağlar.

### Sunucu + TLS

En kolay yol Caddy (otomatik Let's Encrypt):

```
# /etc/caddy/Caddyfile
nomi.ornek.com {
    reverse_proxy localhost:3000
}
```

`COOKIE_SECURE=true` ve `NODE_ENV=production` unutmayın.

### Manuel (Docker'sız)

```bash
npm ci
npm run build          # web/dist üretir
NODE_ENV=production npm start
```

## Yedekleme

SQLite tek dosyadır; kopyalamadan önce tutarlılık için:

```bash
sqlite3 data/nomi.db ".backup 'backups/nomi-$(date +%F).db'"
```

`MASTER_KEY` olmadan yedek **çözülemez** — anahtarı parola yöneticinizde ayrıca saklayın.

## PWA Kurulumu (Android)

1. Chrome ile uygulamayı açın.
2. Menü → **Ana ekrana ekle** (veya adres çubuğundaki kur simgesi).
3. Nomi, kendi simgesiyle tam ekran açılır; çevrimdışıkalınca son görüntülenmiş sayfalar önbellekten çalışır, veriler çevrimiçi eşitlenir.

## API Özeti

| Yol | Açıklama |
|---|---|
| `POST /api/auth/setup` | İlk kullanıcıyı yönetici olarak oluşturur (yalnız kullanıcı yokken) |
| `POST /api/auth/login` | Oturum açar (access + refresh çerezi) |
| `POST /api/auth/refresh` | Access token yeniler, refresh token döndürür |
| `POST /api/auth/logout` | Oturumu kapatır |
| `GET /api/auth/status` | Kurulum gerekli mi / oturum açık mı |
| `GET/POST/PATCH/DELETE /api/expenses` | Gider CRUD (şifreli veri) |
| `GET/POST/PATCH/DELETE /api/catalog/*` | Kategori ve tür yönetimi |
| `GET /api/stats/monthly` | Aylık istatistik paketi (özet, günlük, kategori, tür, saatlik) |
| `GET /api/export/csv` | CSV dışa aktarma |
| `GET /api/users` | Kullanıcı listesi (yalnız yönetici) |

## Lisans

MIT
