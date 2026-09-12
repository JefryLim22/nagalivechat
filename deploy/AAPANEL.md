# Deploy NagaLiveChat di aaPanel

Panduan untuk VPS yang sudah memakai **aaPanel** (atau BT Panel). Domain, SSL,
dan reverse proxy diurus lewat panel; aplikasi Node dijalankan dengan **PM2**.

> ⚠️ **Jangan jalankan `deploy/setup-server.sh` di server aaPanel.** Script itu
> untuk VPS polos dan akan bentrok dengan nginx bawaan aaPanel. Ikuti panduan
> ini saja.

---

## Ringkasan

| Bagian | Lokasi |
|---|---|
| Kode aplikasi | `/www/wwwroot/nagalivechat.shop` |
| Konfigurasi | `.env` di dalam folder tersebut |
| Database | `/www/wwwroot/nagalivechat.shop/data/nagalivechat.db` |
| Proses | PM2, nama proses `nagalivechat` |
| Port internal | `3000` (tidak perlu dibuka ke publik) |
| Web server | nginx aaPanel, reverse proxy ke `127.0.0.1:3000` |

---

## Cara cepat (disarankan)

Setelah branch `main` siap (Langkah 1) dan website dibuat di panel (Langkah 2),
seluruh urusan terminal — Node.js, PM2, clone repo, `.env`, dan menjalankan
aplikasi — bisa diserahkan ke satu script:

```bash
curl -fsSL https://raw.githubusercontent.com/JefryLim22/nagalivechat/main/deploy/setup-aapanel.sh -o setup.sh
bash setup.sh
```

Script akan menanyakan domain dan port, lalu:

- memeriksa Node.js dan memasang v22 bila versinya kurang
- memasang PM2 bila belum ada
- meng-clone repo ke `/www/wwwroot/<domain>` (menawarkan mengosongkan folder
  bawaan aaPanel lebih dulu)
- membuat `.env` dengan `JWT_SECRET` acak — **tidak pernah menimpa** `.env`
  yang sudah ada, jadi aman dijalankan ulang
- menjalankan aplikasi dengan PM2 dan memeriksa kesehatannya
- menuliskan config nginx siap tempel ke
  `/www/wwwroot/<domain>/deploy/GENERATED-nginx-<domain>.conf`

Sisanya tinggal tiga hal lewat panel: **tempel config** (Langkah 7),
**aktifkan SSL** (Langkah 8), dan **buat akun** (Langkah 9).

Bila Anda lebih suka mengerjakannya sendiri langkah demi langkah, ikuti panduan
manual di bawah ini.

---

## Langkah 1 — Siapkan branch `main`

Di komputer lokal:

```bash
git checkout claude/sweet-lovelace-fhey4v && git pull
git checkout -b main && git push -u origin main
```

Lalu GitHub → **Settings → General → Default branch** → `main`.

---

## Langkah 2 — Buat website di aaPanel

1. **Website → Add site**
2. Domain: `nagalivechat.shop` (tambahkan juga `www.nagalivechat.shop`)
3. PHP version: **Pure static / tidak perlu PHP**
4. Database: **tidak perlu** — aplikasi ini memakai SQLite
5. Klik **Submit**

Pastikan DNS domain sudah mengarah ke IP VPS. Cek: `dig +short nagalivechat.shop`

---

## Langkah 3 — Pasang Node.js 22

NagaLiveChat butuh **Node.js ≥ 22.5** karena memakai modul bawaan `node:sqlite`.
Node 18 atau 20 **tidak akan jalan**.

Buka **aaPanel → Terminal** (atau SSH), lalu:

```bash
node -v
```

Bila kurang dari v22.5 atau belum ada:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node -v          # harus v22.x
npm install -g pm2
```

> Bila Anda memakai plugin **Node.js Version Manager** bawaan aaPanel,
> pastikan versi yang dipilih 22.5 ke atas. Kalau panel hanya menyediakan
> versi lama, pakai cara NodeSource di atas — itu yang paling aman.

---

## Langkah 4 — Ambil kode dari GitHub

Masih di Terminal:

```bash
cd /www/wwwroot
rm -rf nagalivechat.shop                 # folder kosong buatan aaPanel
git clone https://github.com/JefryLim22/nagalivechat.git nagalivechat.shop
cd nagalivechat.shop
npm ci --omit=dev
```

> **Repo privat?** Buat deploy key dulu:
> ```bash
> ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519
> cat ~/.ssh/id_ed25519.pub
> ```
> Tempel isinya ke GitHub → repo Anda → **Settings → Deploy keys → Add**
> (jangan centang write access), lalu clone memakai
> `git@github.com:JefryLim22/nagalivechat.git`.

---

## Langkah 5 — Buat berkas konfigurasi

```bash
cd /www/wwwroot/nagalivechat.shop

cat > .env <<EOF
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://nagalivechat.shop
JWT_SECRET=$(openssl rand -hex 32)
DATABASE_FILE=/www/wwwroot/nagalivechat.shop/data/nagalivechat.db
EOF

