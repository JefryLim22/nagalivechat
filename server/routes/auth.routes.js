import express from 'express';
import { all, get, run, transaction } from '../db/index.js';
import {
  clearSessionCookie, hashPassword, requireAuth, setSessionCookie, signSession, verifyPassword,
} from '../lib/auth.js';
import { licenseKey, nowIso, prefixedId } from '../lib/ids.js';
import { DEFAULT_WIDGET_SETTINGS } from '../lib/widget-settings.js';
import { asyncRoute, isEmail, str } from '../lib/validate.js';

const router = express.Router();

const AVATAR_COLORS = ['#6D5EF8', '#FF7A45', '#16C79A', '#F2385A', '#2D9CDB', '#9B51E0', '#F2994A'];
const pickColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

export const publicUser = (user) => ({
  id: user.id,
  accountId: user.account_id,
  email: user.email,
  name: user.name,
  title: user.title,
  role: user.role,
  avatarColor: user.avatar_color,
  presence: user.presence,
});

router.post('/signup', asyncRoute(async (req, res) => {
  const name = str(req.body.name, 80);
  const company = str(req.body.company, 80) || `${name.split(' ')[0]}'s Workspace`;
  const email = str(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');

  if (!name) return res.status(400).json({ error: 'Nama wajib diisi.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Format email tidak valid.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  if (get('SELECT 1 AS ok FROM users WHERE email = ?', email)) {
    return res.status(409).json({ error: 'Email ini sudah terdaftar. Silakan login.' });
  }

  const passwordHash = await hashPassword(password);
  const now = nowIso();
  const accountId = prefixedId('acc');
  const userId = prefixedId('usr');
  const projectId = prefixedId('prj');

  transaction(() => {
    run('INSERT INTO accounts (id, name, plan, created_at) VALUES (?,?,?,?)', accountId, company, 'trial', now);
    run(
      `INSERT INTO users (id, account_id, email, password_hash, name, title, role, avatar_color, presence, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      userId, accountId, email, passwordHash, name, 'Founder', 'owner', pickColor(), 'offline', now,
    );
    run(
      'INSERT INTO projects (id, account_id, name, license_key, domain, settings, created_at) VALUES (?,?,?,?,?,?,?)',
      projectId, accountId, company, licenseKey(), '',
      JSON.stringify({ ...DEFAULT_WIDGET_SETTINGS, companyName: company }), now,
    );
    const canned = [
      ['#halo', 'Sapaan pembuka', 'Halo! Terima kasih sudah menghubungi kami. Ada yang bisa saya bantu?'],
      ['#tunggu', 'Minta waktu', 'Mohon tunggu sebentar ya, saya cek dulu informasinya 🙏'],
      ['#tutup', 'Penutup', 'Terima kasih sudah menghubungi kami. Semoga harimu menyenangkan! 😊'],
    ];
    for (const [shortcut, title, body] of canned) {
      run('INSERT INTO canned_responses (id, account_id, shortcut, title, body, created_at) VALUES (?,?,?,?,?,?)',
        prefixedId('cnd'), accountId, shortcut, title, body, now);
    }
  });

  const user = get('SELECT * FROM users WHERE id = ?', userId);
  setSessionCookie(res, signSession(user));
  res.status(201).json({ user: publicUser(user) });
}));

router.post('/login', asyncRoute(async (req, res) => {
  const email = str(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');
  const user = get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Email atau password salah.' });
  }
  setSessionCookie(res, signSession(user));
  res.json({ user: publicUser(user) });
}));

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const account = get('SELECT * FROM accounts WHERE id = ?', req.user.account_id);
  const projects = all('SELECT id, name, license_key FROM projects WHERE account_id = ? ORDER BY created_at', account.id);
  res.json({
    user: publicUser(req.user),
    account: { id: account.id, name: account.name, plan: account.plan, createdAt: account.created_at },
    projects: projects.map((p) => ({ id: p.id, name: p.name, licenseKey: p.license_key })),
  });
});

router.patch('/me', requireAuth, asyncRoute(async (req, res) => {
  const name = str(req.body.name, 80) || req.user.name;
  const title = str(req.body.title, 80) || req.user.title;
  const avatarColor = str(req.body.avatarColor, 20) || req.user.avatar_color;
  run('UPDATE users SET name = ?, title = ?, avatar_color = ? WHERE id = ?', name, title, avatarColor, req.user.id);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
}));

export default router;
