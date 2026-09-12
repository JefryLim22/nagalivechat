# Deploy NagaLiveChat ke VPS (nagalivechat.shop)

Panduan ini membuat `nagalivechat.shop` berjalan di VPS Anda, lalu menyiapkan
**auto-deploy**: setiap kali Anda `git push`, server otomatis menarik kode
terbaru dan me-restart dirinya sendiri.

**Perkiraan waktu:** 15–20 menit untuk setup awal. Setelah itu, update cukup `git push`.

> 🎛️ **Server Anda memakai aaPanel / BT Panel?** Ikuti
> **[AAPANEL.md](AAPANEL.md)** — panduan ini untuk VPS polos, dan `setup-server.sh`
> akan bentrok dengan nginx bawaan aaPanel.

---

## Yang Anda butuhkan

| Kebutuhan | Keterangan |
|---|---|
| VPS | Ubuntu 22.04 / 24.04, RAM 1 GB sudah cukup untuk ribuan chat per hari |
| Akses root | Login SSH sebagai `root`, atau user dengan `sudo` |
| Domain | `nagalivechat.shop` sudah Anda miliki dan bisa diatur DNS-nya |

> Aplikasi ini butuh proses Node.js yang hidup terus-menerus, WebSocket, dan
> penyimpanan file. **Tidak bisa** dijalankan di Vercel, Netlify, atau shared
> hosting biasa tanpa dukungan Node.

---

## Langkah 1 — Siapkan branch `main`

Auto-deploy memantau branch `main`. Kode saat ini berada di branch
`claude/sweet-lovelace-fhey4v`, jadi jadikan dulu `main`:

```bash
git checkout claude/sweet-lovelace-fhey4v
git pull
git checkout -b main
git push -u origin main
```

Lalu di GitHub: **Settings → General → Default branch** → ubah menjadi `main`.

---

## Langkah 2 — Arahkan DNS ke VPS

Di panel domain Anda, buat dua record (ganti `123.45.67.89` dengan IP VPS):

| Type | Name | Value |
|---|---|---|
| A | `@` | `123.45.67.89` |
| A | `www` | `123.45.67.89` |

Tunggu sampai propagasi selesai — biasanya 5–30 menit. Cek dengan:

```bash
dig +short nagalivechat.shop
```

Kalau sudah menampilkan IP VPS Anda, lanjut.

> **Penting:** jangan jalankan langkah berikutnya sebelum DNS mengarah dengan
> benar, karena penerbitan sertifikat SSL akan gagal.

---

## Langkah 3 — Jalankan setup di VPS

SSH ke server sebagai root, lalu:

```bash
curl -fsSL https://raw.githubusercontent.com/JefryLim22/nagalivechat/main/deploy/setup-server.sh -o setup.sh
bash setup.sh
```

Script akan menanyakan domain, email untuk SSL, dan URL repo. Setelah itu ia
mengerjakan semuanya secara otomatis:

- memasang Node.js 22, nginx, dan certbot
- membuat pengguna sistem `naga` (aplikasi **tidak** berjalan sebagai root)
- meng-clone repo ke `/opt/nagalivechat`
- membuat `JWT_SECRET` acak dan menyimpannya di `/etc/nagalivechat/app.env`
- memasang service systemd yang otomatis hidup lagi bila server di-reboot
- mengonfigurasi nginx lengkap dengan dukungan WebSocket
- menerbitkan sertifikat SSL dan mengaktifkan perpanjangan otomatis
- menyalakan firewall

Di tengah proses, script menampilkan sebuah **deploy key** dan berhenti menunggu.
Salin kunci tersebut ke:

**GitHub → repo Anda → Settings → Deploy keys → Add deploy key**
(nama bebas, **jangan** centang "Allow write access")

Lalu tekan Enter di terminal untuk melanjutkan.

Setelah selesai, buka `https://nagalivechat.shop` — landing page Anda sudah hidup.

---

## Langkah 4 — Buat akun pertama

Buka **https://nagalivechat.shop/signup** dan daftarkan akun asli Anda.

> ⚠️ **Jangan jalankan `npm run seed` di server production.** Itu data demo
> dengan password yang tertulis di README publik. Aplikasi sudah menolaknya
> secara otomatis saat `NODE_ENV=production`, tapi lebih baik tidak dicoba.

Ambil snippet pemasangan di menu **Widget & Kode** — bentuknya akan seperti:

```html
<script src="https://nagalivechat.shop/widget.js"
        data-license="NAGA-XXXX-XXXX-XXXX" async></script>
```

---

## Langkah 5 — Aktifkan auto-deploy dari GitHub

Sekali diatur, Anda tidak perlu SSH lagi untuk update.

### 5a. Buat kunci khusus GitHub Actions

