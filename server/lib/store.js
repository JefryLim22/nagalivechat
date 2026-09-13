import { all, get, parseJson, run } from '../db/index.js';
import { nowIso, prefixedId } from './ids.js';
import { mergeSettings } from './widget-settings.js';

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */

export function projectByLicense(licenseKey) {
  const row = get('SELECT * FROM projects WHERE license_key = ?', String(licenseKey || '').trim());
  return row ? { ...row } : null;
}

export function projectPublic(project) {
  return {
    id: project.id,
    name: project.name,
    licenseKey: project.license_key,
    settings: mergeSettings(parseJson(project.settings)),
  };
}

/* ------------------------------------------------------------------ */
/* Presence agent                                                      */
/* ------------------------------------------------------------------ */

/** Daftar agent yang sedang online/away pada sebuah akun. */
export function availableAgents(accountId) {
  return all(
    `SELECT id, name, title, avatar_color, presence
       FROM users
      WHERE account_id = ? AND presence IN ('online', 'away')
      ORDER BY CASE presence WHEN 'online' THEN 0 ELSE 1 END, name`,
    accountId,
  );
}

export const isTeamOnline = (accountId) =>
  Boolean(get(`SELECT 1 AS ok FROM users WHERE account_id = ? AND presence = 'online' LIMIT 1`, accountId));

/* ------------------------------------------------------------------ */
/* Visitor                                                             */
/* ------------------------------------------------------------------ */

