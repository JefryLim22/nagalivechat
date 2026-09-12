import express from 'express';
import { all, get, run } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { nowIso, prefixedId } from '../lib/ids.js';
import {
  addMessage, listConversations, markReadByAgent, messagesFor, serializeConversation,
} from '../lib/store.js';
import { asyncRoute, str } from '../lib/validate.js';
import { emitToAccount, emitToConversation, isVisitorOnline } from '../realtime/index.js';

const router = express.Router();
router.use(requireAuth);

function owned(req, res) {
  const row = get('SELECT * FROM conversations WHERE id = ? AND account_id = ?', req.params.id, req.user.account_id);
  if (!row) { res.status(404).json({ error: 'Percakapan tidak ditemukan.' }); return null; }
  return row;
}

router.get('/', (req, res) => {
  const conversations = listConversations(req.user.account_id, {
    status: str(req.query.status, 20) || 'active',
    projectId: str(req.query.projectId, 40) || undefined,
    assignedTo: req.query.mine === '1' ? req.user.id : undefined,
    search: str(req.query.q, 80) || undefined,
  }).map((c) => ({ ...c, visitorOnline: isVisitorOnline(c.id) }));

  const counters = {
    queued: get(`SELECT COUNT(*) AS n FROM conversations WHERE account_id = ? AND status = 'queued'`, req.user.account_id).n,
    open: get(`SELECT COUNT(*) AS n FROM conversations WHERE account_id = ? AND status = 'open'`, req.user.account_id).n,
    closed: get(`SELECT COUNT(*) AS n FROM conversations WHERE account_id = ? AND status = 'closed'`, req.user.account_id).n,
    mine: get(`SELECT COUNT(*) AS n FROM conversations WHERE account_id = ? AND assigned_to = ? AND status != 'closed'`,
      req.user.account_id, req.user.id).n,
  };
  res.json({ conversations, counters });
});

router.get('/:id', (req, res) => {
  const conversation = owned(req, res);
  if (!conversation) return;
  markReadByAgent(conversation.id);
  res.json({
    conversation: { ...serializeConversation(conversation.id), visitorOnline: isVisitorOnline(conversation.id) },
    messages: messagesFor(conversation.id),
    notes: all('SELECT * FROM notes WHERE conversation_id = ? ORDER BY created_at', conversation.id)
      .map((n) => ({ id: n.id, body: n.body, authorName: n.author_name, createdAt: n.created_at })),
  });
});

router.post('/:id/messages', asyncRoute(async (req, res) => {
  const conversation = owned(req, res);
  if (!conversation) return;
  const body = str(req.body.body, 4000);
  if (!body) return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });

  if (!conversation.assigned_to) {
    run('UPDATE conversations SET assigned_to = ? WHERE id = ?', req.user.id, conversation.id);
  }
  const message = addMessage({
    conversationId: conversation.id,
    senderType: 'agent',
    senderId: req.user.id,
    senderName: req.user.name,
    senderColor: req.user.avatar_color,
    body,
  });
  emitToConversation(conversation.id, 'message:new', message);
  emitToAccount(req.user.account_id, 'conversation:update', serializeConversation(conversation.id));
  res.status(201).json({ message });
}));

router.patch('/:id', asyncRoute(async (req, res) => {
  const conversation = owned(req, res);
  if (!conversation) return;

  if (req.body.status && ['queued', 'open', 'closed'].includes(req.body.status)) {
    const closedAt = req.body.status === 'closed' ? nowIso() : null;
    run('UPDATE conversations SET status = ?, closed_at = ? WHERE id = ?', req.body.status, closedAt, conversation.id);
    if (req.body.status === 'closed') {
      const message = addMessage({
        conversationId: conversation.id,
        senderType: 'system',
        senderName: 'Sistem',
        body: `Percakapan ditutup oleh ${req.user.name}.`,
        kind: 'system',
      });
      emitToConversation(conversation.id, 'message:new', message);
      emitToConversation(conversation.id, 'conversation:closed', { conversationId: conversation.id });
    }
  }

  if (req.body.assignedTo !== undefined) {
    const target = req.body.assignedTo
      ? get('SELECT * FROM users WHERE id = ? AND account_id = ?', req.body.assignedTo, req.user.account_id)
      : null;
    run('UPDATE conversations SET assigned_to = ? WHERE id = ?', target?.id ?? null, conversation.id);
    if (target && target.id !== conversation.assigned_to) {
      const message = addMessage({
        conversationId: conversation.id,
        senderType: 'system',
        senderName: 'Sistem',
        body: `Percakapan dialihkan ke ${target.name}.`,
        kind: 'system',
      });
      emitToConversation(conversation.id, 'message:new', message);
    }
  }

  if (Array.isArray(req.body.tags)) {
    run('DELETE FROM conversation_tags WHERE conversation_id = ?', conversation.id);
    for (const raw of req.body.tags.slice(0, 12)) {
      const tag = str(raw, 30).toLowerCase();
      if (tag) run('INSERT OR IGNORE INTO conversation_tags (conversation_id, tag) VALUES (?,?)', conversation.id, tag);
    }
  }

  if (req.body.subject !== undefined) {
    run('UPDATE conversations SET subject = ? WHERE id = ?', str(req.body.subject, 160), conversation.id);
  }

  const updated = serializeConversation(conversation.id);
  emitToAccount(req.user.account_id, 'conversation:update', updated);
  res.json({ conversation: updated });
}));

router.post('/:id/notes', asyncRoute(async (req, res) => {
  const conversation = owned(req, res);
  if (!conversation) return;
  const body = str(req.body.body, 2000);
  if (!body) return res.status(400).json({ error: 'Catatan tidak boleh kosong.' });
  const id = prefixedId('not');
  run('INSERT INTO notes (id, conversation_id, user_id, author_name, body, created_at) VALUES (?,?,?,?,?,?)',
    id, conversation.id, req.user.id, req.user.name, body, nowIso());
  const note = get('SELECT * FROM notes WHERE id = ?', id);
  res.status(201).json({ note: { id: note.id, body: note.body, authorName: note.author_name, createdAt: note.created_at } });
}));

router.get('/:id/transcript', (req, res) => {
  const conversation = owned(req, res);
  if (!conversation) return;
  const meta = serializeConversation(conversation.id);
  const lines = [
    `Transkrip Percakapan — NagaLiveChat`,
    `Percakapan : ${meta.id}`,
    `Pengunjung : ${meta.displayName}${meta.visitor.email ? ` <${meta.visitor.email}>` : ''}`,
    `Project    : ${meta.projectName}`,
    `Mulai      : ${meta.startedAt}`,
    `Status     : ${meta.status}`,
    ''.padEnd(60, '-'),
    '',
  ];
  for (const m of messagesFor(conversation.id, 1000)) {
    const who = m.senderType === 'system' ? 'SISTEM' : `${m.senderName} (${m.senderType})`;
    lines.push(`[${new Date(m.createdAt).toLocaleString('id-ID')}] ${who}:`, m.body, '');
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transkrip-${conversation.id}.txt"`);
  res.send(lines.join('\n'));
});

export default router;
