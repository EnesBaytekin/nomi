#!/usr/bin/env bash
# =====================================================================
# Nomi kurulum betiği
#
# Tek satır (en son sürüm):
#   curl -fsSL https://raw.githubusercontent.com/EnesBaytekin/nomi/main/install.sh | bash
#
# Belirli bir sürüm (güncelleme de aynı şekilde):
#   curl -fsSL https://raw.githubusercontent.com/EnesBaytekin/nomi/main/install.sh | bash -s -- v1.0.0
#
# Ne yapar:
#   - İşletim sistemi ve mimariyi algılar (linux amd64/arm64/armv7, darwin amd64/arm64)
#   - İlgili release arşivini indirir, binary'yi NOMI_DIR altına kurar
#   - .env yoksa üretir (JWT_SECRET, MASTER_KEY → openssl rand -base64 32)
#   - systemd varsa nomi servisini kurar, etkinleştirir, başlatır ve
#     /api/health ile doğrular
#   - Tekrar çalıştırmak = güvenli güncelleme (.env ve veritabanı korunur)
#
# Private depo için: token verin (public depoda gerekmez)
#   export GITHUB_TOKEN=github_pat_xxx
#   curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" \
#     https://raw.githubusercontent.com/EnesBaytekin/nomi/main/install.sh | bash
#
# Ortam değişkenleri:
#   NOMI_DIR           kurulum dizini (varsayılan /opt/nomi)
#   NOMI_NO_SERVICE=1  systemd kurulumunu atla (binary + .env yeter)
#   NOMI_REPO          başka fork'tan kurulum (varsayılan EnesBaytekin/nomi)
#   GITHUB_TOKEN/GH_TOKEN  private depo indirmeleri için
# =====================================================================
set -euo pipefail

REPO="${NOMI_REPO:-EnesBaytekin/nomi}"
VERSION="${1:-latest}"
NOMI_DIR="${NOMI_DIR:-/opt/nomi}"
GH="https://github.com/${REPO}"
API="https://api.github.com/repos/${REPO}"

if [ -t 1 ]; then
  C_OK=$'\033[1;32m'; C_W=$'\033[1;33m'; C_E=$'\033[1;31m'; C_R=$'\033[0m'
else
  C_OK=""; C_W=""; C_E=""; C_R=""
fi
log()  { printf '%s==>%s %s\n' "$C_OK" "$C_R" "$*"; }
warn() { printf '%s[!]%s %s\n' "$C_W" "$C_R" "$*" >&2; }
err()  { printf '%shata:%s %s\n' "$C_E" "$C_R" "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || err "'curl' gerekli — paket yöneticinizle kurun"
command -v tar  >/dev/null 2>&1 || err "'tar' gerekli — paket yöneticinizle kurun"

# GitHub istekleri: private depo için GITHUB_TOKEN/GH_TOKEN ile kimlikli,
# public depoda anonim.
gh_curl() {
  local TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  if [ -n "$TOKEN" ]; then
    curl -fsSL -H "Authorization: Bearer ${TOKEN}" "$@"
  else
    curl -fsSL "$@"
  fi
}

# --- OS / mimari tespiti ------------------------------------------------
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Linux)  GOOS=linux ;;
  Darwin) GOOS=darwin ;;
  *) err "desteklenmeyen işletim sistemi: ${OS}
Windows için release sayfasından nomi-windows-amd64.zip indirin: ${GH}/releases" ;;
esac
case "$ARCH" in
  x86_64|amd64)  GOARCH=amd64 ;;
  aarch64|arm64) GOARCH=arm64 ;;
  armv6l|armv7l) GOARCH=arm ;;
  *) err "desteklenmeyen mimari: ${ARCH}" ;;
esac
ASSET="nomi-${GOOS}-${GOARCH}.tar.gz"

# --- sürüm çözümleme ------------------------------------------------------
TAG="${VERSION:-latest}"
if [ "$TAG" = "latest" ]; then
  log "en son sürüm sorgulanıyor..."
  TAG="$(gh_curl "${API}/releases/latest" \
    | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
  [ -n "$TAG" ] || err "en son sürüm bulunamadı: ${API}/releases/latest"
fi
TAG="v${TAG#v}"   # "1.0.0" → "v1.0.0"

# --- indir ------------------------------------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
log "${REPO} ${TAG} indiriliyor (${ASSET})..."

