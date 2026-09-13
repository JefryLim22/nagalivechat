/* Bootstrap agent workspace: navigasi rail, router, dan koneksi realtime. */

import { $, api, initials, toast } from '../ui.js';
import { connectRealtime, emit, loadSession, on, openConversation, setPresence, store } from './store.js';

import { renderInbox } from './views/inbox.js';
import { renderReports } from './views/reports.js';
import { renderInstall } from './views/install.js';
import { renderTeam } from './views/team.js';
import { renderCanned } from './views/canned.js';
import { renderSettings } from './views/settings.js';

const ICONS = {
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  reports: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  install: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  team: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  canned: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};

const ROUTES = [
  { path: 'inbox',    label: 'Inbox',         icon: 'inbox',    render: renderInbox,    counter: true },
  { path: 'reports',  label: 'Laporan',       icon: 'reports',  render: renderReports },
  { path: 'install',  label: 'Widget & Kode', icon: 'install',  render: renderInstall },
  { path: 'canned',   label: 'Balasan Cepat', icon: 'canned',   render: renderCanned },
  { path: 'team',     label: 'Tim Agent',     icon: 'team',     render: renderTeam },
  { path: 'settings', label: 'Pengaturan',    icon: 'settings', render: renderSettings },
];

const main = $('#main');
let currentPath = '';
let currentHost = null;

/* ------------------------------ Navigasi ----------------------------- */
function renderRail() {
  $('#railNav').innerHTML = ROUTES.map((route) => `
    <button class="rail-btn" data-route="${route.path}" aria-label="${route.label}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[route.icon]}</svg>
      ${route.counter ? '<span class="count" data-inbox-count>0</span>' : ''}
      <span class="rail-tip">${route.label}</span>
    </button>`).join('');

  $('#railNav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-route]');
    if (button) navigate(button.dataset.route);
  });
}

export function navigate(path, { replace = false } = {}) {
  const route = ROUTES.find((r) => r.path === path) || ROUTES[0];
  const url = `/app/${route.path}`;
  if (replace) history.replaceState({}, '', url);
  else if (location.pathname !== url) history.pushState({}, '', url);

  currentPath = route.path;
  document.querySelectorAll('[data-route]').forEach((button) =>
    button.classList.toggle('active', button.dataset.route === route.path));

  // Beri tahu view lama agar melepas langganan store-nya sebelum diganti,
  // supaya handler tidak menumpuk setiap kali berpindah menu.
  currentHost?.dispatchEvent(new CustomEvent('view:destroy'));

  main.innerHTML = '';
  currentHost = document.createElement('div');
  currentHost.style.display = 'contents';
  main.appendChild(currentHost);
  route.render(currentHost);
}

window.addEventListener('popstate', () => {
  const path = location.pathname.replace('/app', '').replace(/\//g, '') || 'inbox';
  if (path !== currentPath) navigate(path, { replace: true });
});

/* ---------------------------- Menu profil ---------------------------- */
function setupProfileMenu() {
  const button = $('#presenceBtn');
  const menu = $('#railMenu');

  button.addEventListener('click', (event) => { event.stopPropagation(); menu.classList.toggle('show'); });
  document.addEventListener('click', () => menu.classList.remove('show'));
  menu.addEventListener('click', (event) => event.stopPropagation());

  menu.addEventListener('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    if (target.dataset.presence) {
      setPresence(target.dataset.presence);
      paintPresence();
      menu.classList.remove('show');
      toast(`Status diubah menjadi ${target.dataset.presence}.`, 'success');
    }
    if (target.dataset.action === 'logout') {
      await api('/api/auth/logout', { method: 'POST' });
      location.href = '/login';
    }
    if (target.dataset.action === 'profile') {
      menu.classList.remove('show');
      navigate('settings');
    }
  });
}

function paintPresence() {
  const button = $('#presenceBtn');
  button.classList.remove('is-online', 'is-away');
  if (store.me.presence === 'online') button.classList.add('is-online');
  if (store.me.presence === 'away') button.classList.add('is-away');
}

/* ------------------------- Badge & notifikasi ------------------------ */
on('counters', (counters) => {
  const badge = document.querySelector('[data-inbox-count]');
  if (!badge) return;
  const total = (counters.queued || 0) + (counters.open || 0);
  badge.textContent = total > 99 ? '99+' : String(total);
  badge.classList.toggle('show', total > 0);
  document.title = total > 0 ? `(${total}) Agent Workspace — NagaLiveChat` : 'Agent Workspace — NagaLiveChat';
});

on('conversation:new', (conversation) => {
  if (currentPath !== 'inbox') toast(`Chat baru dari ${conversation.displayName}`, 'success');
  chime();
  markNotified(conversation.id, conversation.lastMessage?.createdAt);
  desktopNotify({
    title: `💬 Chat baru — ${conversation.displayName}`,
    body: conversation.lastMessage?.body || 'Pengunjung baru memulai percakapan.',
    conversationId: conversation.id,
  });
});

on('message:any', (message) => {
  if (message.senderType !== 'visitor') return;
  const isActive = message.conversationId === store.activeId;
  if (!isActive) chime();
  /* Chat yang sedang dibuka di layar tidak perlu notifikasi, kecuali tab
     sedang tidak terlihat — agent mungkin sedang di jendela lain. */
  if (isActive && !document.hidden) return markNotified(message.conversationId, message.createdAt);
  notifyVisitorMessage(message.conversationId, message.body, message.createdAt);
});

/* Pesan pada percakapan yang belum dibuka agent tidak lewat 'message:any'
   (socket-nya belum join room percakapan itu) — hanya ringkasannya yang
   ikut di 'conversation:update'. Tanpa cabang ini, chat yang menunggu di
   antrean tidak pernah memunculkan notifikasi. */
