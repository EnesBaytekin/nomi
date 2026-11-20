# Nomi

Türkçe, mobil öncelikli kişisel harcama takibi. **Tek binary** — web arayüzü içine gömülü, veritabanı SQLite. Sunucuya at, çalıştır, bitti.

![Go](https://img.shields.io/badge/Go-1.26-00ADD8) ![PWA](https://img.shields.io/badge/PWA-kurulumlu-5A0FC8)

## Öne çıkanlar

- **Tek dosya dağıtım:** frontend (React + Vite + PWA) Go binary'sine gömülü (`go:embed`). Ayrı Node process'i, ayrı nginx statik servisi yok.
- **Hızlı giriş:** tutar + tür; birkaç dokunuşta kayıt.
- **Türler & kategoriler:** hazır 12 tür (Yemek, Abur cubur, Ulaşım, Yapay zeka, Sunucu, Telefon, Hediye, Altın, Borsa, Konaklama, Kişisel, Eğlence); ayarlardan ekle/düzenle/arşivle/sırala.
- **İstatistikler:** aylık/günlük grafikler, kategori ve tür kırılımı, geçen ayla karşılaştırma, saat dağılımı, takvim ısı haritası.
- **Çok kullanıcılı:** ilk kullanıcı yönetici olur; yönetici kullanıcı ekler/siler.
- **Şifreli veri:** tutar + not, kullanıcı başına DEK ile AES-256-GCM şifreli; DEK'ler `MASTER_KEY` ile sarılı saklanır. DB dosyası ele geçse bile veri okunamaz.
- **Modern kimlik doğrulama:** 10 dakikalık JWT erişim tokenı; httpOnly çerezdeki refresh token 7 gün kayan pencereyle her girişte uzar ve döndürülür; token tekrar kullanımı (replay) tespit edilirse oturum ailesi iptal edilir.
- **Offline PWA:** service worker ile kurulabilir; Android'de "Ana ekrana ekle".

## Neden SQLite (zaman serisi DB değil)?

Harcama verisi yazım hacmi düşük ama **düzenleme/silme yoğun** bir kayıt kümesidir; istatistikler tür–kategori **join'leri** ve ay/gün/saat bucket'lamasıyla şekillenir. Zaman serisi veritabanları (retention, downsampling) silmeyi/düzenlemeyi zorlaştırır ve bu join'lere uygun değildir. SQLite tek dosyada işlem garantisi (ACID), tam metin aramaya gerek olmayan basit sorgular ve sıfır yönetim yükü sunar; satır bazlı şifreleme ile de doğal uyumludur. Binary içinde cgo'suz (`modernc.org/sqlite`) gelir — kurulum gerektirmez.

## Sürüm indirme (önerilen)

[Releases](https://github.com/EnesBaytekin/nomi/releases) sayfasından platformunuza uygun arşivi indirin:

| Dosya | Platform |
|---|---|
| `nomi-linux-amd64.tar.gz` | Linux 64-bit (çoğu VPS) |
| `nomi-linux-arm64.tar.gz` | Linux ARM64 (Oracle/AWS Graviton, Raspberry Pi 4 64-bit) |
| `nomi-linux-arm.tar.gz` | Linux ARMv7 (Raspberry Pi 32-bit) |
| `nomi-darwin-*.tar.gz` | macOS (Intel / Apple Silicon) |
| `nomi-windows-amd64.zip` | Windows 64-bit |

```bash
tar xzf nomi-linux-amd64.tar.gz
cp .env.example .env
nano .env   # JWT_SECRET ve MASTER_KEY'i doldur: openssl rand -base64 32
./nomi
```

Arayüz `http://<sunucu>:3000` adresinde. İlk açılışta yönetici hesabı kurulumu yapılır. Sürümü doğrulamak için: `./nomi -version`.

> **Önemli:** `MASTER_KEY` kaybolursa şifreli veriler kurtarılamaz. Parola yöneticinizde yedekleyin.

## Sunucu kurulumu (systemd)

```ini
# /etc/systemd/system/nomi.service
[Unit]
Description=Nomi harcama takibi
After=network.target

[Service]
User=nomi
WorkingDirectory=/opt/nomi
ExecStart=/opt/nomi/nomi
Restart=on-failure
# Alternatif: gizli anahtarları ortam değişkeni olarak da verebilirsiniz
# Environment=JWT_SECRET=... MASTER_KEY=... COOKIE_SECURE=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now nomi
```

İnternete açarken önüne TLS koyun (Caddy önerilir):

```
# /etc/caddy/Caddyfile
harcama.ornek.com {
    reverse_proxy localhost:3000
}
```

TLS kullanıyorsanız `.env` içinde `COOKIE_SECURE=true` yapın.

## Yedekleme

Tek dosya: `data/nomi.db` (WAL yandaşlarıyla). Kopyalamak yeterli:

```bash
sqlite3 data/nomi.db "VACUUM INTO 'yedek.db'"   # tutarlı anlık görüntü
```

Ayrıca uygulama içinden Ayarlar → **Yedek (JSON)** ile tüm veriyi dışa aktarabilirsiniz.

## Yapılandırma

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `JWT_SECRET` | — (**zorunlu**) | 32 byte base64. `openssl rand -base64 32` |
| `MASTER_KEY` | — (**zorunlu**) | 32 byte base64. Veri şifreleme ana anahtarı |
| `HOST` | `0.0.0.0` | Dinlenecek adres |
| `PORT` | `3000` | Dinlenecek port |
| `DB_PATH` | `./data/nomi.db` | SQLite dosya yolu |
| `COOKIE_SECURE` | `false` | Refresh çerezi yalnız HTTPS'te taşınır |

`.env` dosyası binary'nin çalışma dizininde (veya bir üst dizinde) aranır; ortam değişkenleri önceliklidir.

## Geliştirme

Gereksinimler: **Go 1.26+**, **Node 20+**.

```bash
npm install && npm install --prefix web
npm run dev          # go run . (:3000 API) + vite (:5173, /api proxy)
```

Üretim derlemesi:

```bash
npm run build        # web/dist üretilir (binary'ye gömülür)
npm run build:server # ./nomi binary'si
```

Dizinler:

```
main.go, internal/          Go backend (config, store, auth, cryptoutil, httpapi)
web/                        React + Vite + Tailwind arayüz (dist → binary'ye gömülür)
.github/workflows/          CI (derleme doğrulama) + Release (tag → binary'ler)
```

## Sürüm çıkarma

```bash
git tag v1.2.0 && git push origin v1.2.0
```

GitHub Actions 6 platform için binary derler (arayüz gömülü), `.env.example` ile paketler ve Release'e ekler.

## API özeti

Tüm uçlar `/api` önekiyle; kimlik `Authorization: Bearer <accessToken>`.

- `POST /auth/setup` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout`
- `GET /auth/status` · `GET /auth/me` · `POST /auth/password`
- `GET /home` — bugünün/ayın toplamı, türler, son kullanılanlar
- `POST /expenses` · `GET /expenses?from&to&typeId&limit&offset` · `PATCH /expenses/{id}` · `DELETE /expenses/{id}`
- `GET /catalog` · `POST /catalog/swap` · `POST|PATCH|DELETE /categories[/{id}]` · `POST|PATCH|DELETE /types[/{id}]`
- `GET /stats/monthly?months&tz`
- `GET /export?format=json|csv`
- `GET /users` · `POST /users` · `DELETE /users/{id}` (yönetici)
- `GET /health` — sağlık/sürüm

Lisans: MIT
