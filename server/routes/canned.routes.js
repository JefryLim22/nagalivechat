import express from 'express';
import { all, get, run } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { nowIso, prefixedId } from '../lib/ids.js';
import { asyncRoute, str } from '../lib/validate.js';

const router = express.Router();
router.use(requireAuth);

const serialize = (row) => ({
  id: row.id, shortcut: row.shortcut, title: row.title, body: row.body, createdAt: row.created_at,
});

router.get('/', (req, res) => {
  res.json({
    responses: all('SELECT * FROM canned_responses WHERE account_id = ? ORDER BY shortcut', req.user.account_id)
      .map(serialize),
  });
});

router.post('/', asyncRoute(async (req, res) => {
  const title = str(req.body.title, 80);
  const body = str(req.body.body, 2000);
  let shortcut = str(req.body.shortcut, 40).toLowerCase().replace(/\s+/g, '-');
  if (shortcut && !shortcut.startsWith('#')) shortcut = `#${shortcut}`;
  if (!title || !body) return res.status(400).json({ error: 'Judul dan isi balasan wajib diisi.' });

  const id = prefixedId('cnd');
  run('INSERT INTO canned_responses (id, account_id, shortcut, title, body, created_at) VALUES (?,?,?,?,?,?)',
    id, req.user.account_id, shortcut || `#${id.slice(-4)}`, title, body, nowIso());
  res.status(201).json({ response: serialize(get('SELECT * FROM canned_responses WHERE id = ?', id)) });
}));

router.patch('/:id', asyncRoute(async (req, res) => {
  const row = get('SELECT * FROM canned_responses WHERE id = ? AND account_id = ?', req.params.id, req.user.account_id);
  if (!row) return res.status(404).json({ error: 'Balasan cepat tidak ditemukan.' });
  let shortcut = str(req.body.shortcut, 40).toLowerCase().replace(/\s+/g, '-') || row.shortcut;
  if (!shortcut.startsWith('#')) shortcut = `#${shortcut}`;
  run('UPDATE canned_responses SET shortcut = ?, title = ?, body = ? WHERE id = ?',
    shortcut, str(req.body.title, 80) || row.title, str(req.body.body, 2000) || row.body, row.id);
  res.json({ response: serialize(get('SELECT * FROM canned_responses WHERE id = ?', row.id)) });
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  const row = get('SELECT * FROM canned_responses WHERE id = ? AND account_id = ?', req.params.id, req.user.account_id);
  if (!row) return res.status(404).json({ error: 'Balasan cepat tidak ditemukan.' });
  run('DELETE FROM canned_responses WHERE id = ?', row.id);
  res.json({ ok: true });
}));

export default router;