chmod 600 .env
mkdir -p data logs
```

Periksa hasilnya — `JWT_SECRET` harus berisi 64 karakter acak:

```bash
cat .env
```

> `PUBLIC_URL` dipakai untuk menyusun snippet `<script>` dan direct chat link.
> Bila salah, snippet yang muncul di dashboard akan menunjuk alamat yang keliru.

---

## Langkah 6 — Jalankan dengan PM2

```bash
cd /www/wwwroot/nagalivechat.shop
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # jalankan perintah yang ditampilkan agar hidup lagi setelah reboot
```

Pastikan sudah berjalan:

```bash
pm2 list
curl http://127.0.0.1:3000/api/health
```

Harus muncul `{"ok":true,...}`. Kalau tidak, lihat penyebabnya:

```bash
pm2 logs nagalivechat --lines 50
```

---

## Langkah 7 — Reverse proxy (bagian paling kritis)

Buka **Website → klik `nagalivechat.shop` → Config File**, lalu **ganti seluruh
isi blok `server { … }`** dengan isi berkas
[`deploy/aapanel-proxy.conf`](aapanel-proxy.conf) — ganti `__DOMAIN__` menjadi
`nagalivechat.shop` dan `__PORT__` menjadi `3000`. Klik **Save**.

### Kenapa tidak cukup pakai menu "Reverse Proxy" saja

Template situs bawaan aaPanel mengandung dua blok ini:

```nginx
location ~ .*\.(gif|jpg|jpeg|png|bmp|swf)$ { expires 30d; }
location ~ .*\.(js|css)?$                  { expires 12h; }
```

Di nginx, `location` regex (`~`) **selalu menang** atas `location /`. Akibatnya
seluruh berkas `.js` dan `.css` — termasuk `/widget.js` — dicari di folder situs
yang kosong dan mengembalikan **404**.

Gejalanya: halaman terbuka tapi **tampil polos tanpa gaya sama sekali**, dan
widget tidak muncul di website pelanggan. Ini jebakan paling sering pada aaPanel
dan sudah diuji ulang — dengan template bawaan, `/widget.js`, `/assets/css/base.css`,
dan seluruh berkas JS memang mengembalikan 404.

Konfigurasi yang saya sediakan sudah menghapus kedua blok tersebut dan memakai
`location ^~ /socket.io/` agar jalur WebSocket tidak bisa direbut aturan regex
mana pun.

Setelah Save, uji:

```bash
curl -I http://nagalivechat.shop/widget.js          # harus 200
curl -I http://nagalivechat.shop/assets/css/base.css # harus 200
```

---

## Langkah 8 — Aktifkan SSL

**Website → `nagalivechat.shop` → SSL → Let's Encrypt** → centang kedua domain →
**Apply**. Setelah terbit, aktifkan **Force HTTPS**.

aaPanel akan menambahkan blok SSL ke config situs tanpa menghapus pengaturan
proxy Anda. Periksa sekali lagi bahwa kedua blok regex `.js`/`.css` tidak
kembali muncul setelah panel menulis ulang config.

---

## Langkah 9 — Buat akun pertama

Buka **https://nagalivechat.shop/signup** dan daftarkan akun asli Anda.

> ⚠️ **Jangan jalankan `npm run seed` di server ini.** Itu data demo dengan
> password yang tertulis di README publik. Aplikasi sudah menolaknya otomatis
> saat `NODE_ENV=production`.

Ambil snippet di menu **Widget & Kode**:

```html
<script src="https://nagalivechat.shop/widget.js"
        data-license="NAGA-XXXX-XXXX-XXXX" async></script>
```

---

## Langkah 10 — Auto-deploy dari GitHub

Setelah ini, update cukup `git push`.

### 10a. Kunci SSH untuk GitHub Actions

Di **komputer lokal** Anda:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/naga_deploy -N ''
ssh-copy-id -i ~/.ssh/naga_deploy.pub root@IP_SERVER
ssh -i ~/.ssh/naga_deploy root@IP_SERVER "echo berhasil"
```

> Bila Anda memakai user selain `root` di aaPanel, ganti sesuai kebutuhan.
> Pastikan user itu punya izin tulis ke `/www/wwwroot/nagalivechat.shop`
> dan bisa menjalankan `pm2`.

### 10b. Isi Secrets di GitHub

**Settings → Secrets and variables → Actions**

| Secret | Isi |
|---|---|
| `SSH_HOST` | IP VPS Anda |
| `SSH_USER` | `root` (atau user yang Anda pakai) |
| `SSH_KEY` | Seluruh isi `~/.ssh/naga_deploy` |
| `SSH_KNOWN_HOSTS` | Keluaran `ssh-keyscan -t ed25519 IP_SERVER` |
| `SSH_PORT` | *(opsional)* bila port SSH bukan 22 |

Tambahkan juga satu **Variable** (tab sebelah Secrets):

