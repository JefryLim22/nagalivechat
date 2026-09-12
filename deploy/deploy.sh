#!/usr/bin/env bash
#
# Deploy versi terbaru NagaLiveChat.
# Dipanggil otomatis oleh GitHub Actions, atau manual:
#
#   sudo -u naga /opt/nagalivechat/deploy/deploy.sh          # VPS + systemd
#   APP_DIR=/www/wwwroot/nagalivechat.shop ./deploy/deploy.sh  # aaPanel + PM2
#
# Bila aplikasi gagal sehat setelah update, script otomatis kembali ke
# commit sebelumnya agar layanan tidak lama-lama mati.
#
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/nagalivechat}
SERVICE=${SERVICE:-nagalivechat}
BRANCH=${BRANCH:-main}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:3000/api/health}
HEALTH_RETRIES=${HEALTH_RETRIES:-12}

c_ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
c_info() { printf '\033[0;34m›\033[0m %s\n' "$1"; }
c_err()  { printf '\033[0;31m✗\033[0m %s\n' "$1" >&2; }

cd "$APP_DIR"

# Port sebenarnya dibaca dari konfigurasi agar health check tidak salah alamat.
# Urutan: .env di direktori proyek (pola aaPanel) lalu /etc (pola systemd).
for candidate in "$APP_DIR/.env" /etc/nagalivechat/app.env; do
    if [[ -r "$candidate" ]]; then
        APP_PORT=$(grep -E '^PORT=' "$candidate" | head -1 | cut -d= -f2 | tr -d ' "'"'"'')
        if [[ -n "${APP_PORT:-}" ]]; then
            HEALTH_URL="http://127.0.0.1:${APP_PORT}/api/health"
            break
        fi
    fi
done

# Cara restart menyesuaikan process manager yang dipakai server ini:
# PM2 (lazim di aaPanel) atau systemd (VPS polos). Bisa ditimpa lewat
# variabel RESTART_CMD bila setup Anda berbeda.
if [[ -z "${RESTART_CMD:-}" ]]; then
    if command -v pm2 >/dev/null 2>&1 && pm2 jlist 2>/dev/null | grep -q "\"name\":\"$SERVICE\""; then
        RESTART_CMD="pm2 restart $SERVICE --update-env"
    else
        RESTART_CMD="sudo /usr/bin/systemctl restart $SERVICE"
    fi
fi
c_info "Process manager: $RESTART_CMD"

PREVIOUS=$(git rev-parse HEAD)
c_info "Commit saat ini: ${PREVIOUS:0:8}"

# ------------------------------------------------------------ tarik kode ---
git fetch --quiet origin "$BRANCH"
TARGET=$(git rev-parse "origin/$BRANCH")

if [[ "$PREVIOUS" == "$TARGET" ]]; then
    c_ok "Sudah versi terbaru (${TARGET:0:8}) — tidak ada yang perlu di-deploy."
    exit 0
fi

c_info "Memperbarui ke ${TARGET:0:8}…"
# File yang diabaikan git (mis. data lokal) sengaja tidak disentuh.
git reset --hard --quiet "origin/$BRANCH"

# --------------------------------------------------------- dependency -----
if ! git diff --quiet "$PREVIOUS" "$TARGET" -- package-lock.json package.json; then
    c_info "package-lock.json berubah — memasang ulang dependency…"
    npm ci --omit=dev --silent
else
    c_info "Dependency tidak berubah — dilewati"
fi

# ------------------------------------------------------------- restart ----
c_info "Me-restart service…"
bash -c "$RESTART_CMD"

# -------------------------------------------------------- health check ----
c_info "Menunggu aplikasi sehat di $HEALTH_URL …"
for i in $(seq 1 "$HEALTH_RETRIES"); do
    sleep 2
    if curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1; then
        c_ok "Deploy berhasil — sekarang menjalankan ${TARGET:0:8}"
        git --no-pager log --oneline -1
        exit 0
    fi
    printf '  …percobaan %s/%s\n' "$i" "$HEALTH_RETRIES"
done

# ------------------------------------------------------------ rollback ----
c_err "Aplikasi tidak merespons setelah update. Mengembalikan ke ${PREVIOUS:0:8}…"
git reset --hard --quiet "$PREVIOUS"
npm ci --omit=dev --silent || true
bash -c "$RESTART_CMD"

sleep 4
if curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1; then
    c_err "Rollback berhasil — versi lama kembali berjalan. Deploy DIBATALKAN."
else
    c_err "Rollback pun gagal. Periksa: journalctl -u $SERVICE -n 80 --no-pager"
fi
exit 1
