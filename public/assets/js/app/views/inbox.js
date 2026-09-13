/* Inbox agent: daftar percakapan, thread realtime, dan panel detail pengunjung. */

import { $, api, clockTime, dayLabel, debounce, escapeHtml, formatMessage, initials, timeAgo, toast } from '../../ui.js';
import {
  activeConversation, emitTyping, loadCanned, loadConversations, loadTeam,
  on, openConversation, sendMessage, store,
} from '../store.js';

const TABS = [
  { key: 'active', label: 'Aktif' },
  { key: 'queued', label: 'Antrean', counter: 'queued' },
  { key: 'mine',   label: 'Saya',    counter: 'mine' },
  { key: 'closed', label: 'Selesai' },
];

export function renderInbox(host) {
  host.innerHTML = `
    <div class="inbox" id="inbox">
      <!-- Daftar percakapan -->
      <aside class="conv-list">
        <div class="cl-head">
          <div class="cl-title">
            <h2>Inbox</h2>
            <span class="badge badge-brand badge-dot" id="socketBadge">Realtime</span>
          </div>
          <div class="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input id="convSearch" placeholder="Cari nama, email, atau isi chat…" aria-label="Cari percakapan">
          </div>
        </div>
        <div class="cl-tabs" id="clTabs"></div>
        <div class="cl-body" id="convBody"></div>
      </aside>

      <!-- Thread -->
      <section class="thread" id="thread"></section>

      <!-- Detail pengunjung -->
      <aside class="details" id="details"></aside>
    </div>`;

  renderTabs();
  paintList();
  paintThread();

  $('#convSearch').addEventListener('input', debounce(async (event) => {
    store.filters.q = event.target.value.trim();
    await loadConversations();
  }, 320));

  $('#convBody').addEventListener('click', (event) => {
    const item = event.target.closest('[data-conv]');
    if (item) selectConversation(item.dataset.conv);
  });

  loadConversations().catch(() => toast('Gagal memuat percakapan.', 'error'));
  if (!store.canned.length) loadCanned().catch(() => {});
  if (!store.team.length) loadTeam().catch(() => {});

  /* --------------------------- Langganan event -------------------------- */
  const off = [
    on('conversations', paintList),
    on('counters', renderTabs),
    on('message:new', (message) => {
      if (message.conversationId !== store.activeId) return;
      appendMessage(message);
    }),
    on('typing', ({ conversationId }) => { if (conversationId === store.activeId) paintTyping(); }),
    on('visitor:presence', ({ conversationId }) => {
      if (conversationId === store.activeId) paintThreadHeader();
      paintList();
    }),
    on('conversation:update', (conversation) => {
      if (conversation.id === store.activeId) { paintThreadHeader(); paintDetails(); }
    }),
    on('socket', ({ connected }) => {
      const badge = $('#socketBadge');
      if (!badge) return;
      badge.className = `badge badge-dot ${connected ? 'badge-brand' : 'badge-danger'}`;
      badge.textContent = connected ? 'Realtime' : 'Terputus';
    }),
  ];
  host.addEventListener('view:destroy', () => off.forEach((fn) => fn()), { once: true });
}

/* ---------------------------------------------------------------------- */
/* Daftar percakapan                                                       */
/* ---------------------------------------------------------------------- */

function renderTabs() {
  const host = $('#clTabs');
  if (!host) return;
  host.innerHTML = TABS.map((tab) => {
    const isActive = (tab.key === 'mine' && store.filters.mine)
      || (tab.key !== 'mine' && !store.filters.mine && store.filters.status === tab.key);
    const count = tab.counter ? store.counters[tab.counter] || 0 : 0;
    return `<button class="cl-tab ${isActive ? 'active' : ''}" data-tab="${tab.key}">
      ${tab.label}${count ? `<span>${count}</span>` : ''}</button>`;
  }).join('');

  host.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', async () => {
      const key = button.dataset.tab;
      store.filters.mine = key === 'mine';
      store.filters.status = key === 'mine' ? 'active' : key;
      renderTabs();
      await loadConversations();
    });
  });
}

