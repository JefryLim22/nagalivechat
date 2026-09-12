import express from 'express';
import { all, get, run } from '../db/index.js';
import { hashPassword, requireAdmin, requireAuth } from '../lib/auth.js';
import { nowIso, prefixedId } from '../lib/ids.js';
import { asyncRoute, isEmail, str } from '../lib/validate.js';
import { publicUser } from './auth.routes.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const members = all(
    `SELECT u.*, (SELECT COUNT(*) FROM conversations c
                   WHERE c.assigned_to = u.id AND c.status != 'closed') AS active_chats
       FROM users u WHERE u.account_id = ? ORDER BY u.created_at`,
    req.user.account_id,
  );
  res.json({
    members: members.map((m) => ({ ...publicUser(m), activeChats: m.active_chats, lastSeenAt: m.last_seen_at })),
  });
});

router.post('/', requireAdmin, asyncRoute(async (req, res) => {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');
  const role = ['admin', 'agent'].includes(req.body.role) ? req.body.role : 'agent';

  if (!name) return res.status(400).json({ error: 'Nama agent wajib diisi.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Format email tidak valid.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  if (get('SELECT 1 AS ok FROM users WHERE email = ?', email)) {
    return res.status(409).json({ error: 'Email ini sudah dipakai.' });
  }

  const id = prefixedId('usr');
  const colors = ['#6D5EF8', '#FF7A45', '#16C79A', '#F2385A', '#2D9CDB', '#9B51E0'];
  run(
    `INSERT INTO users (id, account_id, email, password_hash, name, title, role, avatar_color, presence, created_at)
     VALUES (?,?,?,?,?,?,?,?,'offline',?)`,
    id, req.user.account_id, email, await hashPassword(password), name,
    str(req.body.title, 80) || 'Support Agent', role,
    colors[Math.floor(Math.random() * colors.length)], nowIso(),
  );
  res.status(201).json({ member: publicUser(get('SELECT * FROM users WHERE id = ?', id)) });
}));

router.patch('/:id', requireAdmin, asyncRoute(async (req, res) => {
  const member = get('SELECT * FROM users WHERE id = ? AND account_id = ?', req.params.id, req.user.account_id);
  if (!member) return res.status(404).json({ error: 'Agent tidak ditemukan.' });
  const role = ['owner', 'admin', 'agent'].includes(req.body.role) ? req.body.role : member.role;
  run('UPDATE users SET name = ?, title = ?, role = ? WHERE id = ?',
    str(req.body.name, 80) || member.name, str(req.body.title, 80) || member.title, role, member.id);
  res.json({ member: publicUser(get('SELECT * FROM users WHERE id = ?', member.id)) });
}));

router.delete('/:id', requireAdmin, asyncRoute(async (req, res) => {
  const member = get('SELECT * FROM users WHERE id = ? AND account_id = ?', req.params.id, req.user.account_id);
  if (!member) return res.status(404).json({ error: 'Agent tidak ditemukan.' });
  if (member.role === 'owner') return res.status(400).json({ error: 'Owner tidak dapat dihapus.' });
  if (member.id === req.user.id) return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri.' });
  run('DELETE FROM users WHERE id = ?', member.id);
  res.json({ ok: true });
}));

export default router;
