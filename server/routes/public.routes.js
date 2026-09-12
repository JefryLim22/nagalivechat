import express from 'express';
import { all, get, parseJson, run } from '../db/index.js';
import { signVisitorToken, verifyToken } from '../lib/auth.js';
import { nowIso, prefixedId, randomId } from '../lib/ids.js';
import { rateLimit } from '../lib/ratelimit.js';
import {
  addMessage, availableAgents, isTeamOnline, markReadByVisitor, messagesFor,
  openConversationFor, projectByLicense, serializeConversation, upsertVisitor, visitorLabel,
} from '../lib/store.js';
import { parseUserAgent } from '../lib/useragent.js';
import { asyncRoute, isEmail, str } from '../lib/validate.js';
import { emitToAccount, emitToConversation } from '../realtime/index.js';
import { mergeSettings } from '../lib/widget-settings.js';

const router = express.Router();

// API pengunjung boleh dipanggil lintas domain (widget di website pelanggan).
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Visitor-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

router.use(rateLimit({ windowMs: 60_000, max: 240 }));

/** Ambil identitas pengunjung dari header token. */
function visitorContext(req, res) {
  const token = req.get('X-Visitor-Token') || str(req.body?.visitorToken, 2000) || str(req.query?.visitorToken, 2000);
  const decoded = verifyToken(token, 'visitor');
  if (!decoded) { res.status(401).json({ error: 'Sesi chat tidak valid. Muat ulang halaman.' }); return null; }
  const conversation = get('SELECT * FROM conversations WHERE id = ?', decoded.conversationId);
  if (!conversation) { res.status(404).json({ error: 'Percakapan tidak ditemukan.' }); return null; }
  return { ...decoded, conversation };
}

/* ------------------------------------------------------------------ */
/* Konfigurasi widget                                                  */
/* ------------------------------------------------------------------ */

router.get('/config', (req, res) => {
  const project = projectByLicense(req.query.license);
  if (!project) return res.status(404).json({ error: 'License key tidak dikenal.' });
  res.json({
    project: { id: project.id, name: project.name, licenseKey: project.license_key },
    settings: mergeSettings(parseJson(project.settings)),
    teamOnline: isTeamOnline(project.account_id),
    agents: availableAgents(project.account_id).slice(0, 4),
  });
});

/* ------------------------------------------------------------------ */
/* Mulai / lanjutkan sesi chat                                         */
/* ------------------------------------------------------------------ */

router.post('/session', asyncRoute(async (req, res) => {
  const project = projectByLicense(req.body.license);
  if (!project) return res.status(404).json({ error: 'License key tidak dikenal.' });

  const uid = str(req.body.uid, 64) || randomId(20);
  const ua = req.get('user-agent') || '';
  const { browser, os, device } = parseUserAgent(ua);

  const visitor = upsertVisitor(project.id, uid, {
    name: str(req.body.name, 80),
    email: isEmail(req.body.email) ? str(req.body.email, 160) : '',
    ip: (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim(),
    userAgent: ua, browser, os, device,
    locale: str(req.body.locale, 20),
    timezone: str(req.body.timezone, 60),
    referrer: str(req.body.referrer, 400),
    currentUrl: str(req.body.currentUrl, 400),
    pageTitle: str(req.body.pageTitle, 200),
  });

  const source = req.body.source === 'direct-link' ? 'direct-link' : 'widget';
  const conversation = openConversationFor(project, visitor, source);

  if (conversation.isNew) {
    emitToAccount(project.account_id, 'conversation:new', serializeConversation(conversation.id));
  }

  const token = signVisitorToken({
    conversationId: conversation.id,
    visitorId: visitor.id,
    projectId: project.id,
    accountId: project.account_id,
  });

  res.json({
    visitorToken: token,
    uid: visitor.uid,
    conversationId: conversation.id,
    isNew: conversation.isNew,
    visitor: { name: visitor.name, email: visitor.email, label: visitorLabel(visitor) },
    settings: mergeSettings(parseJson(project.settings)),
    project: { id: project.id, name: project.name },
    teamOnline: isTeamOnline(project.account_id),
    agents: availableAgents(project.account_id).slice(0, 4),
    messages: messagesFor(conversation.id),
  });
}));

/* ------------------------------------------------------------------ */
/* Pesan                                                               */
/* ------------------------------------------------------------------ */

router.get('/messages', (req, res) => {
  const ctx = visitorContext(req, res);
  if (!ctx) return;
  markReadByVisitor(ctx.conversationId);
  res.json({ messages: messagesFor(ctx.conversationId) });
});

router.post('/messages', asyncRoute(async (req, res) => {
  const ctx = visitorContext(req, res);
  if (!ctx) return;
  const body = str(req.body.body, 4000);
  if (!body) return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });

  const visitor = get('SELECT * FROM visitors WHERE id = ?', ctx.visitorId);
  const message = addMessage({
    conversationId: ctx.conversationId,
    senderType: 'visitor',
    senderId: ctx.visitorId,
    senderName: visitorLabel(visitor),
    body,
  });
  emitToConversation(ctx.conversationId, 'message:new', message);
  emitToAccount(ctx.accountId, 'conversation:update', serializeConversation(ctx.conversationId));
  res.status(201).json({ message });
}));