function paintList() {
  const host = $('#convBody');
  if (!host) return;

  if (!store.conversations.length) {
    host.innerHTML = `
      <div class="empty-state">
        <div class="es-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
        <h3>Belum ada percakapan</h3>
        <p>Chat dari widget website dan direct link akan muncul di sini secara otomatis.</p>
      </div>`;
    return;
  }

  host.innerHTML = store.conversations.map((conversation) => {
    const online = store.visitorOnline.has(conversation.id);
    const isTyping = store.typing.has(conversation.id);
    const preview = isTyping ? '<em style="color:var(--brand-600)">sedang mengetik…</em>'
      : escapeHtml(conversation.lastMessage?.body || 'Percakapan baru dimulai');
    const statusLabel = { queued: 'Antrean', open: 'Aktif', closed: 'Selesai' }[conversation.status];

    return `
      <button class="conv-item ${conversation.id === store.activeId ? 'active' : ''} ${conversation.unreadAgent ? 'unread' : ''}"
              data-conv="${conversation.id}">
        <span class="avatar avatar-ring ${online ? 'is-online' : ''}" style="background:${pickColor(conversation.id)}">
          ${escapeHtml(initials(conversation.displayName))}
        </span>
        <span class="ci-main">
          <span class="ci-top">
            <span class="ci-name">${escapeHtml(conversation.displayName)}</span>
            <span class="ci-time">${timeAgo(conversation.lastMessageAt || conversation.startedAt)}</span>
          </span>
          <span class="ci-preview">${conversation.lastMessage?.senderType === 'agent' ? 'Anda: ' : ''}${preview}</span>
          <span class="ci-meta">
            <span class="ci-chip ${conversation.status}">${statusLabel}</span>
            ${conversation.agentName ? `<span class="ci-chip">${escapeHtml(conversation.agentName.split(' ')[0])}</span>` : ''}
            ${conversation.unreadAgent ? `<span class="ci-unread">${conversation.unreadAgent}</span>` : ''}
          </span>
        </span>
      </button>`;
  }).join('');
}

async function selectConversation(id) {
  $('#inbox')?.classList.add('has-active');
  try {
    await openConversation(id);
    paintThread();
    paintList();
  } catch {
    toast('Gagal membuka percakapan.', 'error');
  }
}

/* ---------------------------------------------------------------------- */
/* Thread                                                                  */
/* ---------------------------------------------------------------------- */

function paintThread() {
  const host = $('#thread');
  if (!host) return;
  const conversation = activeConversation();

  if (!conversation) {
    host.innerHTML = `
      <div class="empty-state" style="margin:auto">
        <div class="es-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 1 1-4.2-7.6L21 3v9z"/></svg></div>
        <h3>Pilih percakapan</h3>
        <p>Klik salah satu chat di daftar sebelah kiri untuk mulai membalas pengunjung Anda.</p>
      </div>`;
    $('#details').innerHTML = '';
    return;
  }

  host.innerHTML = `
    <header class="th-head" id="thHead"></header>
    <div class="th-body" id="thBody"></div>
    <footer class="th-foot">
      <div class="canned-pop" id="cannedPop"></div>
      <div class="composer-bar">
        <textarea class="composer-area" id="composer" rows="1" placeholder="Tulis balasan… ketik # untuk balasan cepat"></textarea>
        <button class="send-round" id="sendBtn" disabled aria-label="Kirim balasan">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div class="composer-hint">
        <span><b class="kbd">Enter</b> kirim</span>
        <span><b class="kbd">Shift</b> + <b class="kbd">Enter</b> baris baru</span>
        <span><b class="kbd">#</b> balasan cepat</span>
      </div>
    </footer>`;

  paintThreadHeader();
  paintMessages();
  paintDetails();
  setupComposer();
}