| Variable | Isi |
|---|---|
| `APP_DIR` | `/www/wwwroot/nagalivechat.shop` |

### 10c. Selesai

```bash
git add . && git commit -m "perbaikan tampilan" && git push
```

GitHub Actions akan SSH ke server, menjalankan `deploy.sh`, yang otomatis
mendeteksi bahwa Anda memakai **PM2** lalu me-restart proses `nagalivechat`.
Bila aplikasi gagal sehat setelah update, script **kembali ke commit sebelumnya**
secara otomatis.

### Deploy manual

```bash
cd /www/wwwroot/nagalivechat.shop
./deploy/deploy.sh
```

---

## Perintah harian

```bash
pm2 list                          # status aplikasi
pm2 logs nagalivechat             # log langsung
pm2 logs nagalivechat --lines 100 # 100 baris terakhir
pm2 restart nagalivechat          # restart
pm2 monit                         # pemakaian CPU & memori
```

---

## Backup database

Seluruh data ada dalam satu berkas. Di aaPanel:
**Cron → Add task → Shell Script**, jadwal harian:

```sh
mkdir -p /www/backup/nagalivechat
sqlite3 /www/wwwroot/nagalivechat.shop/data/nagalivechat.db \
  ".backup '/www/backup/nagalivechat/naga-$(date +\%F).db'"
find /www/backup/nagalivechat -name '*.db' -mtime +14 -delete
```

Perintah `.backup` aman dijalankan selagi aplikasi berjalan — berbeda dengan
menyalin berkas `.db` mentah yang bisa menghasilkan salinan rusak.

---

## Bila ada masalah

| Gejala | Penyebab & solusi |
|---|---|
| **Halaman tampil polos tanpa gaya**, widget tidak muncul | Blok regex `.js`/`.css` bawaan aaPanel masih ada di config situs. Ikuti Langkah 7. Uji dengan `curl -I https://nagalivechat.shop/assets/css/base.css` — harus 200 |
| **Login berhasil tapi langsung kembali ke halaman masuk** | Anda mengakses lewat `http://`, bukan `https://`. Di mode production cookie sesi berflag `Secure` sehingga browser menolak mengirimnya lewat HTTP. Selesaikan Langkah 8 (SSL), pastikan `PUBLIC_URL` di `.env` memakai `https://`, lalu `pm2 restart nagalivechat --update-env`. Aplikasi juga mencetak peringatan ini saat start — cek `pm2 logs nagalivechat` |
| `502 Bad Gateway` | Aplikasi mati. `pm2 list` lalu `pm2 logs nagalivechat --lines 50` |
| Aplikasi gagal start, error `node:sqlite` | Node.js di bawah v22.5. Jalankan `node -v` dan pasang Node 22 (Langkah 3) |
| Gagal start, pesan soal `JWT_SECRET` | `.env` belum ada atau `JWT_SECRET` kosong/pendek. Ulangi Langkah 5, lalu `pm2 restart nagalivechat --update-env` |
| Chat tidak realtime, harus refresh | Blok `location ^~ /socket.io/` hilang dari config. Uji: `curl -I "https://nagalivechat.shop/socket.io/?EIO=4&transport=polling"` harus 200 |
| Snippet widget memakai `localhost` | `PUBLIC_URL` di `.env` salah. Perbaiki lalu `pm2 restart nagalivechat --update-env` |
| Setelah aaPanel menulis ulang config, situs rusak lagi | Panel mengembalikan template bawaan. Tempel ulang config dari Langkah 7 |
| Deploy sukses tapi tampilan lama | Cache browser — buka dengan Ctrl+Shift+R |
| Data hilang setelah deploy | `DATABASE_FILE` menunjuk ke dalam folder yang ditimpa `git reset`. Pindahkan ke luar, mis. `/www/backup/nagalivechat/naga.db`, lalu restart |

### Di balik Cloudflare

Bila domain memakai Cloudflare (awan oranye), aktifkan:

- **SSL/TLS → Overview → Full (strict)**
- **Network → WebSockets → On** ← tanpa ini chat realtime tidak akan jalan

### Keamanan

- **Jangan** buka port 3000 di firewall aaPanel. Cukup 80 dan 443 — aplikasi
  hanya perlu diakses nginx dari `127.0.0.1`.
- Berkas `.env` berisi `JWT_SECRET`. Config yang saya sediakan sudah memblokir
  akses ke `.env`, `.git`, `node_modules`, dan `data` lewat HTTP.

---

## Catatan tentang database dan deploy

`deploy.sh` menjalankan `git reset --hard`, yang **tidak menyentuh berkas yang
diabaikan git**. Folder `data/` ada di `.gitignore`, jadi database Anda aman
saat update.

Namun bila Anda ingin benar-benar terpisah dari folder kode, ubah `.env`:

```bash
DATABASE_FILE=/www/backup/nagalivechat/naga.db
```

lalu pindahkan berkasnya dan `pm2 restart nagalivechat --update-env`.
