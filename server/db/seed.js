/**
 * Seed data demo NagaLiveChat.
 *   npm run seed     -> tambah data demo bila belum ada
 *   npm run reset    -> hapus seluruh data lalu isi ulang
 */
import bcrypt from 'bcryptjs';
import { all, db, get, run } from './index.js';
import { licenseKey, prefixedId } from '../lib/ids.js';
import { DEFAULT_WIDGET_SETTINGS } from '../lib/widget-settings.js';

const DEMO_LICENSE = 'NAGA-DEMO-LIVE-CHAT';
const reset = process.argv.includes('--reset');

/* Data demo memakai password yang dipublikasikan di README, jadi tidak boleh
   masuk ke server production tanpa disengaja. */
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error(
    '\n[naga] Dibatalkan: seed berisi akun demo dengan password publik dan\n' +
    '        NODE_ENV=production sedang aktif.\n\n' +
    '        Buat akun asli lewat halaman /signup.\n' +
    '        Bila Anda benar-benar ingin data demo, tambahkan --force.\n',
  );
  process.exit(1);
}

const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

if (reset) {
  for (const table of ['conversation_tags', 'notes', 'messages', 'conversations', 'visitors',
    'offline_messages', 'canned_responses', 'projects', 'users', 'accounts']) {
    run(`DELETE FROM ${table}`);
  }
  console.log('· Seluruh data lama dihapus.');
}

if (get('SELECT 1 AS ok FROM accounts LIMIT 1') && !reset) {
  console.log('· Database sudah berisi data. Jalankan "npm run reset" untuk mengisi ulang.');
  process.exit(0);
}

const accountId = prefixedId('acc');
const now = new Date().toISOString();
run('INSERT INTO accounts (id, name, plan, created_at) VALUES (?,?,?,?)', accountId, 'Naga Store', 'growth', now);

const password = bcrypt.hashSync('demo12345', 10);
const team = [
  ['Andi Pratama', 'demo@nagalivechat.com', 'owner', 'Head of Support', '#6D5EF8'],
  ['Sinta Maharani', 'sinta@nagalivechat.com', 'agent', 'Customer Care', '#FF7A45'],
  ['Reza Fadillah', 'reza@nagalivechat.com', 'agent', 'Technical Support', '#12B886'],
];
const userIds = team.map(([name, email, role, title, color]) => {
  const id = prefixedId('usr');
  run(`INSERT INTO users (id, account_id, email, password_hash, name, title, role, avatar_color, presence, created_at)
       VALUES (?,?,?,?,?,?,?,?,'offline',?)`,
    id, accountId, email, password, name, title, role, color, now);
  return id;
});

const projectId = prefixedId('prj');
run('INSERT INTO projects (id, account_id, name, license_key, domain, settings, created_at) VALUES (?,?,?,?,?,?,?)',
  projectId, accountId, 'Naga Store', DEMO_LICENSE, 'nagastore.id',
  JSON.stringify({
    ...DEFAULT_WIDGET_SETTINGS,
    companyName: 'Naga Store',
    tagline: 'Biasanya membalas dalam 2 menit',
    welcomeMessage: 'Halo 👋 Selamat datang di Naga Store! Ada yang bisa kami bantu?',
    launcherLabel: 'Butuh bantuan?',
    proactiveMessage: 'Halo! Ada promo gratis ongkir hari ini 🎉 Mau saya bantu cek?',
    proactiveDelay: 10,
  }), now);

// Project kedua untuk menunjukkan multi-website.
run('INSERT INTO projects (id, account_id, name, license_key, domain, settings, created_at) VALUES (?,?,?,?,?,?,?)',
  prefixedId('prj'), accountId, 'Naga Academy', licenseKey(), 'academy.nagastore.id',
  JSON.stringify({ ...DEFAULT_WIDGET_SETTINGS, companyName: 'Naga Academy', themeColor: '#12B886', avatarEmoji: '🎓' }), now);

