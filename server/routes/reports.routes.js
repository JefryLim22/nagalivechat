import express from 'express';
import { all, get } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';

const router = express.Router();
router.use(requireAuth);

const RANGES = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };

router.get('/summary', (req, res) => {
  const accountId = req.user.account_id;
  const days = RANGES[req.query.range] ?? 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const totals = get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
            SUM(CASE WHEN first_reply_at IS NULL THEN 1 ELSE 0 END) AS unanswered,
            SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS good,
            SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) AS bad
       FROM conversations WHERE account_id = ? AND started_at >= ?`,
    accountId, since,
  );

  // Rata-rata waktu respons pertama (detik).
  const replied = all(
    `SELECT started_at, first_reply_at FROM conversations
      WHERE account_id = ? AND started_at >= ? AND first_reply_at IS NOT NULL`,
    accountId, since,
  );
  const avgFirstResponse = replied.length
    ? Math.round(replied.reduce((sum, r) =>
        sum + (new Date(r.first_reply_at) - new Date(r.started_at)) / 1000, 0) / replied.length)
    : 0;

  // Deret harian percakapan.
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    buckets.set(key, 0);
  }
  for (const row of all(
    `SELECT substr(started_at, 1, 10) AS day, COUNT(*) AS n
       FROM conversations WHERE account_id = ? AND started_at >= ?
      GROUP BY day`, accountId, since)) {
    if (buckets.has(row.day)) buckets.set(row.day, row.n);
  }

  // Distribusi jam sibuk (UTC).
  const hourly = Array.from({ length: 24 }, () => 0);
  for (const row of all(
    `SELECT CAST(substr(started_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS n
       FROM conversations WHERE account_id = ? AND started_at >= ? GROUP BY hour`, accountId, since)) {
    hourly[row.hour] = row.n;
  }

  const agents = all(
    `SELECT u.id, u.name, u.avatar_color,
            COUNT(DISTINCT c.id) AS chats,
            SUM(CASE WHEN c.rating = 1 THEN 1 ELSE 0 END) AS good,
            (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.created_at >= ?) AS messages
       FROM users u
       LEFT JOIN conversations c ON c.assigned_to = u.id AND c.started_at >= ?
      WHERE u.account_id = ?
      GROUP BY u.id ORDER BY chats DESC`,
    since, since, accountId,
  );

  const totalRated = (totals.good || 0) + (totals.bad || 0);

  res.json({
    range: req.query.range || '7d',
    totals: {
      conversations: totals.total || 0,
      closed: totals.closed || 0,
      unanswered: totals.unanswered || 0,
      good: totals.good || 0,
      bad: totals.bad || 0,
      satisfaction: totalRated ? Math.round(((totals.good || 0) / totalRated) * 100) : null,
      avgFirstResponse,
      visitors: get('SELECT COUNT(*) AS n FROM visitors v JOIN projects p ON p.id = v.project_id WHERE p.account_id = ? AND v.first_seen_at >= ?', accountId, since).n,
      messages: get('SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.account_id = ? AND m.created_at >= ?', accountId, since).n,
    },
    series: [...buckets].map(([date, value]) => ({ date, value })),
    hourly,
    agents: agents.map((a) => ({
      id: a.id, name: a.name, color: a.avatar_color, chats: a.chats || 0, good: a.good || 0, messages: a.messages || 0,
    })),
  });
});

export default router;
