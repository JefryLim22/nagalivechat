import cookie from 'cookie';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { get, run } from '../db/index.js';
import { verifyToken } from '../lib/auth.js';
import { nowIso } from '../lib/ids.js';
import {
  addMessage, availableAgents, isTeamOnline, markReadByAgent, markReadByVisitor,
  serializeConversation, visitorLabel,
} from '../lib/store.js';

/** Pengunjung yang sedang terhubung: conversationId -> jumlah socket aktif. */
const visitorSockets = new Map();

export const accountRoom = (accountId) => `account:${accountId}`;
export const convRoom = (conversationId) => `conv:${conversationId}`;

let io = null;
export const getIO = () => io;

/** Kirim event ke seluruh agent pada sebuah akun. */
export function emitToAccount(accountId, event, payload) {
  io?.to(accountRoom(accountId)).emit(event, payload);
}

export function emitToConversation(conversationId, event, payload) {
  io?.to(convRoom(conversationId)).emit(event, payload);
}

/** Sebarkan status presence tim ke agent & semua widget yang terbuka. */
function publishPresence(accountId) {
  if (!io) return;
  const agents = availableAgents(accountId);
  const online = isTeamOnline(accountId);
  io.to(accountRoom(accountId)).emit('presence:team', { agents, online });
  io.to(`account-visitors:${accountId}`).emit('team:presence', { online, agents });
}

function setPresence(userId, presence) {
  run('UPDATE users SET presence = ?, last_seen_at = ? WHERE id = ?', presence, nowIso(), userId);
}

export function attachRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    path: '/socket.io',
    serveClient: true,
  });

  /* ---------------- Autentikasi handshake ---------------- */
  io.use((socket, next) => {
    const auth = socket.handshake.auth || {};

    if (auth.role === 'visitor') {
      const decoded = verifyToken(auth.token, 'visitor');
      if (!decoded) return next(new Error('Token pengunjung tidak valid'));
      socket.data.role = 'visitor';
      socket.data.visitor = decoded; // { conversationId, visitorId, projectId, accountId }
      return next();
    }

    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    const decoded = verifyToken(cookies[config.cookieName], 'agent');
    if (!decoded) return next(new Error('Sesi agent tidak valid'));
    const user = get('SELECT * FROM users WHERE id = ?', decoded.sub);
    if (!user) return next(new Error('User tidak ditemukan'));
    socket.data.role = 'agent';
    socket.data.user = { ...user };
    return next();
  });

  io.on('connection', (socket) => {
    if (socket.data.role === 'agent') attachAgent(socket);
    else attachVisitor(socket);
  });

  return io;
}

/* ------------------------------------------------------------------ */
/* Sisi agent                                                          */
/* ------------------------------------------------------------------ */

function attachAgent(socket) {
  const user = socket.data.user;
  socket.join(accountRoom(user.account_id));

  setPresence(user.id, 'online');
  publishPresence(user.account_id);

  socket.emit('ready', { userId: user.id, accountId: user.account_id });

  socket.on('agent:presence', ({ presence } = {}) => {
    const value = ['online', 'away', 'offline'].includes(presence) ? presence : 'online';
    setPresence(user.id, value);
    publishPresence(user.account_id);
  });

  socket.on('conversation:join', ({ conversationId } = {}) => {
    const conversation = get(
      'SELECT * FROM conversations WHERE id = ? AND account_id = ?',
      conversationId, user.account_id,
    );
    if (!conversation) return;
    socket.join(convRoom(conversationId));
    markReadByAgent(conversationId);
    socket.emit('conversation:update', serializeConversation(conversationId));
    socket.emit('visitor:presence', {
      conversationId,
      online: (visitorSockets.get(conversationId) || 0) > 0,
    });
  });

  socket.on('conversation:leave', ({ conversationId } = {}) => socket.leave(convRoom(conversationId)));

  socket.on('message:send', ({ conversationId, body } = {}, ack) => {
    const text = String(body || '').trim().slice(0, 4000);
    if (!text) return;
    const conversation = get(
      'SELECT * FROM conversations WHERE id = ? AND account_id = ?',
      conversationId, user.account_id,
    );
    if (!conversation) return;

    if (!conversation.assigned_to) {
      run('UPDATE conversations SET assigned_to = ? WHERE id = ?', user.id, conversationId);
    }

    const message = addMessage({
      conversationId,
      senderType: 'agent',
      senderId: user.id,
      senderName: user.name,
      senderColor: user.avatar_color,
      body: text,
    });

    io.to(convRoom(conversationId)).emit('message:new', message);
    io.to(accountRoom(user.account_id)).emit('conversation:update', serializeConversation(conversationId));
    ack?.({ ok: true, message });
  });

  socket.on('typing', ({ conversationId, typing } = {}) => {
    socket.to(convRoom(conversationId)).emit('typing', {
      conversationId, who: 'agent', name: user.name, typing: Boolean(typing),
    });
  });

  socket.on('disconnect', () => {
    const stillConnected = [...(io.sockets.adapter.rooms.get(accountRoom(user.account_id)) || [])]
      .some((id) => io.sockets.sockets.get(id)?.data?.user?.id === user.id);
    if (!stillConnected) setPresence(user.id, 'offline');
    publishPresence(user.account_id);
  });
}

/* ------------------------------------------------------------------ */
/* Sisi pengunjung                                                     */
/* ------------------------------------------------------------------ */

function attachVisitor(socket) {
  const { conversationId, visitorId, accountId } = socket.data.visitor;
  socket.join(convRoom(conversationId));
  socket.join(`account-visitors:${accountId}`);

  visitorSockets.set(conversationId, (visitorSockets.get(conversationId) || 0) + 1);
  io.to(convRoom(conversationId)).emit('visitor:presence', { conversationId, online: true });
  io.to(accountRoom(accountId)).emit('visitor:presence', { conversationId, online: true });

  socket.emit('ready', { conversationId });
  socket.emit('team:presence', { online: isTeamOnline(accountId), agents: availableAgents(accountId) });

  socket.on('message:send', ({ body } = {}, ack) => {
    const text = String(body || '').trim().slice(0, 4000);
    if (!text) return;
    const visitor = get('SELECT * FROM visitors WHERE id = ?', visitorId);
    const message = addMessage({
      conversationId,
      senderType: 'visitor',
      senderId: visitorId,
      senderName: visitorLabel(visitor),
      body: text,
    });
    io.to(convRoom(conversationId)).emit('message:new', message);
    io.to(accountRoom(accountId)).emit('conversation:update', serializeConversation(conversationId));
    ack?.({ ok: true, message });
  });

  socket.on('typing', ({ typing } = {}) => {
    socket.to(convRoom(conversationId)).emit('typing', {
      conversationId, who: 'visitor', typing: Boolean(typing),
    });
    io.to(accountRoom(accountId)).emit('typing', {
      conversationId, who: 'visitor', typing: Boolean(typing),
    });
  });

  socket.on('read', () => markReadByVisitor(conversationId));

  socket.on('disconnect', () => {
    const left = (visitorSockets.get(conversationId) || 1) - 1;
    if (left <= 0) visitorSockets.delete(conversationId);
    else visitorSockets.set(conversationId, left);

    const online = left > 0;
    io.to(convRoom(conversationId)).emit('visitor:presence', { conversationId, online });
    io.to(accountRoom(accountId)).emit('visitor:presence', { conversationId, online });
  });
}

export const isVisitorOnline = (conversationId) => (visitorSockets.get(conversationId) || 0) > 0;