/* ------------------------------------------------------------------ */
/* Profil pengunjung (form pre-chat)                                   */
/* ------------------------------------------------------------------ */

router.post('/profile', asyncRoute(async (req, res) => {
  const ctx = visitorContext(req, res);
  if (!ctx) return;
  const name = str(req.body.name, 80);
  const email = isEmail(req.body.email) ? str(req.body.email, 160) : '';
  const phone = str(req.body.phone, 40);

  run(`UPDATE visitors SET name = COALESCE(NULLIF(?, ''), name),
                           email = COALESCE(NULLIF(?, ''), email),
                           phone = COALESCE(NULLIF(?, ''), phone)
        WHERE id = ?`, name, email, phone, ctx.visitorId);

  const conversation = serializeConversation(ctx.conversationId);
  emitToAccount(ctx.accountId, 'conversation:update', conversation);
  res.json({ visitor: conversation.visitor, displayName: conversation.displayName });
}));

/* ------------------------------------------------------------------ */
/* Rating & penutupan                                                  */
/* ------------------------------------------------------------------ */

router.post('/rate', asyncRoute(async (req, res) => {
  const ctx = visitorContext(req, res);
  if (!ctx) return;
  const rating = Number(req.body.rating) > 0 ? 1 : -1;
  const comment = str(req.body.comment, 500);
  run('UPDATE conversations SET rating = ?, rating_comment = ? WHERE id = ?', rating, comment, ctx.conversationId);

  const message = addMessage({
    conversationId: ctx.conversationId,
    senderType: 'system',
    senderName: 'Sistem',
    body: rating > 0 ? 'Pengunjung memberi rating: Puas 👍' : 'Pengunjung memberi rating: Kurang puas 👎',
    kind: 'rating',
  });
  emitToConversation(ctx.conversationId, 'message:new', message);
  emitToAccount(ctx.accountId, 'conversation:update', serializeConversation(ctx.conversationId));
  res.json({ ok: true });
}));

router.post('/close', asyncRoute(async (req, res) => {
  const ctx = visitorContext(req, res);
  if (!ctx) return;
  run(`UPDATE conversations SET status = 'closed', closed_at = ? WHERE id = ?`, nowIso(), ctx.conversationId);
  const message = addMessage({
    conversationId: ctx.conversationId,
    senderType: 'system',
    senderName: 'Sistem',
    body: 'Percakapan diakhiri oleh pengunjung.',
    kind: 'system',
  });
  emitToConversation(ctx.conversationId, 'message:new', message);
  emitToAccount(ctx.accountId, 'conversation:update', serializeConversation(ctx.conversationId));
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ */
/* Pesan offline                                                       */
/* ------------------------------------------------------------------ */

router.post('/offline-message', asyncRoute(async (req, res) => {
  const project = projectByLicense(req.body.license);
  if (!project) return res.status(404).json({ error: 'License key tidak dikenal.' });
  const email = str(req.body.email, 160);
  const body = str(req.body.body, 2000);
  if (!isEmail(email)) return res.status(400).json({ error: 'Email tidak valid.' });
  if (!body) return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });

  const id = prefixedId('off');
  run('INSERT INTO offline_messages (id, project_id, account_id, name, email, body, created_at) VALUES (?,?,?,?,?,?,?)',
    id, project.id, project.account_id, str(req.body.name, 80), email, body, nowIso());
  emitToAccount(project.account_id, 'offline:new', { id, email, body, createdAt: nowIso() });
  res.status(201).json({ ok: true });
}));

/** Transkrip untuk pengunjung (unduh sendiri). */
router.get('/transcript', (req, res) => {
  const ctx = visitorContext(req, res);
  if (!ctx) return;
  const lines = messagesFor(ctx.conversationId, 1000).map((m) =>
    `[${new Date(m.createdAt).toLocaleString('id-ID')}] ${m.senderName}: ${m.body}`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="transkrip-chat.txt"');
  res.send(['Transkrip Percakapan — NagaLiveChat', ''.padEnd(50, '-'), ...lines].join('\n'));
});

export default router;