# Release asset'i API üzerinden indir (private depoda browser indirme URL'si
# token'ı kabul etmez; API'nin octet-stream ucu her iki durumda da çalışır).
ASSET_URL=""
if command -v jq >/dev/null 2>&1; then
  ASSET_ID="$(gh_curl "${API}/releases/tags/${TAG}" \
    | jq -r --arg n "$ASSET" '.assets[]? | select(.name == $n) | .id' | head -n1)"
elif command -v python3 >/dev/null 2>&1; then
  ASSET_ID="$(gh_curl "${API}/releases/tags/${TAG}" \
    | python3 -c 'import json,sys
d = json.load(sys.stdin)
print(next((a["id"] for a in d.get("assets", []) if a["name"] == sys.argv[1]), ""))' "$ASSET")"
fi

if [ -n "${ASSET_ID:-}" ]; then
  gh_curl -H "Accept: application/octet-stream" \
    -o "${TMP}/${ASSET}" "${API}/releases/assets/${ASSET_ID}" \
    || err "asset indirilemedi (api/releases/assets/${ASSET_ID})"
else
  # jq/python3 yok: public depoda doğrudan indirme URL'si çalışır.
  log "uyarı: jq/python3 bulunamadı, doğrudan indirme denenecek (private depoda jq veya python3 gerekli)"
  gh_curl -o "${TMP}/${ASSET}" "${GH}/releases/download/${TAG}/${ASSET}" \
    || err "indirilemedi: ${GH}/releases/download/${TAG}/${ASSET}
Sürüm mevcut mu? → ${GH}/releases
Private depo ise jq (veya python3) kurun ve GITHUB_TOKEN verin."
fi
tar -xzf "${TMP}/${ASSET}" -C "$TMP"
BIN_SRC="${TMP}/nomi-${GOOS}-${GOARCH}"
[ -f "$BIN_SRC" ] || err "arşivde binary bulunamadı: ${ASSET}"
INSTALLED_VERSION="$("$BIN_SRC" -version | sed 's/^Nomi //')"

# --- yetki -------------------------------------------------------------------
# Root isek sudo'suz; hedef dizin yazılabilir ve servis istenmiyorsa yine
# sudo'suz devam (kendi makinende test için pratik). Aksi halde sudo kullan.
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  CAN_WRITE=0
  if [ -w "$NOMI_DIR" ]; then CAN_WRITE=1; fi
  if [ ! -e "$NOMI_DIR" ] && [ -w "$(dirname "$NOMI_DIR")" ]; then CAN_WRITE=1; fi
  if [ "$CAN_WRITE" = 1 ] && [ "${NOMI_NO_SERVICE:-0}" = "1" ]; then
    SUDO=""
  elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    err "kurulum root yetkisi gerektiriyor (veya NOMI_DIR'i yazılabilir bir yere alın + NOMI_NO_SERVICE=1)"
  fi
fi

UPGRADE=0
if [ -x "${NOMI_DIR}/nomi" ]; then UPGRADE=1; fi

# --- systemd kullanılacak mı? --------------------------------------------------
SERVICE_FILE="/etc/systemd/system/nomi.service"
HAVE_SYSTEMD=0
if [ "$GOOS" = "linux" ] && [ -d /run/systemd/system ] && [ "${NOMI_NO_SERVICE:-0}" != "1" ]; then
  HAVE_SYSTEMD=1
fi

if [ "$HAVE_SYSTEMD" = "1" ] && [ "$UPGRADE" = "1" ]; then
  log "çalışan servis durduruluyor..."
  $SUDO systemctl stop nomi.service >/dev/null 2>&1 || true
fi

# --- kurulum dizini + binary -----------------------------------------------------
$SUDO mkdir -p "${NOMI_DIR}/data" \
  || err "${NOMI_DIR} oluşturulamadı — root ile çalıştırın ya da: NOMI_DIR=<yazılabilir-dizin> NOMI_NO_SERVICE=1"

log "binary kuruluyor → ${NOMI_DIR}/nomi"
$SUDO install -m 0755 "$BIN_SRC" "${NOMI_DIR}/nomi"