const canned = [
  ['#halo', 'Sapaan pembuka', 'Halo! Terima kasih sudah menghubungi Naga Store. Ada yang bisa saya bantu? 😊'],
  ['#ongkir', 'Info ongkir', 'Untuk cek ongkir, boleh dibantu info kota tujuan dan berat paketnya ya kak?'],
  ['#tunggu', 'Minta waktu', 'Mohon tunggu sebentar ya kak, saya cek dulu datanya 🙏'],
  ['#resi', 'Nomor resi', 'Nomor resi pesanan kakak sudah kami kirim ke email terdaftar. Silakan dicek ya 📦'],
  ['#tutup', 'Penutup', 'Terima kasih sudah menghubungi Naga Store. Semoga harinya menyenangkan! 😊'],
];
for (const [shortcut, title, body] of canned) {
  run('INSERT INTO canned_responses (id, account_id, shortcut, title, body, created_at) VALUES (?,?,?,?,?,?)',
    prefixedId('cnd'), accountId, shortcut, title, body, now);
}

/* ---------------------- Percakapan contoh ---------------------- */
const scenarios = [
  {
    name: 'Siti Rahma', email: 'siti.rahma@gmail.com', browser: 'Chrome 131', os: 'Android', device: 'Mobile',
    url: 'https://nagastore.id/produk/naga-pro', title: 'Naga Pro — Naga Store', status: 'queued', minutes: 4,
    agent: null, tags: ['produk', 'pre-sales'],
    thread: [
      ['visitor', 'Halo kak, produk Naga Pro ready stock?', 4],
      ['visitor', 'Rencana mau order 2 pcs hari ini', 3.4],
    ],
  },
  {
    name: 'Budi Wijaya', email: 'budi.w@perusahaan.co.id', browser: 'Chrome 131', os: 'Windows 10/11', device: 'Desktop',
    url: 'https://nagastore.id/checkout', title: 'Checkout — Naga Store', status: 'open', minutes: 22,
    agent: 1, tags: ['pembayaran'],
    thread: [
      ['visitor', 'Saya sudah transfer tapi statusnya masih pending', 22],
      ['agent', 'Halo Pak Budi! Mohon tunggu sebentar ya, saya cek dulu datanya 🙏', 21],
      ['agent', 'Sudah saya cek, pembayarannya masuk pukul 10.24. Statusnya akan otomatis update maksimal 15 menit.', 19],
      ['visitor', 'Oh siap, terima kasih infonya 🙏', 18],
    ],
  },
  {
    name: '', email: '', browser: 'Safari 18', os: 'iOS', device: 'Mobile',
    url: 'https://nagastore.id/kebijakan-refund', title: 'Kebijakan Refund', status: 'open', minutes: 48,
    agent: 2, tags: ['refund'],
    thread: [
      ['visitor', 'Cara refund gimana ya?', 48],
      ['agent', 'Halo kak! Refund bisa diajukan maksimal 7 hari setelah barang diterima. Boleh saya bantu prosesnya?', 47],
      ['visitor', 'Boleh kak, nomor pesanan NS-99213', 45],
    ],
  },
  {
    name: 'Dewi Puspita', email: 'dewi.p@gmail.com', browser: 'Chrome 130', os: 'Windows 10/11', device: 'Desktop',
    url: 'https://nagastore.id/', title: 'Naga Store — Beranda', status: 'closed', minutes: 1500,
    agent: 1, rating: 1, tags: ['pengiriman'],
    thread: [
      ['visitor', 'Kak pesanan saya kapan dikirim?', 1500],
      ['agent', 'Halo Kak Dewi, pesanan sudah diserahkan ke kurir sore ini ya 📦', 1498],
      ['visitor', 'Wah cepat sekali, terima kasih!', 1496],
      ['agent', 'Sama-sama kak. Terima kasih sudah berbelanja di Naga Store 😊', 1495],
      ['system', 'Percakapan ditutup oleh Sinta Maharani.', 1490],
    ],
  },
  {
    name: 'Agus Salim', email: 'agus@umkmnusantara.id', browser: 'Firefox 133', os: 'Linux', device: 'Desktop',
    url: 'https://nagastore.id/reseller', title: 'Program Reseller', status: 'closed', minutes: 4300,
    agent: 2, rating: 1, tags: ['reseller'],
    thread: [
      ['visitor', 'Saya tertarik jadi reseller, syaratnya apa saja?', 4300],
      ['agent', 'Halo Pak Agus! Minimal order awal 10 pcs dan ada diskon khusus 25% untuk reseller.', 4298],
      ['visitor', 'Baik, saya akan pelajari dulu. Terima kasih!', 4295],
      ['system', 'Percakapan ditutup oleh Reza Fadillah.', 4290],
    ],
  },
];