function paintThreadHeader() {
  const host = $('#thHead');
  const conversation = activeConversation();
  if (!host || !conversation) return;

  const online = store.visitorOnline.has(conversation.id);
  const closed = conversation.status === 'closed';

  host.innerHTML = `
    <button class="act-btn icon-only mobile-back" id="backBtn" aria-label="Kembali ke daftar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
    </button>
    <span class="avatar avatar-ring ${online ? 'is-online' : ''}" style="background:${pickColor(conversation.id)}">
      ${escapeHtml(initials(conversation.displayName))}
    </span>
    <div class="th-id">
      <div class="th-name">
        ${escapeHtml(conversation.displayName)}
        ${conversation.rating === 1 ? '<span class="badge badge-success">👍 Puas</span>' : ''}
        ${conversation.rating === -1 ? '<span class="badge badge-danger">👎 Kurang</span>' : ''}
      </div>
      <div class="th-sub">
        ${online ? '<span class="live">● Online sekarang</span>' : `<span>Terakhir aktif ${timeAgo(conversation.visitor.lastSeenAt)}</span>`}
        <span>·</span><span>${escapeHtml(conversation.projectName)}</span>
        <span>·</span><span>${conversation.source === 'direct-link' ? 'Direct link' : 'Widget'}</span>
      </div>
    </div>
    <div class="th-actions">
      <select class="act-btn" id="assignSelect" style="padding-right:8px" aria-label="Tugaskan agent">
        <option value="">Belum ditugaskan</option>
        ${store.team.map((member) => `<option value="${member.id}" ${member.id === conversation.assignedTo ? 'selected' : ''}>${escapeHtml(member.name)}</option>`).join('')}
      </select>
      <a class="act-btn icon-only" href="/api/conversations/${conversation.id}/transcript" title="Unduh transkrip" download>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </a>
      <button class="act-btn ${closed ? '' : 'danger'}" id="toggleStatus">
        ${closed
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9"/><polyline points="3 4 3 10 9 10"/></svg> Buka lagi'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg> Tutup chat'}
      </button>
      <button class="act-btn icon-only" id="detailsBtn" aria-label="Info pengunjung" title="Info pengunjung">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
      </button>
    </div>`;

  $('#backBtn').addEventListener('click', () => {
    store.activeId = null;
    $('#inbox').classList.remove('has-active');
    paintThread(); paintList();
  });

  $('#detailsBtn').addEventListener('click', () => $('#details').classList.toggle('show'));

  $('#assignSelect').addEventListener('change', async (event) => {
    try {
      await api(`/api/conversations/${conversation.id}`, { method: 'PATCH', body: { assignedTo: event.target.value || null } });
      toast(event.target.value ? 'Percakapan dialihkan.' : 'Penugasan dilepas.', 'success');
    } catch (error) { toast(error.message, 'error'); }
  });

  $('#toggleStatus').addEventListener('click', async () => {
    try {
      await api(`/api/conversations/${conversation.id}`, {
        method: 'PATCH',
        body: { status: closed ? 'open' : 'closed' },
      });
      toast(closed ? 'Percakapan dibuka kembali.' : 'Percakapan ditutup.', 'success');
    } catch (error) { toast(error.message, 'error'); }
  });
}

function paintMessages() {
  const host = $('#thBody');
  if (!host) return;
  host.innerHTML = '';

  let lastDay = '';
  let previous = null;
  for (const message of store.messages) {
    const day = dayLabel(message.createdAt);
    if (day !== lastDay) {
      lastDay = day;
      previous = null;
      const separator = document.createElement('div');
      separator.className = 'th-day';
      separator.innerHTML = `<span>${escapeHtml(day)}</span>`;
      host.appendChild(separator);
    }
    host.appendChild(messageNode(message, previous));
    previous = message;
  }
  paintTyping();
  host.scrollTop = host.scrollHeight;
}

function messageNode(message, previous) {
  const node = document.createElement('div');
  const mine = message.senderType === 'agent';
  const system = message.senderType === 'system';
  const stacked = previous && previous.senderType === message.senderType && previous.senderId === message.senderId
    && (new Date(message.createdAt) - new Date(previous.createdAt)) < 5 * 60 * 1000;

  node.className = `th-msg${mine ? ' mine' : ''}${system ? ' sys' : ''}${stacked ? ' stack' : ''}`;
  node.dataset.id = message.id;

  if (system) {
    node.innerHTML = `<div class="tm-col"><div class="tm-bubble">${formatMessage(message.body)}</div></div>`;
    return node;
  }

  node.innerHTML = `
    <span class="avatar avatar-sm" style="background:${escapeHtml(message.senderColor || '#6D5EF8')}">${escapeHtml(initials(message.senderName || '?'))}</span>
    <div class="tm-col">
      <div class="tm-who">${escapeHtml(message.senderName || 'Pengunjung')}</div>
      <div class="tm-bubble">${formatMessage(message.body)}</div>
      <div class="tm-time">${clockTime(message.createdAt)}</div>
    </div>`;
  return node;
}

function appendMessage(message) {
  const host = $('#thBody');
  if (!host) return;
  if (host.querySelector(`[data-id="${message.id}"]`)) return;
  const atBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 140;
  host.querySelector('#typingRow')?.remove();
  const previous = store.messages[store.messages.length - 2] || null;
  host.appendChild(messageNode(message, previous));
  paintTyping();
  if (atBottom || message.senderType === 'agent') host.scrollTop = host.scrollHeight;
}

function paintTyping() {
  const host = $('#thBody');
  if (!host) return;
  host.querySelector('#typingRow')?.remove();
  if (!store.typing.has(store.activeId)) return;

  const conversation = activeConversation();
  const row = document.createElement('div');
  row.className = 'th-typing';
  row.id = 'typingRow';
  row.innerHTML = `
    <span class="avatar avatar-sm" style="background:${pickColor(store.activeId)}">${escapeHtml(initials(conversation?.displayName || '?'))}</span>
    <div class="bubble-dots"><i></i><i></i><i></i></div>`;
  host.appendChild(row);
  host.scrollTop = host.scrollHeight;
}

