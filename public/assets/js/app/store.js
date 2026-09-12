/* State terpusat + koneksi realtime untuk agent workspace. */

import { api } from '../ui.js';

const listeners = new Map();

export const store = {
  me: null,
  account: null,
  projects: [],
  conversations: [],
  counters: { queued: 0, open: 0, closed: 0, mine: 0 },
  filters: { status: 'active', q: '', projectId: '', mine: false },
  activeId: null,
  messages: [],
  notes: [],
  canned: [],
  team: [],
  typing: new Map(),      // conversationId -> timestamp terakhir pengunjung mengetik
  visitorOnline: new Set(),
  socket: null,
};

/* ------------------------------ Pub/Sub ------------------------------ */
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((handler) => {
    try { handler(payload); } catch (error) { console.error(error); }
  });
}

/* ------------------------------- Data -------------------------------- */
export async function loadSession() {
  const data = await api('/api/auth/me');
  store.me = data.user;
  store.account = data.account;
  store.projects = data.projects;
  emit('session', data);
  return data;
}

export async function loadConversations() {
  const params = new URLSearchParams();
  params.set('status', store.filters.status);
  if (store.filters.q) params.set('q', store.filters.q);
  if (store.filters.projectId) params.set('projectId', store.filters.projectId);
  if (store.filters.mine) params.set('mine', '1');

  const data = await api(`/api/conversations?${params}`);
  store.conversations = data.conversations;
  store.counters = data.counters;
  data.conversations.forEach((conversation) => {
    if (conversation.visitorOnline) store.visitorOnline.add(conversation.id);
  });
  emit('conversations', store.conversations);
  emit('counters', store.counters);
  return data;
}

export async function openConversation(id) {
  store.activeId = id;
  const data = await api(`/api/conversations/${id}`);
  store.messages = data.messages;
  store.notes = data.notes;

  const index = store.conversations.findIndex((c) => c.id === id);
  if (index >= 0) store.conversations[index] = { ...store.conversations[index], ...data.conversation, unreadAgent: 0 };
  else store.conversations.unshift(data.conversation);

  if (data.conversation.visitorOnline) store.visitorOnline.add(id);
  store.socket?.emit('conversation:join', { conversationId: id });

  emit('conversation:opened', data.conversation);
  emit('conversations', store.conversations);
  return data;
}

export const activeConversation = () => store.conversations.find((c) => c.id === store.activeId) || null;

export async function loadCanned() {
  const { responses } = await api('/api/canned');
  store.canned = responses;
  emit('canned', responses);
  return responses;
}

export async function loadTeam() {
  const { members } = await api('/api/team');
  store.team = members;
  emit('team', members);
  return members;
}

/* ----------------------------- Realtime ------------------------------ */
export function connectRealtime() {
  if (store.socket || typeof window.io !== 'function') return;

  const socket = window.io({ transports: ['websocket', 'polling'] });
  store.socket = socket;

  socket.on('connect', () => emit('socket', { connected: true }));
  socket.on('disconnect', () => emit('socket', { connected: false }));

  socket.on('conversation:new', (conversation) => {
    const index = store.conversations.findIndex((c) => c.id === conversation.id);
    if (index >= 0) store.conversations[index] = conversation;
    else store.conversations.unshift(conversation);
    emit('conversations', store.conversations);
    emit('conversation:new', conversation);
    refreshCounters();
  });

  socket.on('conversation:update', (conversation) => {
    const index = store.conversations.findIndex((c) => c.id === conversation.id);
    if (index >= 0) store.conversations[index] = { ...store.conversations[index], ...conversation };
    else store.conversations.unshift(conversation);
    emit('conversations', store.conversations);
    emit('conversation:update', conversation);
    refreshCounters();
  });

  socket.on('message:new', (message) => {
    if (message.conversationId === store.activeId) {
      if (!store.messages.some((m) => m.id === message.id)) store.messages.push(message);
      emit('message:new', message);
    }
    emit('message:any', message);
  });

  socket.on('typing', ({ conversationId, who, typing }) => {
    if (who !== 'visitor') return;
    if (typing) store.typing.set(conversationId, Date.now());
    else store.typing.delete(conversationId);
    emit('typing', { conversationId, typing });
  });

  socket.on('visitor:presence', ({ conversationId, online }) => {
    online ? store.visitorOnline.add(conversationId) : store.visitorOnline.delete(conversationId);
    emit('visitor:presence', { conversationId, online });
  });

  socket.on('presence:team', (payload) => emit('presence:team', payload));
  socket.on('offline:new', (payload) => emit('offline:new', payload));
}

let counterTimer = null;
function refreshCounters() {
  clearTimeout(counterTimer);
  counterTimer = setTimeout(async () => {
    try {
      const data = await api('/api/conversations?status=active');
      store.counters = data.counters;
      emit('counters', store.counters);
    } catch { /* abaikan */ }
  }, 600);
}

export function setPresence(presence) {
  store.me.presence = presence;
  store.socket?.emit('agent:presence', { presence });
  emit('presence:self', presence);
}

export const sendMessage = (conversationId, body) =>
  new Promise((resolve, reject) => {
    if (!store.socket?.connected) {
      return api(`/api/conversations/${conversationId}/messages`, { method: 'POST', body: { body } })
        .then(({ message }) => resolve(message)).catch(reject);
    }
    store.socket.emit('message:send', { conversationId, body }, (ack) => {
      ack?.ok ? resolve(ack.message) : reject(new Error('Gagal mengirim pesan.'));
    });
  });

export const emitTyping = (conversationId, typing) =>
  store.socket?.emit('typing', { conversationId, typing });