export function upsertVisitor(projectId, uid, meta = {}) {
  const existing = get('SELECT * FROM visitors WHERE project_id = ? AND uid = ?', projectId, uid);
  const now = nowIso();

  if (!existing) {
    const id = prefixedId('vis');
    run(
      `INSERT INTO visitors (id, project_id, uid, name, email, phone, ip, user_agent, browser, os, device,
                             locale, timezone, referrer, current_url, page_title, visits, first_seen_at, last_seen_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      id, projectId, uid,
      meta.name || '', meta.email || '', meta.phone || '',
      meta.ip || '', meta.userAgent || '', meta.browser || '', meta.os || '', meta.device || '',
      meta.locale || '', meta.timezone || '', meta.referrer || '', meta.currentUrl || '', meta.pageTitle || '',
      now, now,
    );
    return { ...get('SELECT * FROM visitors WHERE id = ?', id) };
  }

  run(
    `UPDATE visitors
        SET name        = COALESCE(NULLIF(?, ''), name),
            email       = COALESCE(NULLIF(?, ''), email),
            phone       = COALESCE(NULLIF(?, ''), phone),
            ip          = COALESCE(NULLIF(?, ''), ip),
            user_agent  = COALESCE(NULLIF(?, ''), user_agent),
            browser     = COALESCE(NULLIF(?, ''), browser),
            os          = COALESCE(NULLIF(?, ''), os),
            device      = COALESCE(NULLIF(?, ''), device),
            locale      = COALESCE(NULLIF(?, ''), locale),
            timezone    = COALESCE(NULLIF(?, ''), timezone),
            referrer    = COALESCE(NULLIF(?, ''), referrer),
            current_url = COALESCE(NULLIF(?, ''), current_url),
            page_title  = COALESCE(NULLIF(?, ''), page_title),
            last_seen_at = ?
      WHERE id = ?`,
    meta.name || '', meta.email || '', meta.phone || '',
    meta.ip || '', meta.userAgent || '', meta.browser || '', meta.os || '', meta.device || '',
    meta.locale || '', meta.timezone || '', meta.referrer || '', meta.currentUrl || '', meta.pageTitle || '',
    now, existing.id,
  );
  return { ...get('SELECT * FROM visitors WHERE id = ?', existing.id) };
}

export function visitorLabel(visitor) {
  if (visitor?.name) return visitor.name;
  const suffix = String(visitor?.id || '').slice(-4).toUpperCase();
  return `Pengunjung #${suffix}`;
}

/* ------------------------------------------------------------------ */
/* Conversation                                                        */
/* ------------------------------------------------------------------ */

/** Ambil percakapan aktif milik visitor, atau buat baru. */
export function openConversationFor(project, visitor, source = 'widget') {
  const active = get(
    `SELECT * FROM conversations
      WHERE visitor_id = ? AND status != 'closed'
      ORDER BY started_at DESC LIMIT 1`,
    visitor.id,
  );
  if (active) return { ...active, isNew: false };

  const id = prefixedId('cnv');
  const now = nowIso();
  run(
    `INSERT INTO conversations (id, project_id, account_id, visitor_id, status, source, started_at, last_message_at)
     VALUES (?,?,?,?,'queued',?,?,?)`,
    id, project.id, project.account_id, visitor.id, source, now, now,
  );
  return { ...get('SELECT * FROM conversations WHERE id = ?', id), isNew: true };
}

export function addMessage({
  conversationId, senderType, senderId = null, senderName = '',
  senderColor = '#6D5EF8', body, kind = 'text',
}) {
  const id = prefixedId('msg');
  const now = nowIso();
  run(
    `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, sender_color, body, kind, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id, conversationId, senderType, senderId, senderName, senderColor, body, kind, now,
  );

  if (senderType === 'visitor') {
    run(
      `UPDATE conversations SET last_message_at = ?, unread_agent = unread_agent + 1 WHERE id = ?`,
      now, conversationId,
    );
  } else if (senderType === 'agent') {
    run(
      `UPDATE conversations
          SET last_message_at = ?,
              unread_visitor  = unread_visitor + 1,
              first_reply_at  = COALESCE(first_reply_at, ?),
              status          = CASE WHEN status = 'queued' THEN 'open' ELSE status END
        WHERE id = ?`,
      now, now, conversationId,
    );
  } else {
    run('UPDATE conversations SET last_message_at = ? WHERE id = ?', now, conversationId);
  }

  return serializeMessage(get('SELECT * FROM messages WHERE id = ?', id));
}

export const serializeMessage = (row) => ({
  id: row.id,
  conversationId: row.conversation_id,
  senderType: row.sender_type,
  senderId: row.sender_id,
  senderName: row.sender_name,
  senderColor: row.sender_color,
  body: row.body,
  kind: row.kind,
  createdAt: row.created_at,
});

export const messagesFor = (conversationId, limit = 300) =>
  all(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC LIMIT ?',
    conversationId, limit,
  ).map(serializeMessage);

/** Bentuk ringkas percakapan untuk daftar inbox agent. */
export function serializeConversation(conversationId) {
  const row = get(
    `SELECT c.*,
            v.name AS v_name, v.email AS v_email, v.phone AS v_phone, v.browser, v.os, v.device,
            v.current_url, v.page_title, v.referrer, v.locale, v.timezone, v.ip, v.visits,
            v.first_seen_at AS v_first_seen, v.last_seen_at AS v_last_seen, v.uid AS v_uid,
            p.name AS project_name, p.license_key,
            u.name AS agent_name, u.avatar_color AS agent_color
       FROM conversations c
       JOIN visitors v ON v.id = c.visitor_id
       JOIN projects p ON p.id = c.project_id
       LEFT JOIN users u ON u.id = c.assigned_to
      WHERE c.id = ?`,
    conversationId,
  );
  if (!row) return null;

  const last = get(
    'SELECT body, sender_type, created_at, kind FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    conversationId,
  );
  const tags = all('SELECT tag FROM conversation_tags WHERE conversation_id = ?', conversationId).map((t) => t.tag);

  const visitor = {
    id: row.visitor_id,
    uid: row.v_uid,
    name: row.v_name,
    email: row.v_email,
    phone: row.v_phone,
    browser: row.browser,
    os: row.os,
    device: row.device,
    currentUrl: row.current_url,
    pageTitle: row.page_title,
    referrer: row.referrer,
    locale: row.locale,
    timezone: row.timezone,
    ip: row.ip,
    visits: row.visits,
    firstSeenAt: row.v_first_seen,
    lastSeenAt: row.v_last_seen,
  };

  return {
    id: row.id,
    accountId: row.account_id,
    projectId: row.project_id,
    projectName: row.project_name,
    licenseKey: row.license_key,
    status: row.status,
    source: row.source,
    subject: row.subject,
    prechat: parseJson(row.prechat, []),
    rating: row.rating,
    ratingComment: row.rating_comment,
    unreadAgent: row.unread_agent,
    unreadVisitor: row.unread_visitor,
    assignedTo: row.assigned_to,
    agentName: row.agent_name,
    agentColor: row.agent_color,
    startedAt: row.started_at,
    closedAt: row.closed_at,
    firstReplyAt: row.first_reply_at,
    lastMessageAt: row.last_message_at,
    displayName: visitorLabel(visitor),
    tags,
    visitor,
    lastMessage: last
      ? { body: last.body, senderType: last.sender_type, createdAt: last.created_at, kind: last.kind }
      : null,
  };
}

export function listConversations(accountId, { status, projectId, assignedTo, search, limit = 100 } = {}) {
  const where = ['c.account_id = ?'];
  const params = [accountId];

  if (status && status !== 'all') {
    if (status === 'active') where.push(`c.status IN ('queued','open')`);
    else { where.push('c.status = ?'); params.push(status); }
  }
  if (projectId) { where.push('c.project_id = ?'); params.push(projectId); }
  if (assignedTo) { where.push('c.assigned_to = ?'); params.push(assignedTo); }
  if (search) {
    where.push(`(v.name LIKE ? OR v.email LIKE ? OR EXISTS (
        SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.body LIKE ?))`);
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const rows = all(
    `SELECT c.id FROM conversations c
       JOIN visitors v ON v.id = c.visitor_id
      WHERE ${where.join(' AND ')}
      ORDER BY CASE c.status WHEN 'queued' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,
               COALESCE(c.last_message_at, c.started_at) DESC
      LIMIT ?`,
    ...params, limit,
  );
  return rows.map((r) => serializeConversation(r.id)).filter(Boolean);
}

export function markReadByAgent(conversationId) {
  run('UPDATE conversations SET unread_agent = 0 WHERE id = ?', conversationId);
  run(`UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_type = 'visitor' AND read_at IS NULL`,
    nowIso(), conversationId);
}

export const markReadByVisitor = (conversationId) =>
  run('UPDATE conversations SET unread_visitor = 0 WHERE id = ?', conversationId);