/* ---------------------------------------------------------------------- */
/* Composer + balasan cepat                                                */
/* ---------------------------------------------------------------------- */

function setupComposer() {
  const area = $('#composer');
  const sendBtn = $('#sendBtn');
  const pop = $('#cannedPop');
  let typingTimer = null;
  let selected = 0;

  const autosize = () => { area.style.height = 'auto'; area.style.height = `${Math.min(area.scrollHeight, 160)}px`; };

  const matches = () => {
    const match = area.value.match(/(^|\s)#([\w-]*)$/);
    if (!match) return null;
    const query = match[2].toLowerCase();
    return store.canned.filter((item) =>
      item.shortcut.toLowerCase().includes(query) || item.title.toLowerCase().includes(query)).slice(0, 6);
  };

  function paintCanned() {
    const list = matches();
    if (!list || !list.length) { pop.classList.remove('show'); return; }
    selected = Math.min(selected, list.length - 1);
    pop.innerHTML = list.map((item, index) => `
      <button class="canned-item ${index === selected ? 'sel' : ''}" data-canned="${item.id}">
        <b>${escapeHtml(item.title)} <code>${escapeHtml(item.shortcut)}</code></b>
        <span>${escapeHtml(item.body)}</span>
      </button>`).join('');
    pop.classList.add('show');
    pop.querySelectorAll('[data-canned]').forEach((button) =>
      button.addEventListener('click', () => insertCanned(button.dataset.canned)));
  }

  function insertCanned(id) {
    const item = store.canned.find((c) => c.id === id);
    if (!item) return;
    area.value = area.value.replace(/(^|\s)#([\w-]*)$/, (full, prefix) => `${prefix}${item.body}`);
    pop.classList.remove('show');
    area.focus();
    autosize();
    sendBtn.disabled = !area.value.trim();
  }

  area.addEventListener('input', () => {
    autosize();
    sendBtn.disabled = !area.value.trim();
    selected = 0;
    paintCanned();
    emitTyping(store.activeId, Boolean(area.value.trim()));
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => emitTyping(store.activeId, false), 1800);
  });

  area.addEventListener('keydown', (event) => {
    const list = matches();
    if (pop.classList.contains('show') && list?.length) {
      if (event.key === 'ArrowDown') { event.preventDefault(); selected = (selected + 1) % list.length; paintCanned(); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); selected = (selected - 1 + list.length) % list.length; paintCanned(); return; }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault(); insertCanned(list[selected].id); return;
      }
      if (event.key === 'Escape') { pop.classList.remove('show'); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
  });

  async function submit() {
    const body = area.value.trim();
    if (!body) return;
    area.value = '';
    autosize();
    sendBtn.disabled = true;
    pop.classList.remove('show');
    emitTyping(store.activeId, false);
    try {
      const message = await sendMessage(store.activeId, body);
      if (!store.messages.some((m) => m.id === message.id)) store.messages.push(message);
      appendMessage(message);
    } catch (error) {
      toast(error.message, 'error');
      area.value = body;
      autosize();
    }
  }

  sendBtn.addEventListener('click', submit);
  document.addEventListener('click', (event) => {
    if (!pop.contains(event.target) && event.target !== area) pop.classList.remove('show');
  });
  setTimeout(() => area.focus(), 120);
}

/* ---------------------------------------------------------------------- */
/* Panel detail pengunjung                                                 */
/* ---------------------------------------------------------------------- */

function paintDetails() {
  const host = $('#details');
  const conversation = activeConversation();
  if (!host || !conversation) return;
  const visitor = conversation.visitor;

  host.innerHTML = `
    <div class="dt-hero">
      <span class="avatar avatar-lg avatar-ring ${store.visitorOnline.has(conversation.id) ? 'is-online' : ''}"
            style="background:${pickColor(conversation.id)}">${escapeHtml(initials(conversation.displayName))}</span>
      <h3>${escapeHtml(conversation.displayName)}</h3>
      <p>${escapeHtml(visitor.email || 'Email belum diisi')}</p>
      <div class="row gap-8" style="justify-content:center">
        ${visitor.email ? `<a class="act-btn" href="mailto:${escapeHtml(visitor.email)}">Email</a>` : ''}
        <span class="badge ${conversation.status === 'closed' ? '' : 'badge-success'}">${
          { queued: 'Menunggu', open: 'Sedang berjalan', closed: 'Selesai' }[conversation.status]}</span>
      </div>
    </div>

    ${conversation.prechat?.length ? `
    <div class="dt-block">
      <h4>Jawaban form pre-chat</h4>
      ${conversation.prechat.map((answer) => `
        <div class="dt-row"><span class="k">${escapeHtml(answer.label)}</span><span class="v">${escapeHtml(answer.value)}</span></div>`).join('')}
    </div>` : ''}

    <div class="dt-block">
      <h4>Konteks kunjungan</h4>
      <div class="dt-row"><span class="k">Halaman</span><span class="v">${
        visitor.currentUrl ? `<a href="${escapeHtml(visitor.currentUrl)}" target="_blank" rel="noopener">${escapeHtml(visitor.pageTitle || visitor.currentUrl)}</a>` : '—'}</span></div>
      <div class="dt-row"><span class="k">Referrer</span><span class="v">${escapeHtml(shortUrl(visitor.referrer) || 'Langsung')}</span></div>
      <div class="dt-row"><span class="k">Kunjungan</span><span class="v">${visitor.visits || 1}×</span></div>
      <div class="dt-row"><span class="k">Mulai chat</span><span class="v">${new Date(conversation.startedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
    </div>

    <div class="dt-block">
      <h4>Perangkat</h4>
      <div class="dt-row"><span class="k">Browser</span><span class="v">${escapeHtml(visitor.browser || '—')}</span></div>
      <div class="dt-row"><span class="k">Sistem</span><span class="v">${escapeHtml(visitor.os || '—')}</span></div>
      <div class="dt-row"><span class="k">Tipe</span><span class="v">${escapeHtml(visitor.device || '—')}</span></div>
      <div class="dt-row"><span class="k">Bahasa</span><span class="v">${escapeHtml(visitor.locale || '—')}</span></div>
      <div class="dt-row"><span class="k">Zona waktu</span><span class="v">${escapeHtml(visitor.timezone || '—')}</span></div>
      <div class="dt-row"><span class="k">IP</span><span class="v">${escapeHtml(visitor.ip || '—')}</span></div>
    </div>

    <div class="dt-block">
      <h4>Tag</h4>
      <div class="tag-row" id="tagRow">
        ${conversation.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}<button data-untag="${escapeHtml(tag)}" aria-label="Hapus tag">×</button></span>`).join('')}
        <button class="tag-add" id="addTag">+ Tambah</button>
      </div>
    </div>

    <div class="dt-block">
      <h4>Catatan internal</h4>
      <div id="noteList">
        ${store.notes.map((note) => `
          <div class="note-item">
            <p>${escapeHtml(note.body)}</p>
            <span>${escapeHtml(note.authorName)} · ${timeAgo(note.createdAt)}</span>
          </div>`).join('') || '<p style="font-size:13px;color:var(--slate-400);margin:0 0 12px">Belum ada catatan.</p>'}
      </div>
      <div class="note-form">
        <textarea id="noteInput" placeholder="Catatan hanya terlihat oleh tim…"></textarea>
        <button class="btn btn-soft btn-sm btn-block" id="noteSave" style="margin-top:8px">Simpan catatan</button>
      </div>
    </div>`;

  host.querySelectorAll('[data-untag]').forEach((button) => {
    button.addEventListener('click', () => updateTags(conversation.tags.filter((t) => t !== button.dataset.untag)));
  });

  $('#addTag').addEventListener('click', () => {
    const tag = prompt('Nama tag baru:');
    if (tag?.trim()) updateTags([...conversation.tags, tag.trim().toLowerCase()]);
  });

  $('#noteSave').addEventListener('click', async () => {
    const input = $('#noteInput');
    const body = input.value.trim();
    if (!body) return;
    try {
      const { note } = await api(`/api/conversations/${conversation.id}/notes`, { method: 'POST', body: { body } });
      store.notes.push(note);
      input.value = '';
      paintDetails();
      toast('Catatan tersimpan.', 'success');
    } catch (error) { toast(error.message, 'error'); }
  });

  async function updateTags(tags) {
    try {
      await api(`/api/conversations/${conversation.id}`, { method: 'PATCH', body: { tags } });
      conversation.tags = [...new Set(tags)];
      paintDetails();
    } catch (error) { toast(error.message, 'error'); }
  }
}

/* ------------------------------ Utilitas ------------------------------ */
const PALETTE = ['#6D5EF8', '#FF7A45', '#12B886', '#F2385A', '#2D9CDB', '#9B51E0', '#F2994A', '#0E8F69'];

function pickColor(seed = '') {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function shortUrl(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url.slice(0, 40); }
}