# --- .env --------------------------------------------------------------------------
if [ ! -f "${NOMI_DIR}/.env" ]; then
  command -v openssl >/dev/null 2>&1 \
    || err "'.env' üretimi için 'openssl' gerekli. ${NOMI_DIR}/.env dosyasını elle oluşturun (örnek: .env.example)"
  JWT="$(openssl rand -base64 32)"
  MASTER="$(openssl rand -base64 32)"
  $SUDO tee "${NOMI_DIR}/.env" >/dev/null <<EOF
# Nomi yapılandırması — install.sh tarafından üretildi
JWT_SECRET=${JWT}
MASTER_KEY=${MASTER}
HOST=0.0.0.0
PORT=3000
DB_PATH=./data/nomi.db
# TLS (https) arkasında yayına alınca true yapın
COOKIE_SECURE=false
EOF
  log ".env üretildi → ${NOMI_DIR}/.env"
else
  log "mevcut .env korundu → ${NOMI_DIR}/.env"
fi
$SUDO chmod 600 "${NOMI_DIR}/.env"

# --- servisi kullanıcısı + systemd birimi --------------------------------------------
RUN_USER=""
if [ "$HAVE_SYSTEMD" = "1" ]; then
  if id -u nomi >/dev/null 2>&1; then
    RUN_USER=nomi
  elif command -v useradd >/dev/null 2>&1; then
    if $SUDO useradd --system --no-create-home --shell /usr/sbin/nologin nomi 2>/dev/null; then
      RUN_USER=nomi
    fi
  elif command -v adduser >/dev/null 2>&1; then
    if $SUDO adduser -S -H -s /sbin/nologin nomi 2>/dev/null; then
      RUN_USER=nomi
    fi
  fi
  if [ -n "$RUN_USER" ]; then
    $SUDO chown -R "$RUN_USER" "${NOMI_DIR}"
  else
    warn "'nomi' sistemi kullanıcısı oluşturulamadı — servis root olarak çalışacak"
  fi

  USER_LINE=""
  if [ -n "$RUN_USER" ]; then USER_LINE="User=${RUN_USER}"; fi
  log "systemd servisi yazılıyor → ${SERVICE_FILE}"
  $SUDO tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Nomi harcama takibi
After=network.target

[Service]
${USER_LINE}
WorkingDirectory=${NOMI_DIR}
ExecStart=${NOMI_DIR}/nomi
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${NOMI_DIR}

[Install]
WantedBy=multi-user.target
EOF
  $SUDO systemctl daemon-reload
  if [ "$UPGRADE" = "1" ]; then
    $SUDO systemctl restart nomi.service
  else
    $SUDO systemctl enable --now nomi.service
  fi
fi

# --- sağlık kontrolü -------------------------------------------------------------------
PORT=""
if [ -f "${NOMI_DIR}/.env" ]; then
  PORT="$(grep -E '^PORT=' "${NOMI_DIR}/.env" | tail -n1 | cut -d= -f2 | tr -d '[:space:]' || true)"
fi
PORT="${PORT:-3000}"
if [ "$HAVE_SYSTEMD" = "1" ]; then
  log "servis başlatıldı, sağlık kontrolü (:${PORT})..."
  HEALTHY=0
  for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then HEALTHY=1; break; fi
    sleep 1
  done
  if [ "$HEALTHY" != "1" ]; then
    warn "servis henüz yanıt vermiyor — loglar: journalctl -u nomi -n 50 --no-pager"
  fi
fi

# --- özet ---------------------------------------------------------------------------------
printf '\n'
log "Kurulum tamam ✓"
printf '\n'
printf '  Sürüm        : %s\n' "$INSTALLED_VERSION"
printf '  Dizin        : %s\n' "$NOMI_DIR"
printf '  Yapılandırma : %s/.env  ← MASTER_KEY güvenli bir yere yedekleyin!\n' "$NOMI_DIR"
printf '  Veritabanı   : %s/data/nomi.db\n' "$NOMI_DIR"
if [ "$HAVE_SYSTEMD" = "1" ]; then
  printf '  Adres        : http://<sunucu-ip>:%s\n' "$PORT"
  printf '  Servis       : systemctl status nomi\n'
  printf '  Loglar       : journalctl -u nomi -f\n'
else
  printf '  Başlatma     : cd %s && ./nomi\n' "$NOMI_DIR"
fi
printf '  Güncelleme   : bu betiği yeni sürümle tekrar çalıştırın\n\n'