on('conversation:update', (conversation) => {
  const last = conversation.lastMessage;
  if (!last || last.senderType !== 'visitor') return;
  if (conversation.id === store.activeId && !document.hidden) return;
  notifyVisitorMessage(conversation.id, last.body, last.createdAt, conversation.displayName);
});

/* --------------------- Notifikasi desktop (browser) ------------------- */
const NOTIFY_KEY = 'naga.desktopNotify';
const notifySupported = 'Notification' in window;
let notifyEnabled = localStorage.getItem(NOTIFY_KEY) !== '0';

/* Pesan yang sama bisa tiba lewat dua jalur; ingat yang terakhir agar
   agent tidak menerima notifikasi dobel. */
const lastNotified = new Map();

function markNotified(conversationId, stamp) {
  if (conversationId && stamp) lastNotified.set(conversationId, stamp);
}

function notifyVisitorMessage(conversationId, body, stamp, fallbackName) {
  if (stamp && lastNotified.get(conversationId) === stamp) return;
  markNotified(conversationId, stamp);
  const conversation = store.conversations.find((c) => c.id === conversationId);
  desktopNotify({
    title: `💬 ${conversation?.displayName || fallbackName || 'Pesan baru'}`,
    body,
    conversationId,
  });
}

function notifyActive() {
  return notifySupported && notifyEnabled && Notification.permission === 'granted';
}

function desktopNotify({ title, body, conversationId }) {
  if (!notifyActive()) return;
  try {
    /* tag = id percakapan: notifikasi dari chat yang sama saling menimpa
       alih-alih menumpuk memenuhi layar. silent karena chime() sudah bunyi. */
    const notification = new Notification(title, {
      body: String(body || '').slice(0, 180),
      tag: conversationId || 'naga',
      icon: '/assets/img/favicon.svg',
      silent: true,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      if (!conversationId) return;
      navigate('inbox');
      openConversation(conversationId).catch(() => {});
    };
    setTimeout(() => notification.close(), 15000);
  } catch { /* beberapa browser melarang konstruktor Notification */ }
}

function paintNotifyButton() {
  const button = $('#notifyBtn');
  if (!button) return;
  const permission = notifySupported ? Notification.permission : 'unsupported';
  const state = permission === 'granted' ? (notifyEnabled ? 'on' : 'off') : permission;
  button.dataset.state = state;
  button.classList.toggle('is-on', state === 'on');
  button.setAttribute('aria-label', {
    on: 'Notifikasi desktop aktif — klik untuk mematikan',
    off: 'Notifikasi desktop nonaktif — klik untuk menyalakan',
    default: 'Aktifkan notifikasi desktop untuk chat masuk',
    denied: 'Notifikasi diblokir di setelan browser',
    unsupported: 'Browser ini tidak mendukung notifikasi desktop',
  }[state]);
  button.querySelector('.rail-tip').textContent = {
    on: 'Notifikasi: aktif',
    off: 'Notifikasi: mati',
    default: 'Aktifkan notifikasi',
    denied: 'Notifikasi diblokir',
    unsupported: 'Tidak didukung',
  }[state];
}

async function toggleNotify() {
  if (!notifySupported) return toast('Browser ini tidak mendukung notifikasi desktop.', 'error');

  if (Notification.permission === 'denied') {
    toast('Notifikasi diblokir. Izinkan lewat ikon gembok di address bar browser.', 'error');
    return;
  }

  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    paintNotifyButton();
    if (result !== 'granted') return toast('Izin notifikasi tidak diberikan.', 'error');
    notifyEnabled = true;
    localStorage.setItem(NOTIFY_KEY, '1');
    paintNotifyButton();
    desktopNotify({ title: '🐉 NagaLiveChat', body: 'Notifikasi chat masuk sudah aktif.' });
    return;
  }

  notifyEnabled = !notifyEnabled;
  localStorage.setItem(NOTIFY_KEY, notifyEnabled ? '1' : '0');
  paintNotifyButton();
  toast(notifyEnabled ? 'Notifikasi desktop dinyalakan.' : 'Notifikasi desktop dimatikan.', 'success');
}

/* Nada notifikasi pendek tanpa file audio. */
let audioContext = null;
function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioContext = audioContext || new Ctx();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(760, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1180, audioContext.currentTime + .08);
    gain.gain.setValueAtTime(.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.1, audioContext.currentTime + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .28);
    osc.start(); osc.stop(audioContext.currentTime + .3);
  } catch { /* kebijakan autoplay browser */ }
}

/* ------------------------------- Start ------------------------------- */
(async function start() {
  try {
    await loadSession();
  } catch {
    location.href = '/login';
    return;
  }

  $('#meAvatar').textContent = initials(store.me.name);
  $('#meAvatar').style.background = store.me.avatarColor;
  $('#meName').textContent = store.me.name;
  $('#meEmail').textContent = store.me.email;

  renderRail();
  setupProfileMenu();
  paintNotifyButton();
  $('#notifyBtn')?.addEventListener('click', toggleNotify);
  connectRealtime();

  store.me.presence = 'online';
  paintPresence();

  const path = location.pathname.replace('/app', '').replace(/\//g, '') || 'inbox';
  navigate(path, { replace: true });

  if (new URLSearchParams(location.search).get('welcome') === '1') {
    toast('Selamat datang! Ambil snippet pemasangan di menu Widget & Kode.', 'success');
    setTimeout(() => navigate('install'), 900);
  }
  emit('ready');
})();
