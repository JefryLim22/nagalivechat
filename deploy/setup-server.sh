#!/usr/bin/env bash
#
# Setup awal NagaLiveChat di VPS Ubuntu/Debian.
# Jalankan SEKALI sebagai root pada server yang masih bersih:
#
#   curl -fsSL https://raw.githubusercontent.com/JefryLim22/nagalivechat/main/deploy/setup-server.sh | bash
#
# atau setelah repo di-clone:  sudo bash deploy/setup-server.sh
#
set -euo pipefail

APP_USER=naga
APP_DIR=/opt/nagalivechat
DATA_DIR=/var/lib/nagalivechat
ENV_FILE=/etc/nagalivechat/app.env
SERVICE=nagalivechat

c_ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
c_info() { printf '\033[0;34m›\033[0m %s\n' "$1"; }
c_warn() { printf '\033[0;33m!\033[0m %s\n' "$1"; }
c_err()  { printf '\033[0;31m✗\033[0m %s\n' "$1" >&2; }
step()   { printf '\n\033[1;35m━━ %s\033[0m\n' "$1"; }

[[ $EUID -eq 0 ]] || { c_err "Jalankan sebagai root:  sudo bash $0"; exit 1; }

# ---------------------------------------------------------------- input ----
step "Konfigurasi"
read -rp "Domain (contoh: nagalivechat.shop): " DOMAIN
[[ -n "$DOMAIN" ]] || { c_err "Domain wajib diisi."; exit 1; }

read -rp "Email untuk sertifikat SSL Let's Encrypt: " LE_EMAIL
[[ -n "$LE_EMAIL" ]] || { c_err "Email wajib diisi."; exit 1; }

read -rp "URL repo GitHub [git@github.com:JefryLim22/nagalivechat.git]: " REPO_URL
REPO_URL=${REPO_URL:-git@github.com:JefryLim22/nagalivechat.git}

read -rp "Branch yang di-deploy [main]: " BRANCH
BRANCH=${BRANCH:-main}

read -rp "Port internal aplikasi [3000]: " APP_PORT
APP_PORT=${APP_PORT:-3000}

# ------------------------------------------------------------- packages ----
step "Memasang paket sistem"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates git ufw nginx openssl >/dev/null
c_ok "curl, git, nginx, ufw terpasang"

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".").slice(0,2).map(Number).join("")' 2>/dev/null || echo 0)" -lt 225 ]]; then
    c_info "Memasang Node.js 22.x (dibutuhkan untuk modul bawaan node:sqlite)…"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
fi

NODE_VER=$(node -v)
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
NODE_MINOR=$(node -p 'process.versions.node.split(".")[1]')
if [[ "$NODE_MAJOR" -lt 22 || ( "$NODE_MAJOR" -eq 22 && "$NODE_MINOR" -lt 5 ) ]]; then
    c_err "Node.js $NODE_VER terlalu lama. Dibutuhkan minimal v22.5 untuk node:sqlite."
    exit 1
fi
c_ok "Node.js $NODE_VER"

# ----------------------------------------------------------------- user ----
step "Menyiapkan pengguna & direktori"
if ! id "$APP_USER" &>/dev/null; then
    adduser --system --group --shell /bin/bash --home "/home/$APP_USER" "$APP_USER" >/dev/null
    c_ok "Pengguna '$APP_USER' dibuat"
else
    c_ok "Pengguna '$APP_USER' sudah ada"
fi

mkdir -p "$APP_DIR" "$DATA_DIR" "/home/$APP_USER/.ssh" "$(dirname "$ENV_FILE")"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR" "/home/$APP_USER"
chmod 700 "/home/$APP_USER/.ssh"

# ----------------------------------------------------------- deploy key ----
step "Kunci akses ke GitHub"
KEY_PATH="/home/$APP_USER/.ssh/id_ed25519"
if [[ ! -f "$KEY_PATH" ]]; then
    sudo -u "$APP_USER" ssh-keygen -t ed25519 -N '' -C "nagalivechat-server" -f "$KEY_PATH" >/dev/null
    c_ok "Deploy key dibuat"
fi
sudo -u "$APP_USER" ssh-keyscan -t ed25519 github.com >> "/home/$APP_USER/.ssh/known_hosts" 2>/dev/null
sudo -u "$APP_USER" sort -u -o "/home/$APP_USER/.ssh/known_hosts" "/home/$APP_USER/.ssh/known_hosts"

echo
c_warn "Tambahkan kunci berikut sebagai DEPLOY KEY (read-only) di repo GitHub Anda:"
c_warn "https://github.com/JefryLim22/nagalivechat/settings/keys/new"
echo
echo "──────────────────────────────────────────────────────────────────"
cat "$KEY_PATH.pub"
echo "──────────────────────────────────────────────────────────────────"
echo
read -rp "Tekan Enter setelah deploy key ditambahkan di GitHub… " _

# ----------------------------------------------------------------- code ----
step "Mengambil kode aplikasi"
if [[ -d "$APP_DIR/.git" ]]; then
    sudo -u "$APP_USER" git -C "$APP_DIR" remote set-url origin "$REPO_URL"
    sudo -u "$APP_USER" git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
    sudo -u "$APP_USER" git -C "$APP_DIR" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
else
    sudo -u "$APP_USER" git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
c_ok "Kode berada di $APP_DIR"

sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm ci --omit=dev --silent"
c_ok "Dependency terpasang"

# ------------------------------------------------------------------ env ----
step "Menulis konfigurasi"
if [[ -f "$ENV_FILE" ]]; then
    c_ok "$ENV_FILE sudah ada — dipertahankan (JWT_SECRET tidak diubah)"
