/**
 * Konfigurasi PM2 — dipakai oleh aaPanel (Node Project / PM2 Manager)
 * dan oleh siapa pun yang menjalankan aplikasi ini dengan PM2.
 *
 * Berkas ini memakai ekstensi .cjs karena package.json memakai "type": "module",
 * sedangkan PM2 membaca konfigurasinya sebagai CommonJS.
 *
 * Pemakaian:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup      # agar hidup lagi setelah server reboot
 */
module.exports = {
  apps: [
    {
      name: 'nagalivechat',
      script: 'server/index.js',

      // node:sqlite masih ditandai eksperimental di Node 22; flag ini hanya
      // meredam peringatannya, bukan mengubah perilaku.
      node_args: '--no-warnings=ExperimentalWarning',

      // Aplikasi menyimpan state di memori (presence agent, koneksi Socket.IO),
      // jadi harus satu proses. Untuk menskalakan ke beberapa instance,
      // pasang dulu adapter Redis untuk Socket.IO.
      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      max_memory_restart: '512M',
      kill_timeout: 15000,

      // Variabel lain (JWT_SECRET, PUBLIC_URL, DATABASE_FILE) dibaca dari
      // berkas .env di direktori proyek — lihat .env.example.
      env: {
        NODE_ENV: 'production',
      },

      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