for (const scenario of scenarios) {
  const visitorId = prefixedId('vis');
  run(`INSERT INTO visitors (id, project_id, uid, name, email, ip, user_agent, browser, os, device,
         locale, timezone, referrer, current_url, page_title, visits, first_seen_at, last_seen_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    visitorId, projectId, prefixedId('uid'), scenario.name, scenario.email, '103.28.14.' + (10 + scenarios.indexOf(scenario)),
    'Mozilla/5.0', scenario.browser, scenario.os, scenario.device, 'id-ID', 'Asia/Jakarta',
    'https://www.google.com/', scenario.url, scenario.title,
    1 + scenarios.indexOf(scenario), iso(scenario.minutes + 20), iso(scenario.minutes - 1));

  const conversationId = prefixedId('cnv');
  const firstAgentReply = scenario.thread.find((m) => m[0] === 'agent');
  run(`INSERT INTO conversations (id, project_id, account_id, visitor_id, assigned_to, status, source,
         rating, unread_agent, first_reply_at, last_message_at, started_at, closed_at)
       VALUES (?,?,?,?,?,?,'widget',?,?,?,?,?,?)`,
    conversationId, projectId, accountId, visitorId,
    scenario.agent === null ? null : userIds[scenario.agent],
    scenario.status, scenario.rating ?? null,
    scenario.status === 'queued' ? scenario.thread.filter((m) => m[0] === 'visitor').length : 0,
    firstAgentReply ? iso(firstAgentReply[2]) : null,
    iso(scenario.thread[scenario.thread.length - 1][2]),
    iso(scenario.minutes),
    scenario.status === 'closed' ? iso(scenario.minutes - 10) : null);

  for (const [senderType, body, minutesAgo] of scenario.thread) {
    const agent = scenario.agent === null ? null : team[scenario.agent];
    run(`INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, sender_color, body, kind, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      prefixedId('msg'), conversationId, senderType,
      senderType === 'agent' ? userIds[scenario.agent] : (senderType === 'visitor' ? visitorId : null),
      senderType === 'agent' ? agent[0] : (senderType === 'visitor' ? (scenario.name || 'Pengunjung') : 'Sistem'),
      senderType === 'agent' ? agent[4] : '#6D5EF8',
      body, senderType === 'system' ? 'system' : 'text', iso(minutesAgo));
  }

  for (const tag of scenario.tags || []) {
    run('INSERT OR IGNORE INTO conversation_tags (conversation_id, tag) VALUES (?,?)', conversationId, tag);
  }
}

run('INSERT INTO notes (id, conversation_id, user_id, author_name, body, created_at) VALUES (?,?,?,?,?,?)',
  prefixedId('not'), all('SELECT id FROM conversations ORDER BY started_at DESC')[1].id, userIds[1],
  team[1][0], 'Pelanggan prioritas — sudah 3x order bulan ini. Berikan penanganan cepat.', now);

console.log(`
  ✅ Data demo berhasil dibuat.

  Login dashboard : ${team[0][1]}
  Password        : demo12345
  License demo    : ${DEMO_LICENSE}
  Direct chat link: /chat/${DEMO_LICENSE}
`);

db.close();