else
    JWT_SECRET=$(openssl rand -hex 32)
    cat > "$ENV_FILE" <<EOF
# Konfigurasi NagaLiveChat — dibaca systemd, di luar direktori repo.
NODE_ENV=production
PORT=$APP_PORT
PUBLIC_URL=https://$DOMAIN
JWT_SECRET=$JWT_SECRET
DATABASE_FILE=$DATA_DIR/nagalivechat.db
EOF
    c_ok "$ENV_FILE dibuat dengan JWT_SECRET acak"
fi
chown root:"$APP_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

# -------------------------------------------------------------- systemd ----
step "Memasang service systemd"
install -m 644 "$APP_DIR/deploy/nagalivechat.service" "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable --quiet "$SERVICE"
systemctl restart "$SERVICE"
sleep 2
if systemctl is-active --quiet "$SERVICE"; then
    c_ok "Service '$SERVICE' berjalan"
else
    c_err "Service gagal start. Lihat log:  journalctl -u $SERVICE -n 50 --no-pager"
    exit 1
fi

# -------------------------------------------------- izin restart deploy ----
cat > "/etc/sudoers.d/nagalivechat-deploy" <<EOF
# Izinkan pengguna aplikasi me-restart service-nya sendiri tanpa password,
# sehingga GitHub Actions tidak perlu akses root.
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart $SERVICE, /usr/bin/systemctl status $SERVICE, /usr/bin/systemctl is-active $SERVICE
EOF
chmod 440 "/etc/sudoers.d/nagalivechat-deploy"
visudo -cf /etc/sudoers.d/nagalivechat-deploy >/dev/null && c_ok "Izin restart untuk deploy dipasang"

# ---------------------------------------------------------------- nginx ----
step "Mengonfigurasi nginx"
sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$APP_PORT/g" \
    "$APP_DIR/deploy/nginx-nagalivechat.conf" > /etc/nginx/sites-available/nagalivechat

# Sebagian VPS mematikan IPv6; baris "listen [::]" akan membuat nginx gagal start.
if [[ ! -f /proc/net/if_inet6 ]]; then
    sed -i 's/^\(\s*\)listen \[::\]/\1# listen [::]/' /etc/nginx/sites-available/nagalivechat
    c_info "IPv6 tidak aktif di server ini — baris listen IPv6 dinonaktifkan"
fi

ln -sf /etc/nginx/sites-available/nagalivechat /etc/nginx/sites-enabled/nagalivechat
rm -f /etc/nginx/sites-enabled/default

if ! nginx -t 2>/tmp/nginx-test.log; then
    c_err "Konfigurasi nginx ditolak:"
    cat /tmp/nginx-test.log >&2
    exit 1
fi
systemctl reload nginx
c_ok "nginx meneruskan $DOMAIN ke 127.0.0.1:$APP_PORT"

# ------------------------------------------------------------- firewall ----
step "Firewall"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true
c_ok "ufw: SSH + HTTP/HTTPS diizinkan"

# ------------------------------------------------------------------ ssl ----
step "Sertifikat SSL"
c_info "Pastikan DNS A record $DOMAIN sudah mengarah ke IP server ini."
read -rp "Terbitkan sertifikat SSL sekarang? [Y/n]: " DO_SSL
if [[ ! "${DO_SSL,,}" =~ ^n ]]; then
    apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
    if certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
            --non-interactive --agree-tos -m "$LE_EMAIL" --redirect; then
        c_ok "HTTPS aktif dan perpanjangan otomatis terpasang"
    else
        c_warn "Certbot gagal — kemungkinan DNS belum mengarah ke server ini."
        c_warn "Setelah DNS benar, jalankan:  certbot --nginx -d $DOMAIN -d www.$DOMAIN --redirect"
    fi
fi

# --------------------------------------------------------------- selesai ---
step "Selesai"
echo
c_ok "Aplikasi   : https://$DOMAIN"
c_ok "Workspace  : https://$DOMAIN/app"
c_ok "Database   : $DATA_DIR/nagalivechat.db"
c_ok "Konfigurasi: $ENV_FILE"
echo
c_info "Buat akun pertama Anda di https://$DOMAIN/signup"
c_warn "Jangan jalankan 'npm run seed' di server ini — itu data demo dengan password publik."
echo
c_info "Perintah yang sering dipakai:"
echo "    systemctl status nagalivechat        # status"
echo "    journalctl -u nagalivechat -f        # log langsung"
echo "    sudo -u naga $APP_DIR/deploy/deploy.sh   # deploy manual"
echo
c_info "Untuk auto-deploy dari GitHub, tambahkan Secrets berikut di repo:"
echo "    Settings → Secrets and variables → Actions"
echo
echo "    SSH_HOST         = $(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo '<IP server ini>')"
echo "    SSH_USER         = $APP_USER"
echo "    SSH_KEY          = isi private key baru (lihat langkah di bawah)"
echo "    SSH_KNOWN_HOSTS  = $(ssh-keyscan -t ed25519 localhost 2>/dev/null | sed "s/localhost/$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo '<IP>')/" || echo '<jalankan ssh-keyscan dari komputer Anda>')"
echo
c_info "Membuat kunci khusus GitHub Actions (jalankan di komputer lokal Anda):"
echo "    ssh-keygen -t ed25519 -f ~/.ssh/naga_deploy -N ''"
echo "    ssh-copy-id -i ~/.ssh/naga_deploy.pub $APP_USER@<IP server>"
echo "    cat ~/.ssh/naga_deploy        # salin seluruh isinya ke secret SSH_KEY"
echo
