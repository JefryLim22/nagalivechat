<h1 align="center">🐉 NagaLiveChat</h1>

<p align="center">
  Platform <strong>live chat &amp; customer messaging</strong> multi-tenant.<br>
  Pasang satu baris script di website mana pun, atau bagikan <em>direct chat link</em> —
  semua chat masuk ke satu agent workspace realtime.
</p>

---

## Daftar Isi

- [Fitur](#fitur)
- [Cara kerja](#cara-kerja)
- [Menjalankan secara lokal](#menjalankan-secara-lokal)
- [Akun demo](#akun-demo)
- [Cara memasang widget](#cara-memasang-widget)
- [API JavaScript widget](#api-javascript-widget)
- [Struktur proyek](#struktur-proyek)
- [Referensi REST API](#referensi-rest-api)
- [Event realtime](#event-realtime)
- [Catatan keamanan](#catatan-keamanan)
- [Deployment](#deployment)

---

## Fitur

**Untuk pengunjung website**

- Widget mengambang yang dapat dikustomisasi penuh (warna, posisi, avatar, sapaan, sudut)
- Isolasi total lewat **Shadow DOM + iframe** — CSS website pemilik tidak pernah bentrok
- Form pre-chat (nama & email) yang bisa diaktifkan/dimatikan
- Sapaan proaktif otomatis setelah beberapa detik
- Balasan cepat siap-klik, emoji picker, indikator mengetik
- Mode offline dengan formulir pesan saat tidak ada agent
- Rating percakapan (👍/👎) dan unduh transkrip sendiri
- **Direct chat link** + QR code — tidak perlu punya website sama sekali
- Responsif: fullscreen otomatis di layar ponsel

**Untuk tim support**

- Inbox realtime: antrean, chat aktif, milik saya, selesai
- Thread dua arah dengan indikator mengetik dan status online pengunjung
- Panel konteks pengunjung: halaman yang dibuka, referrer, browser, OS, perangkat, zona waktu, jumlah kunjungan
- Balasan cepat via `#shortcut` + navigasi keyboard
- Penugasan agent, tag, catatan internal, tutup/buka percakapan
- Laporan: volume harian, waktu respons pertama, jam tersibuk, skor kepuasan, performa per agent
- Manajemen tim (owner / admin / agent) dan status kehadiran (online / away / offline)
- Multi-project: satu workspace bisa menangani banyak website, masing-masing dengan license key sendiri

---

## Cara kerja

```
                 ┌──────────────────────────┐
  Website        │  <script src="widget.js" │
  pelanggan ───► │   data-license="NAGA-…"> │
                 └───────────┬──────────────┘
                             │ Shadow DOM + iframe terisolasi
                             ▼
   ┌───────────────────────────────────────────────┐
   │  Node.js + Express + Socket.IO                │
   │  ├─ REST  /api/public/*   (pengunjung)        │
   │  ├─ REST  /api/*          (agent, cookie JWT) │
   │  └─ WS    /socket.io      (dua arah)          │
   └──────────────────┬────────────────────────────┘
                      │ SQLite (node:sqlite bawaan)
                      ▼
             ┌────────────────────┐
             │  Agent workspace   │  /app
             └────────────────────┘
```

| Lapisan | Teknologi | Alasan |
|---|---|---|
| Server | Node.js 22 + Express 5 | Ringan, tanpa build step |
| Realtime | Socket.IO | Fallback polling otomatis bila WebSocket diblokir |
| Database | `node:sqlite` (bawaan Node) | Tanpa kompilasi native, tanpa server DB terpisah |
| Frontend | Vanilla ES modules + CSS custom | Nol build tooling — `npm start` langsung jalan |
| Widget | Vanilla JS, ±6 KB gzip | Tanpa dependency, dimuat asinkron |

---

## Menjalankan secara lokal

Prasyarat: **Node.js ≥ 22.5** (dibutuhkan untuk modul `node:sqlite`).

```bash
git clone https://github.com/JefryLim22/nagalivechat.git
cd nagalivechat

npm install
cp .env.example .env      # sesuaikan PORT, PUBLIC_URL, dan JWT_SECRET
npm run seed              # isi data demo (opsional tapi disarankan)
npm start
```

Buka:

| URL | Isi |
|---|---|
| `http://localhost:3000` | Landing page |
| `http://localhost:3000/demo` | Simulasi website pelanggan dengan widget terpasang |
| `http://localhost:3000/app` | Agent workspace |
| `http://localhost:3000/chat/NAGA-DEMO-LIVE-CHAT` | Direct chat link |

Perintah lain:

```bash
npm run dev     # mode watch, auto-restart saat file berubah
npm run reset   # hapus seluruh data lalu isi ulang data demo
```

---

## Akun demo

Setelah `npm run seed`:

| Email | Password | Peran |
|---|---|---|
| `demo@nagalivechat.com` | `demo12345` | Owner |
| `sinta@nagalivechat.com` | `demo12345` | Agent |
| `reza@nagalivechat.com` | `demo12345` | Agent |

License demo: `NAGA-DEMO-LIVE-CHAT`

> **Coba alur lengkapnya:** buka `/demo` di satu tab dan kirim pesan lewat widget,
> lalu buka `/app` di tab lain dan balas — pesan muncul di kedua sisi secara instan.

---

## Cara memasang widget

Ambil license key di menu **Widget & Kode** pada workspace, lalu pilih salah satu cara berikut.

**1. Script HTML (universal)** — tempel sebelum `</body>`:

```html
<script src="https://domain-anda.com/widget.js"
        data-license="NAGA-XXXX-XXXX-XXXX" async></script>
```

Berlaku untuk HTML statis, WordPress, Shopify, Laravel, Webflow, dan lainnya.

**2. Direct chat link** — bagikan di bio Instagram, QR code, atau tanda tangan email:

```
https://domain-anda.com/chat/NAGA-XXXX-XXXX-XXXX
```

**3. React / Next.js** — letakkan di komponen root agar hanya dimuat sekali:

```jsx
useEffect(() => {
  const s = document.createElement('script');
  s.src = 'https://domain-anda.com/widget.js';
  s.dataset.license = 'NAGA-XXXX-XXXX-XXXX';
  s.async = true;
  document.body.appendChild(s);
  return () => s.remove();
}, []);
```

**4. iFrame tertanam** — bila chat ingin menyatu di dalam halaman, bukan tombol mengambang:

```html
<iframe src="https://domain-anda.com/chat/NAGA-XXXX-XXXX-XXXX?embed=1"
        style="border:0;width:100%;height:640px"></iframe>
```

---

## API JavaScript widget

Loader mendaftarkan objek global `NagaChat`:

```js
NagaChat.open();                 // buka panel chat
NagaChat.close();                // tutup panel
NagaChat.toggle();               // buka/tutup
NagaChat.isOpen();               // → boolean

// Kirim identitas pengunjung yang sudah login di website Anda
NagaChat.identify({ name: 'Budi Santoso', email: 'budi@perusahaan.com' });

// Event
NagaChat.on('open',    () => console.log('chat dibuka'));
NagaChat.on('close',   () => console.log('chat ditutup'));
NagaChat.on('message', (msg) => console.log('pesan baru', msg));

NagaChat.destroy();              // lepas widget dari halaman
```

Pemanggilan sebelum widget selesai dimuat akan diantrekan dan dijalankan otomatis.
Pola antrean klasik juga didukung:

```js
window.NagaChat = window.NagaChat || [];
window.NagaChat.push(['open']);
```

---

## Struktur proyek

```
nagalivechat/
├── server/
│   ├── index.js                 # entry point: Express + Socket.IO
│   ├── config.js                # loader .env & konfigurasi
│   ├── db/
│   │   ├── schema.sql           # skema SQLite
│   │   ├── index.js             # koneksi & helper query
│   │   └── seed.js              # data demo
│   ├── lib/
│   │   ├── auth.js              # JWT, bcrypt, middleware sesi
│   │   ├── store.js             # akses data & logika percakapan
│   │   ├── widget-settings.js   # default + sanitasi konfigurasi widget
│   │   ├── useragent.js         # parser user-agent minimalis
│   │   ├── ratelimit.js         # rate limiter endpoint publik
│   │   ├── ids.js               # generator ID & license key
│   │   └── validate.js          # utilitas validasi
│   ├── routes/                  # auth, projects, conversations, team,
│   │   └── …                    # canned, reports, public
│   └── realtime/index.js        # handler Socket.IO (agent & pengunjung)
│
└── public/
    ├── index.html               # landing page
    ├── login.html · signup.html # autentikasi
    ├── app.html                 # agent workspace (SPA)
    ├── chat.html                # direct chat link
    ├── widget-frame.html        # UI chat di dalam iframe widget
    ├── demo.html                # simulasi website pelanggan
    ├── widget.js                # ★ loader yang dipasang pelanggan
    └── assets/
        ├── css/                 # base (design system), landing, auth,
        │                        # dashboard, chat
        └── js/
            ├── ui.js            # helper bersama
            ├── chat-app.js      # mesin chat pengunjung
            └── app/             # store, router, dan view dashboard
```

---

## Referensi REST API

### Autentikasi agent — cookie `httpOnly`

| Method | Endpoint | Keterangan |
|---|---|---|
| `POST` | `/api/auth/signup` | Daftar akun + project pertama |
| `POST` | `/api/auth/login` | Masuk |
| `POST` | `/api/auth/logout` | Keluar |
| `GET` | `/api/auth/me` | Profil, workspace, daftar project |
| `PATCH` | `/api/auth/me` | Ubah nama, jabatan, warna avatar |

### Project & widget

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/projects` | Daftar project + snippet pemasangan |
| `POST` | `/api/projects` | Buat project (license key otomatis) |
| `PATCH` | `/api/projects/:id` | Ubah nama, domain, konfigurasi widget |
| `POST` | `/api/projects/:id/regenerate-key` | Buat ulang license key |
| `GET` | `/api/projects/:id/qr.svg` | QR code direct chat link |
| `DELETE` | `/api/projects/:id` | Hapus project |

### Percakapan

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/conversations` | Filter: `status`, `projectId`, `mine`, `q` |
| `GET` | `/api/conversations/:id` | Detail + pesan + catatan |
| `POST` | `/api/conversations/:id/messages` | Kirim balasan (fallback non-WebSocket) |
| `PATCH` | `/api/conversations/:id` | Status, penugasan, tag, subjek |
| `POST` | `/api/conversations/:id/notes` | Catatan internal |
| `GET` | `/api/conversations/:id/transcript` | Unduh transkrip `.txt` |

### Tim, balasan cepat, laporan

| Method | Endpoint |
|---|---|
| `GET` `POST` `PATCH` `DELETE` | `/api/team` · `/api/team/:id` |
| `GET` `POST` `PATCH` `DELETE` | `/api/canned` · `/api/canned/:id` |
| `GET` | `/api/reports/summary?range=24h\|7d\|30d\|90d` |

### Publik (pengunjung) — header `X-Visitor-Token`

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/public/config?license=` | Konfigurasi widget + status tim |
| `POST` | `/api/public/session` | Mulai/lanjutkan sesi, mengembalikan token |
| `GET` `POST` | `/api/public/messages` | Riwayat & kirim pesan |
| `POST` | `/api/public/profile` | Simpan data form pre-chat |
| `POST` | `/api/public/rate` | Rating percakapan |
| `POST` | `/api/public/close` | Akhiri percakapan |
| `POST` | `/api/public/offline-message` | Kirim pesan saat tim offline |
| `GET` | `/api/public/transcript` | Unduh transkrip |

---

## Event realtime

Agent terhubung memakai cookie sesi, pengunjung memakai token bertanda tangan.

| Arah | Event | Payload |
|---|---|---|
| → server | `message:send` | `{ conversationId, body }` |
| → server | `typing` | `{ conversationId, typing }` |
| → server | `conversation:join` | `{ conversationId }` (agent) |
| → server | `agent:presence` | `{ presence }` (agent) |
| ← server | `message:new` | objek pesan |
| ← server | `conversation:new` · `conversation:update` | objek percakapan |
| ← server | `typing` | `{ conversationId, who, typing }` |
| ← server | `visitor:presence` | `{ conversationId, online }` |
| ← server | `team:presence` · `presence:team` | `{ online, agents }` |
| ← server | `conversation:closed` | `{ conversationId }` |

---

## Catatan keamanan

- Sesi agent memakai **JWT di cookie `httpOnly`** dengan `sameSite=lax`; `secure` aktif otomatis saat `NODE_ENV=production`.
- Sesi pengunjung memakai **token bertanda tangan** yang hanya memberi akses ke percakapannya sendiri — bukan ke seluruh percakapan project.
- Password di-hash memakai **bcrypt** (10 rounds).
- Seluruh endpoint publik dilindungi **rate limiting** in-memory.
- Setiap query percakapan, project, dan tim selalu difilter berdasarkan `account_id` milik pemanggil.
- Berkas `.html` hanya dapat diakses lewat route halaman, sehingga pengecekan sesi tidak bisa dilewati dengan menebak nama file.
- Widget berjalan di dalam **iframe**, sehingga skrip pihak ketiga di website pelanggan tidak dapat membaca isi percakapan langsung dari DOM.

> **Sebelum production:** ganti `JWT_SECRET` dengan string acak minimal 32 karakter, set `NODE_ENV=production`, dan layani aplikasi lewat HTTPS.

---

## Deployment

1. Set variabel lingkungan:

   ```bash
   PORT=3000
   PUBLIC_URL=https://chat.domain-anda.com   # dipakai untuk generate snippet & direct link
   JWT_SECRET=<string-acak-panjang>
   DATABASE_FILE=/var/lib/nagalivechat/naga.db
   NODE_ENV=production
   ```

2. Jalankan di belakang reverse proxy (Nginx/Caddy) dengan **WebSocket upgrade diaktifkan**:

   ```nginx
   location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

3. Pastikan direktori database dapat ditulis, lalu cadangkan berkas `.db` secara berkala.

4. Untuk menskalakan ke banyak instance, tambahkan adapter Redis untuk Socket.IO dan pindahkan database ke PostgreSQL/MySQL — lapisan akses data terpusat di `server/lib/store.js`.

---

## Lisensi

MIT
