import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

// Loader .env sederhana supaya tidak perlu dependency tambahan.
function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile();

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT || 3000),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, ''),
  jwtSecret: process.env.JWT_SECRET || 'nagalivechat-dev-secret-change-me',
  databaseFile: path.resolve(ROOT, process.env.DATABASE_FILE || './data/nagalivechat.db'),
  isProd,
  publicDir: path.join(ROOT, 'public'),
  cookieName: 'naga_session',
  sessionTtlDays: 30,
};

/* Secret default berarti setiap orang bisa memalsukan sesi agent, jadi di
   production ini dianggap kesalahan konfigurasi fatal, bukan sekadar peringatan. */
if (isProd && config.jwtSecret === 'nagalivechat-dev-secret-change-me') {
  console.error(
    '\n[naga] FATAL: JWT_SECRET masih memakai nilai default di mode production.\n' +
    '        Buat secret acak lalu simpan di environment:\n' +
    '          openssl rand -hex 32\n',
  );
  process.exit(1);
}

if (isProd && config.jwtSecret.length < 32) {
  console.error('\n[naga] FATAL: JWT_SECRET terlalu pendek (minimal 32 karakter).\n');
  process.exit(1);
}