Di **komputer lokal** Anda (bukan di server):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/naga_deploy -N ''
ssh-copy-id -i ~/.ssh/naga_deploy.pub naga@IP_SERVER
```

Uji koneksinya:

```bash
ssh -i ~/.ssh/naga_deploy naga@IP_SERVER "echo berhasil"
```

### 5b. Ambil host key server

```bash
ssh-keyscan -t ed25519 IP_SERVER
```

Salin seluruh baris keluarannya.

### 5c. Isi Secrets di GitHub

**Settings → Secrets and variables → Actions → New repository secret**

| Nama secret | Isi |
|---|---|
| `SSH_HOST` | IP VPS Anda, contoh `123.45.67.89` |
| `SSH_USER` | `naga` |
| `SSH_KEY` | Seluruh isi `~/.ssh/naga_deploy` (termasuk baris `BEGIN`/`END`) |
| `SSH_KNOWN_HOSTS` | Keluaran `ssh-keyscan` dari langkah 5b |
| `SSH_PORT` | *(opsional)* isi hanya bila port SSH bukan 22 |

Selesai.

---

## Cara update setelah ini

```bash
git add .
git commit -m "perbaikan tampilan widget"
git push
```

Itu saja. GitHub Actions akan:

1. memeriksa sintaks seluruh berkas JavaScript
2. SSH ke server dan menjalankan `deploy.sh`
3. menarik kode, memasang dependency **hanya bila `package-lock.json` berubah**
4. me-restart aplikasi
5. memastikan aplikasi sehat — **bila gagal, otomatis kembali ke versi sebelumnya**
6. memverifikasi situs dapat diakses dari internet

Pantau prosesnya di tab **Actions** pada repo GitHub Anda.

### Deploy manual (bila perlu)

```bash
ssh naga@IP_SERVER
/opt/nagalivechat/deploy/deploy.sh
```

---

## Perintah harian di server

```bash
systemctl status nagalivechat        # apakah aplikasi hidup?
journalctl -u nagalivechat -f        # lihat log secara langsung
journalctl -u nagalivechat -n 100    # 100 baris log terakhir
systemctl restart nagalivechat       # restart manual
nginx -t && systemctl reload nginx   # uji lalu muat ulang nginx
```

---

## Backup database

Seluruh data ada dalam satu berkas: `/var/lib/nagalivechat/nagalivechat.db`.

Backup harian otomatis pukul 02:00, disimpan 14 hari terakhir:

```bash
sudo tee /etc/cron.daily/backup-nagalivechat >/dev/null <<'EOF'
#!/bin/sh
mkdir -p /var/backups/nagalivechat
# .backup aman dijalankan selagi aplikasi berjalan (tidak seperti menyalin file mentah).
sqlite3 /var/lib/nagalivechat/nagalivechat.db \
    ".backup '/var/backups/nagalivechat/naga-$(date +\%F).db'"
find /var/backups/nagalivechat -name '*.db' -mtime +14 -delete
EOF
sudo chmod +x /etc/cron.daily/backup-nagalivechat
sudo apt-get install -y sqlite3
```

Menyalin backup ke komputer Anda:

```bash
scp naga@IP_SERVER:/var/backups/nagalivechat/naga-*.db ./
```

---

## Bila ada masalah

| Gejala | Penyebab & solusi |
|---|---|
| Situs tidak bisa dibuka | `systemctl status nagalivechat` — bila mati, lihat `journalctl -u nagalivechat -n 50` |
| `502 Bad Gateway` | Aplikasi mati atau port tidak cocok. Bandingkan `PORT` di `/etc/nagalivechat/app.env` dengan `proxy_pass` di `/etc/nginx/sites-available/nagalivechat` |
| Chat tidak realtime, harus refresh | WebSocket terblokir. Pastikan `nginx -t` lolos dan blok `location /socket.io/` masih ada. Cloudflare: aktifkan **Network → WebSockets** |
| SSL gagal terbit | DNS belum mengarah ke server. Perbaiki DNS lalu `certbot --nginx -d nagalivechat.shop -d www.nagalivechat.shop --redirect` |
| Login berhasil tapi langsung kembali ke halaman masuk | Anda membuka lewat `http://`. Cookie sesi berflag `Secure` di mode production, jadi browser menolak mengirimnya lewat HTTP. Selesaikan langkah SSL dan pastikan `PUBLIC_URL` memakai `https://` |
| Aplikasi menolak start, pesan `JWT_SECRET` | `JWT_SECRET` kosong/terlalu pendek di `/etc/nagalivechat/app.env`. Isi dengan `openssl rand -hex 32` lalu `systemctl restart nagalivechat` |
| GitHub Actions gagal di langkah SSH | Secret `SSH_KEY` tidak lengkap (harus termasuk baris `BEGIN`/`END`), atau `SSH_KNOWN_HOSTS` salah |
| Snippet widget masih memakai `localhost` | `PUBLIC_URL` di `/etc/nagalivechat/app.env` belum diisi domain asli. Perbaiki lalu restart |
| Deploy sukses tapi tampilan lama | Cache browser. Buka dengan Ctrl+Shift+R |

### Di balik Cloudflare

Bila domain memakai Cloudflare (awan oranye), aktifkan:

- **SSL/TLS → Overview → Full (strict)**
- **Network → WebSockets → On** ← tanpa ini chat realtime tidak jalan

---

## Struktur di server

```
/opt/nagalivechat/              kode aplikasi (dari GitHub, ditimpa tiap deploy)
/var/lib/nagalivechat/          database SQLite (TIDAK pernah disentuh deploy)
/etc/nagalivechat/app.env       konfigurasi & JWT_SECRET (di luar repo)
/etc/systemd/system/nagalivechat.service
/etc/nginx/sites-available/nagalivechat
/var/backups/nagalivechat/      backup harian
```

Database dan konfigurasi sengaja disimpan **di luar** direktori repo, sehingga
`git reset --hard` saat deploy tidak akan pernah menghapus data pelanggan Anda.
