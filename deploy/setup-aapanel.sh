#!/usr/bin/env bash
#
# Setup NagaLiveChat di server aaPanel / BT Panel.
#
# Jalankan di menu Terminal aaPanel (atau lewat SSH) SETELAH Anda membuat
# website untuk domain tersebut di panel:
#
#   curl -fsSL https://raw.githubusercontent.com/JefryLim22/nagalivechat/main/deploy/setup-aapanel.sh -o setup.sh
#   bash setup.sh
#
# Script ini mengurus: Node.js 22, PM2, clone repo, .env, dan menjalankan
# aplikasi. Bagian domain, reverse proxy, dan SSL tetap lewat panel.
#
# Aman dijalankan ulang: berkas .env yang sudah ada TIDAK akan ditimpa,
# sehingga JWT_SECRET dan sesi agent yang sedang aktif tidak hilang.
#
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/JefryLim22/nagalivechat.git}
BRANCH=${BRANCH:-main}
SERVICE=nagalivechat

c_ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
c_info() { printf '\033[0;34m›\033[0m %s\n' "$1"; }
c_warn() { printf '\033[0;33m!\033[0m %s\n' "$1"; }
c_err()  { printf '\033[0;31m✗\033[0m %s\n' "$1" >&2; }
step()   { printf '\n\033[1;35m━━ %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- input ----
step "Konfigurasi"

if [[ ! -d /www/server/panel ]]; then
    c_warn "Folder aaPanel (/www/server/panel) tidak ditemukan di server ini."
    c_warn "Bila ini VPS polos tanpa panel, pakai deploy/setup-server.sh."
    read -rp "Tetap lanjutkan? [y/N]: " GO
    [[ "${GO,,}" =~ ^y ]] || exit 1
fi

read -rp "Domain (contoh: nagalivechat.shop): " DOMAIN
[[ -n "$DOMAIN" ]] || { c_err "Domain wajib diisi."; exit 1; }

read -rp "Port internal aplikasi [3000]: " APP_PORT
APP_PORT=${APP_PORT:-3000}

APP_DIR=${APP_DIR:-/www/wwwroot/$DOMAIN}
c_info "Aplikasi akan dipasang di: $APP_DIR"

# -------------------------------------------------------------- node.js ----
step "Node.js"

node_ok() {
    command -v node >/dev/null 2>&1 || return 1
    local major minor
    major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
    minor=$(node -p 'process.versions.node.split(".")[1]' 2>/dev/null || echo 0)
    [[ "$major" -gt 22 ]] && return 0
    [[ "$major" -eq 22 && "$minor" -ge 5 ]]
}

if node_ok; then
    c_ok "Node.js $(node -v) sudah memenuhi syarat"
else
    c_warn "Node.js belum ada atau di bawah v22.5 (dibutuhkan modul bawaan node:sqlite)"
    c_info "Memasang Node.js 22.x dari NodeSource…"
    if command -v apt-get >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
        apt-get install -y nodejs >/dev/null
    elif command -v yum >/dev/null 2>&1; then
        curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null
        yum install -y nodejs >/dev/null
    else
        c_err "Package manager tidak dikenali. Pasang Node.js 22 secara manual."
        exit 1
    fi
    node_ok || { c_err "Pemasangan Node.js gagal. Versi saat ini: $(node -v 2>/dev/null || echo 'tidak ada')"; exit 1; }
    c_ok "Node.js $(node -v) terpasang"
fi

if ! command -v pm2 >/dev/null 2>&1; then
    c_info "Memasang PM2…"
    npm install -g pm2 >/dev/null 2>&1
fi
c_ok "PM2 $(pm2 -v)"

# ----------------------------------------------------------------- kode ----
step "Mengambil kode aplikasi"

if [[ -d "$APP_DIR/.git" ]]; then
    c_info "Repo sudah ada — memperbarui ke versi terbaru…"
    git -C "$APP_DIR" remote set-url origin "$REPO_URL"
    git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
    git -C "$APP_DIR" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
else
    if [[ -d "$APP_DIR" ]] && [[ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]]; then
        c_warn "$APP_DIR sudah berisi berkas (biasanya halaman bawaan aaPanel)."
        read -rp "Kosongkan folder tersebut lalu clone repo? [y/N]: " WIPE
        [[ "${WIPE,,}" =~ ^y ]] || { c_err "Dibatalkan."; exit 1; }
        find "$APP_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    fi
    mkdir -p "$APP_DIR"
    git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
c_ok "Kode berada di $APP_DIR"

cd "$APP_DIR"
c_info "Memasang dependency…"
npm ci --omit=dev --silent
c_ok "Dependency terpasang"

mkdir -p data logs

# ------------------------------------------------------------------ env ----
step "Konfigurasi aplikasi"

if [[ -f "$APP_DIR/.env" ]]; then
    c_ok ".env sudah ada — dipertahankan (JWT_SECRET tidak diubah)"
    if ! grep -q '^PUBLIC_URL=https://'"$DOMAIN" "$APP_DIR/.env"; then
        c_warn "PUBLIC_URL di .env tidak cocok dengan domain $DOMAIN."
        c_warn "Periksa dengan: cat $APP_DIR/.env"
    fi
else
    cat > "$APP_DIR/.env" <<EOF
# Konfigurasi NagaLiveChat — jangan dibagikan, berisi kunci rahasia.
NODE_ENV=production
PORT=$APP_PORT
PUBLIC_URL=https://$DOMAIN
JWT_SECRET=$(openssl rand -hex 32)
DATABASE_FILE=$APP_DIR/data/nagalivechat.db
EOF
    c_ok ".env dibuat dengan JWT_SECRET acak"
fi
chmod 600 "$APP_DIR/.env"

# -------------------------------------------------------------- jalankan ---
step "Menjalankan aplikasi dengan PM2"

if pm2 jlist 2>/dev/null | grep -q "\"name\":\"$SERVICE\""; then
    pm2 restart "$SERVICE" --update-env >/dev/null
    c_ok "Proses '$SERVICE' di-restart"
else
    pm2 start ecosystem.config.cjs >/dev/null
    c_ok "Proses '$SERVICE' dijalankan"
fi

pm2 save >/dev/null 2>&1
pm2 startup 2>/dev/null | grep -E '^sudo ' | bash >/dev/null 2>&1 \
    && c_ok "PM2 diatur agar hidup lagi setelah server reboot" \
    || c_warn "Jalankan 'pm2 startup' manual agar aplikasi hidup lagi setelah reboot"

# ---------------------------------------------------------- health check ---
step "Memeriksa aplikasi"

HEALTHY=0
for i in $(seq 1 10); do
    sleep 2
    if curl -fsS --max-time 4 "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then
        HEALTHY=1
        break
    fi
    printf '  …menunggu (%s/10)\n' "$i"
done

if [[ "$HEALTHY" -eq 1 ]]; then
    c_ok "Aplikasi sehat di http://127.0.0.1:$APP_PORT"
else
    c_err "Aplikasi tidak merespons. Lihat penyebabnya:"
    echo
    pm2 logs "$SERVICE" --lines 30 --nostream 2>&1 | tail -30
    exit 1
fi

# ------------------------------------------------ siapkan config nginx -----
step "Konfigurasi reverse proxy"

PROXY_OUT="$APP_DIR/deploy/GENERATED-nginx-$DOMAIN.conf"
sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$APP_PORT/g" \
    "$APP_DIR/deploy/aapanel-proxy.conf" > "$PROXY_OUT"
c_ok "Config siap pakai dibuat di:"
echo "    $PROXY_OUT"

# ------------------------------------------------------------- selesai -----
step "Langkah terakhir (lewat panel aaPanel)"
cat <<EOF

  1. Website → klik $DOMAIN → Config File
     Ganti SELURUH isinya dengan berkas berikut, lalu Save:

         $PROXY_OUT

     Tampilkan isinya dengan:
         cat $PROXY_OUT

     PENTING: jangan gabungkan dengan template lama. Template bawaan aaPanel
     mengandung "location ~ .*\\.(js|css)?\$" yang membajak reverse proxy dan
     membuat seluruh CSS/JS serta /widget.js mengembalikan 404.

  2. Website → $DOMAIN → SSL → Let's Encrypt → Apply, lalu aktifkan Force HTTPS

  3. Buka https://$DOMAIN/signup dan buat akun pertama Anda

  Uji setelah langkah 1 & 2:
      curl -I https://$DOMAIN/widget.js            # harus 200
      curl -I https://$DOMAIN/assets/css/base.css  # harus 200

  Perintah harian:
      pm2 list
      pm2 logs $SERVICE
      pm2 restart $SERVICE

EOF
c_warn "Jangan jalankan 'npm run seed' di server ini — itu data demo dengan password publik."
echo
