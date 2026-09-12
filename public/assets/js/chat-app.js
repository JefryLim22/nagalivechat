/* =====================================================================
   Mesin chat pengunjung.
   Dipakai oleh widget (di dalam iframe) dan halaman direct chat link.
   ===================================================================== */

import { clockTime, dayLabel, escapeHtml, formatMessage, initials } from './ui.js';

const EMOJIS = ['😊','😁','😂','🥰','😍','👍','🙏','🎉','🔥','💜','😅','😎','🤔','😢','😡','👋','✅','❌','💡','📦','💰','⏰','📞','🚀'];

export function createChatApp({ mount, license, mode = 'widget', lazy = false }) {
  const state = {
    settings: null,
    project: null,
    token: null,
    conversationId: null,
    messages: [],
    teamOnline: false,
    agents: [],
    socket: null,
    started: false,
    closed: false,
    rated: false,
    unread: 0,
    typingTimer: null,
    agentTyping: false,
    context: {},
    profile: loadProfile(),
  };

  const storageKey = (name) => `naga.${name}.${license}`;

  function loadProfile() {
    try { return JSON.parse(localStorage.getItem(`naga.profile.${license}`) || '{}'); }
    catch { return {}; }
  }
  function saveProfile(profile) {
    state.profile = { ...state.profile, ...profile };
    try { localStorage.setItem(`naga.profile.${license}`, JSON.stringify(state.profile)); } catch { /* ignore */ }
  }
  function visitorUid() {
    let uid = null;
    try { uid = localStorage.getItem(storageKey('uid')); } catch { /* ignore */ }
    if (!uid) {
      uid = 'v' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem(storageKey('uid'), uid); } catch { /* ignore */ }
    }
    return uid;
  }

  /* ------------------------------------------------------------------ */
  /* Kerangka DOM                                                        */
  /* ------------------------------------------------------------------ */
  mount.innerHTML = `
    <div class="chat-app">
      <header class="chat-head">
        <div class="ch-top">
          <div class="ch-avatar" data-avatar>💬</div>
          <div class="ch-meta">
            <div class="ch-name" data-company>Live Chat</div>
            <div class="ch-status" data-status><span class="dot"></span><span data-status-text>Menghubungkan…</span></div>
          </div>
          <div class="ch-actions">
            <button class="ch-btn" data-menu-btn aria-label="Menu lainnya" title="Menu lainnya">
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>
            </button>
            <button class="ch-btn" data-close-btn aria-label="Tutup chat" title="Tutup chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
        </div>
        <div class="ch-agents" data-agents hidden>
          <div class="stack-av" data-agent-avatars></div>
          <p data-agent-text></p>
        </div>
        <div class="ch-menu" data-menu>
          <button data-action="transcript">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Unduh transkrip
          </button>
          <button data-action="restart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Mulai chat baru
          </button>
          <button data-action="end" class="danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            Akhiri percakapan
          </button>
        </div>
      </header>

      <div class="chat-body" data-body>
        <div class="chat-loading"><div class="ring"></div></div>
      </div>

      <footer class="chat-foot composer-wrap" data-foot hidden>
        <div class="emoji-pop" data-emoji></div>
        <div class="quick-replies" data-quick hidden></div>
        <div class="composer">
          <button class="icon-btn" data-emoji-btn aria-label="Pilih emoji" title="Emoji">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          <textarea class="composer-input" data-input rows="1" placeholder="Tulis pesan Anda…" aria-label="Tulis pesan"></textarea>
          <button class="send-btn" data-send aria-label="Kirim pesan" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div class="branding" data-branding hidden>
          Didukung oleh <a href="/" target="_blank" rel="noopener">NagaLiveChat</a>
        </div>
      </footer>
    </div>`;

  const el = {
    app: mount.querySelector('.chat-app'),
    avatar: mount.querySelector('[data-avatar]'),
    company: mount.querySelector('[data-company]'),
    status: mount.querySelector('[data-status]'),
    statusText: mount.querySelector('[data-status-text]'),
    menuBtn: mount.querySelector('[data-menu-btn]'),
    menu: mount.querySelector('[data-menu]'),
    closeBtn: mount.querySelector('[data-close-btn]'),
    agents: mount.querySelector('[data-agents]'),
    agentAvatars: mount.querySelector('[data-agent-avatars]'),
    agentText: mount.querySelector('[data-agent-text]'),
    body: mount.querySelector('[data-body]'),
    foot: mount.querySelector('[data-foot]'),
    input: mount.querySelector('[data-input]'),
    send: mount.querySelector('[data-send]'),
    emoji: mount.querySelector('[data-emoji]'),
    emojiBtn: mount.querySelector('[data-emoji-btn]'),
    quick: mount.querySelector('[data-quick]'),
    branding: mount.querySelector('[data-branding]'),
  };

  /* ------------------------------------------------------------------ */
  /* Tema                                                                */
  /* ------------------------------------------------------------------ */
  function applyTheme(settings) {
    const color = settings.themeColor || '#6D5EF8';
    const accent = settings.accentColor || '#FF7A45';
    const header = settings.useGradient
      ? `linear-gradient(135deg, ${shade(color, 14)} 0%, ${color} 60%, ${shade(color, -12)} 100%)`
      : color;

    const style = document.documentElement.style;
    style.setProperty('--c-brand', color);
    style.setProperty('--c-brand-dark', shade(color, -12));
    style.setProperty('--c-brand-light', shade(color, 14));
    style.setProperty('--c-accent', accent);
    style.setProperty('--c-header', header);
    style.setProperty('--c-radius', { rounded: '18px', soft: '12px', square: '6px' }[settings.cornerStyle] || '18px');

    el.company.textContent = settings.companyName || 'Live Chat';
    el.avatar.innerHTML = settings.logoUrl
      ? `<img src="${escapeHtml(settings.logoUrl)}" alt="">`
      : escapeHtml(settings.avatarEmoji || '💬');
    el.input.placeholder = settings.placeholder || 'Tulis pesan Anda…';
    el.branding.hidden = settings.showBranding === false;
    if (mode === 'standalone') el.closeBtn.hidden = true;
  }

  function setStatus(online) {
    state.teamOnline = online;
    el.status.classList.toggle('is-online', online);
    el.statusText.textContent = online
      ? (state.settings?.tagline || 'Kami online sekarang')
      : 'Sedang offline — tinggalkan pesan';
  }

  function renderAgents() {
    const agents = state.agents || [];
    if (!agents.length || !state.teamOnline) { el.agents.hidden = true; return; }
    el.agents.hidden = false;
    el.agentAvatars.innerHTML = agents.slice(0, 4).map((agent) =>
      `<span style="background:${escapeHtml(agent.avatar_color || '#6D5EF8')}">${escapeHtml(initials(agent.name))}</span>`).join('');
    el.agentText.textContent = agents.length === 1
      ? `${agents[0].name} siap membantu Anda`
      : `${agents.length} agent siap membantu Anda`;
  }

  /* ------------------------------------------------------------------ */
  /* Render pesan                                                        */
  /* ------------------------------------------------------------------ */
  function renderMessages() {
    if (!state.messages.length) {
      el.body.innerHTML = '';
      greetingBubble();
      return;
    }
    const atBottom = isNearBottom();
    el.body.innerHTML = '';
    greetingBubble();

    let lastDay = '';
    let previous = null;
    for (const message of state.messages) {
      const day = dayLabel(message.createdAt);
      if (day !== lastDay) {
        lastDay = day;
        const separator = document.createElement('div');
        separator.className = 'day-sep';
        separator.innerHTML = `<span>${escapeHtml(day)}</span>`;
        el.body.appendChild(separator);
        previous = null;
      }
      el.body.appendChild(messageNode(message, previous));
      previous = message;
    }
    if (state.agentTyping) el.body.appendChild(typingNode());
    if (atBottom) scrollToBottom();
  }

  function greetingBubble() {
    const text = state.settings?.welcomeMessage;
    if (!text) return;
    const node = document.createElement('div');
    node.className = 'msg';
    node.innerHTML = `
      <div class="msg-av" style="background:var(--c-header)">${escapeHtml(state.settings.avatarEmoji || '💬')}</div>
      <div class="msg-col">
        <div class="msg-who">${escapeHtml(state.settings.companyName || 'Support')}</div>
        <div class="bubble">${formatMessage(text)}</div>
      </div>`;
    el.body.appendChild(node);
  }

  function messageNode(message, previous) {
    const node = document.createElement('div');
    const outgoing = message.senderType === 'visitor';
    const system = message.senderType === 'system';
    const stacked = previous
      && previous.senderType === message.senderType
      && previous.senderId === message.senderId
      && (new Date(message.createdAt) - new Date(previous.createdAt)) < 5 * 60 * 1000;

    node.className = `msg${outgoing ? ' out' : ''}${system ? ' system' : ''}${stacked ? ' stacked' : ''}`;
    node.dataset.id = message.id;

    if (system) {
      node.innerHTML = `<div class="msg-col"><div class="bubble">${formatMessage(message.body)}</div></div>`;
      return node;
    }

    const avatar = outgoing ? '' :
      `<div class="msg-av" style="background:${escapeHtml(message.senderColor || 'var(--c-brand)')}">${escapeHtml(initials(message.senderName || 'A'))}</div>`;
    const who = outgoing ? '' : `<div class="msg-who">${escapeHtml(message.senderName || 'Agent')}</div>`;

    node.innerHTML = `${avatar}
      <div class="msg-col">
        ${who}
        <div class="bubble">${formatMessage(message.body)}</div>
        <div class="msg-time">${clockTime(message.createdAt)}</div>
      </div>`;
    return node;
  }

  function typingNode() {
    const node = document.createElement('div');
    node.className = 'typing-row';
    node.dataset.typing = '1';
    node.innerHTML = `
      <div class="msg-av" style="background:var(--c-header)">${escapeHtml(state.settings?.avatarEmoji || '💬')}</div>
      <div class="typing-bubble"><i></i><i></i><i></i></div>`;
    return node;
  }

  const isNearBottom = () => el.body.scrollHeight - el.body.scrollTop - el.body.clientHeight < 120;
  const scrollToBottom = () => requestAnimationFrame(() => { el.body.scrollTop = el.body.scrollHeight; });

  function appendMessage(message) {
    if (state.messages.some((m) => m.id === message.id)) return;
    const previous = state.messages[state.messages.length - 1];
    state.messages.push(message);
    el.body.querySelector('[data-typing]')?.remove();

    const wasAtBottom = isNearBottom();
    const lastDay = previous ? dayLabel(previous.createdAt) : null;
    const day = dayLabel(message.createdAt);
    if (day !== lastDay) {
      const separator = document.createElement('div');
      separator.className = 'day-sep';
      separator.innerHTML = `<span>${escapeHtml(day)}</span>`;
      el.body.appendChild(separator);
    }
    el.body.appendChild(messageNode(message, day === lastDay ? previous : null));
    if (state.agentTyping) el.body.appendChild(typingNode());
    if (wasAtBottom || message.senderType === 'visitor') scrollToBottom();
  }

  /* ------------------------------------------------------------------ */
  /* Panel (pre-chat, offline, rating)                                   */
  /* ------------------------------------------------------------------ */
  function showPanel(html) {
    const panel = document.createElement('div');
    panel.className = 'panel-card';
    panel.dataset.panel = '1';
    panel.innerHTML = html;
    el.body.appendChild(panel);
    scrollToBottom();
    return panel;
  }
  const clearPanels = () => mount.querySelectorAll('[data-panel]').forEach((node) => node.remove());

  function showPreChat() {
    el.body.innerHTML = '';
    greetingBubble();
    el.foot.hidden = true;

    const panel = showPanel(`
      <h3>Sebelum mulai</h3>
      <p>Isi data singkat agar tim kami bisa menghubungi Anda kembali bila chat terputus.</p>
      <div class="c-field">
        <label for="pc-name">Nama</label>
        <input class="c-input" id="pc-name" placeholder="Nama Anda" autocomplete="name" value="${escapeHtml(state.profile.name || '')}">
      </div>
      <div class="c-field">
        <label for="pc-email">Email${state.settings.preChatRequireEmail ? '' : ' (opsional)'}</label>
        <input class="c-input" id="pc-email" type="email" placeholder="nama@perusahaan.com" autocomplete="email" value="${escapeHtml(state.profile.email || '')}">
      </div>
      <button class="c-btn" data-start>Mulai percakapan</button>
      <div class="c-err" hidden data-err></div>
      ${state.settings.preChatRequireEmail ? '' : '<button class="c-skip" data-skip>Lewati, langsung chat</button>'}`);

    const nameInput = panel.querySelector('#pc-name');
    const emailInput = panel.querySelector('#pc-email');
    const error = panel.querySelector('[data-err]');

    const submit = async () => {
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      if (state.settings.preChatRequireEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        emailInput.classList.add('err');
        error.textContent = 'Masukkan alamat email yang valid.';
        error.hidden = false;
        return;
      }
      saveProfile({ name, email });
      try {
        await startSession();
      } catch (err) {
        error.textContent = err.message || 'Gagal memulai percakapan. Coba lagi.';
        error.hidden = false;
      }
    };

    panel.querySelector('[data-start]').addEventListener('click', submit);
    panel.querySelector('[data-skip]')?.addEventListener('click', () => {
      saveProfile({ skipped: true });
      startSession().catch((err) => {
        error.textContent = err.message || 'Gagal memulai percakapan.';
        error.hidden = false;
      });
    });
    [nameInput, emailInput].forEach((input) => input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    }));
    setTimeout(() => nameInput.focus(), 120);
  }

  /** Cabut form offline bila tim sudah online atau percakapan sudah berjalan. */
  function dismissOfflineForm() {
    const panel = mount.querySelector('[data-offline]');
    if (panel && !panel.dataset.sent) panel.remove();
  }

  function showOfflineForm() {
    const panel = showPanel(`
      <h3>Tim sedang offline</h3>
      <p>${escapeHtml(state.settings.offlineMessage || 'Tinggalkan pesan, kami balas lewat email.')}</p>
      <div class="c-field"><label for="of-email">Email</label>
        <input class="c-input" id="of-email" type="email" placeholder="nama@perusahaan.com" value="${escapeHtml(state.profile.email || '')}"></div>
      <div class="c-field"><label for="of-body">Pesan</label>
        <textarea class="c-input" id="of-body" placeholder="Tulis pertanyaan Anda…"></textarea></div>
      <button class="c-btn" data-send-offline>Kirim pesan</button>
      <div class="c-err" hidden data-err></div>`);
    panel.dataset.offline = '1';

    panel.querySelector('[data-send-offline]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const email = panel.querySelector('#of-email').value.trim();
      const body = panel.querySelector('#of-body').value.trim();
      const error = panel.querySelector('[data-err]');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !body) {
        error.textContent = 'Email dan pesan wajib diisi dengan benar.';
        error.hidden = false;
        return;
      }
      button.disabled = true;
      try {
        await request('/api/public/offline-message', {
          method: 'POST',
          body: { license, email, body, name: state.profile.name || '' },
        });
        saveProfile({ email });
        panel.dataset.sent = '1';
        panel.innerHTML = '<h3>Pesan terkirim ✅</h3><p style="margin:0">Terima kasih! Tim kami akan membalas ke email Anda secepatnya.</p>';
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        button.disabled = false;
      }
    });
  }

  function showRating() {
    if (state.rated || !state.settings.ratingEnabled) return;
    const panel = showPanel(`
      <h3>Bagaimana percakapan tadi?</h3>
      <p>Penilaian Anda membantu kami meningkatkan kualitas layanan.</p>
      <div class="rating-row">
        <button class="rating-btn" data-rate="1" aria-label="Puas">👍</button>
        <button class="rating-btn" data-rate="-1" aria-label="Kurang puas">👎</button>
      </div>`);

    panel.querySelectorAll('[data-rate]').forEach((button) => {
      button.addEventListener('click', async () => {
        state.rated = true;
        panel.querySelectorAll('[data-rate]').forEach((b) => b.classList.remove('picked'));
        button.classList.add('picked');
        try {
          await request('/api/public/rate', { method: 'POST', body: { rating: Number(button.dataset.rate) }, auth: true });
          panel.innerHTML = '<h3>Terima kasih! 🙏</h3><p style="margin:0">Masukan Anda sudah kami terima.</p>';
        } catch { /* diamkan */ }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Jaringan                                                            */
  /* ------------------------------------------------------------------ */
  async function request(path, { method = 'GET', body, auth = false } = {}) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (auth && state.token) headers['X-Visitor-Token'] = state.token;

    const response = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Terjadi kesalahan jaringan.');
    return payload;
  }

  async function loadConfig() {
    const data = await request(`/api/public/config?license=${encodeURIComponent(license)}`);
    state.settings = data.settings;
    state.project = data.project;
    state.agents = data.agents || [];
    applyTheme(data.settings);
    setStatus(data.teamOnline);
    renderAgents();
    return data;
  }

  async function startSession() {
    clearPanels();
    el.body.innerHTML = '<div class="chat-loading"><div class="ring"></div></div>';

    const data = await request('/api/public/session', {
      method: 'POST',
      body: {
        license,
        uid: visitorUid(),
        source: mode === 'standalone' ? 'direct-link' : 'widget',
        name: state.profile.name || '',
        email: state.profile.email || '',
        currentUrl: state.context.url || location.href,
        pageTitle: state.context.title || document.title,
        referrer: state.context.referrer || document.referrer,
        locale: state.context.locale || navigator.language,
        timezone: state.context.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });

    state.token = data.visitorToken;
    state.conversationId = data.conversationId;
    state.messages = data.messages || [];
    state.settings = data.settings;
    state.agents = data.agents || [];
    state.started = true;
    state.closed = false;

    applyTheme(data.settings);
    setStatus(data.teamOnline);
    renderAgents();
    renderMessages();

    el.foot.hidden = false;
    if (!data.teamOnline && !state.messages.length) showOfflineForm();
    renderQuickReplies();
    connectSocket();
    setTimeout(() => el.input.focus(), 160);
  }

  function connectSocket() {
    if (state.socket) { state.socket.disconnect(); state.socket = null; }
    if (typeof window.io !== 'function') return;

    const socket = window.io({ auth: { role: 'visitor', token: state.token }, transports: ['websocket', 'polling'] });
    state.socket = socket;

    socket.on('connect', () => socket.emit('read'));
    socket.on('message:new', (message) => {
      state.agentTyping = false;
      dismissOfflineForm();
      appendMessage(message);
      if (message.senderType === 'agent') {
        notifyParent({ type: 'naga:agent-message' });
        socket.emit('read');
      }
    });
    socket.on('typing', ({ who, typing }) => {
      if (who !== 'agent') return;
      state.agentTyping = typing;
      el.body.querySelector('[data-typing]')?.remove();
      if (typing) { el.body.appendChild(typingNode()); scrollToBottom(); }
    });
    socket.on('team:presence', ({ online, agents }) => {
      state.agents = agents || state.agents;
      setStatus(online);
      renderAgents();
      if (online) dismissOfflineForm();
      else if (!state.messages.length && !mount.querySelector('[data-offline]')) showOfflineForm();
    });
    socket.on('conversation:closed', () => {
      state.closed = true;
      setTimeout(showRating, 500);
    });
  }

  function renderQuickReplies() {
    const replies = ['Cek status pesanan', 'Info harga', 'Cara pembayaran', 'Bicara dengan agent'];
    if (state.messages.length) { el.quick.hidden = true; return; }
    el.quick.hidden = false;
    el.quick.innerHTML = replies.map((reply) => `<button type="button">${escapeHtml(reply)}</button>`).join('');
    el.quick.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => { el.input.value = button.textContent; send(); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Kirim pesan                                                         */
  /* ------------------------------------------------------------------ */
  async function send() {
    const body = el.input.value.trim();
    if (!body) return;
    if (!state.started) { await startSession(); }

    el.input.value = '';
    autosize();
    el.send.disabled = true;
    el.quick.hidden = true;
    dismissOfflineForm();
    emitTyping(false);

    if (state.socket?.connected) {
      state.socket.emit('message:send', { body }, (ack) => {
        if (ack?.ok) appendMessage(ack.message);
      });
      return;
    }
    try {
      const { message } = await request('/api/public/messages', { method: 'POST', body: { body }, auth: true });
      appendMessage(message);
    } catch (error) {
      showPanel(`<p style="margin:0;color:#E0244A">${escapeHtml(error.message)}</p>`);
    }
  }

  function emitTyping(typing) {
    state.socket?.connected && state.socket.emit('typing', { typing });
  }

  function autosize() {
    el.input.style.height = 'auto';
    el.input.style.height = `${Math.min(el.input.scrollHeight, 120)}px`;
  }

  /* ------------------------------------------------------------------ */
  /* Event UI                                                            */
  /* ------------------------------------------------------------------ */
  el.input.addEventListener('input', () => {
    autosize();
    el.send.disabled = !el.input.value.trim();
    emitTyping(Boolean(el.input.value.trim()));
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => emitTyping(false), 1800);
  });

  el.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
  });

  el.send.addEventListener('click', send);

  el.emojiBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!el.emoji.childElementCount) {
      el.emoji.innerHTML = EMOJIS.map((emoji) => `<button type="button">${emoji}</button>`).join('');
      el.emoji.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => {
          el.input.value += button.textContent;
          el.input.dispatchEvent(new Event('input'));
          el.input.focus();
          el.emoji.classList.remove('show');
        });
      });
    }
    el.emoji.classList.toggle('show');
  });

  el.menuBtn.addEventListener('click', (event) => { event.stopPropagation(); el.menu.classList.toggle('show'); });

  document.addEventListener('click', () => {
    el.menu.classList.remove('show');
    el.emoji.classList.remove('show');
  });

  el.menu.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    el.menu.classList.remove('show');

    if (action === 'transcript') {
      if (!state.token) return;
      const url = `/api/public/transcript?visitorToken=${encodeURIComponent(state.token)}`;
      window.open(url, '_blank', 'noopener');
    }
    if (action === 'end') {
      if (!state.token) return;
      try { await request('/api/public/close', { method: 'POST', body: {}, auth: true }); } catch { /* ignore */ }
      state.closed = true;
      showRating();
    }
    if (action === 'restart') {
      state.started = false;
      state.messages = [];
      state.token = null;
      state.rated = false;
      state.socket?.disconnect();
      state.socket = null;
      await startSession();
    }
  });

  el.closeBtn.addEventListener('click', () => notifyParent({ type: 'naga:close' }));

  /* ------------------------------------------------------------------ */
  /* Komunikasi dengan loader (parent window)                            */
  /* ------------------------------------------------------------------ */
  function notifyParent(message) {
    if (mode !== 'widget' || window.parent === window) return;
    try { window.parent.postMessage(message, '*'); } catch { /* ignore */ }
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'naga:context') {
      state.context = {
        url: data.url, title: data.title, referrer: data.referrer,
        locale: data.locale, timezone: data.timezone,
      };
    }
    if (data.type === 'naga:identify' && data.data) {
      saveProfile({ name: data.data.name || '', email: data.data.email || '' });
      if (state.started && state.token) {
        request('/api/public/profile', { method: 'POST', body: state.profile, auth: true }).catch(() => {});
      }
    }
    if (data.type === 'naga:open') boot();
  });

  /* ------------------------------------------------------------------ */
  /* Bootstrap                                                           */
  /* ------------------------------------------------------------------ */
  let booted = false;
  async function boot() {
    if (booted) return;
    booted = true;
    try {
      if (!state.settings) await loadConfig();
      const needsPreChat = state.settings.preChatForm && !state.profile.name && !state.profile.skipped;
      if (needsPreChat) showPreChat();
      else await startSession();
    } catch (error) {
      el.body.innerHTML = `<div class="chat-error"><div>
        <h3>Chat tidak tersedia</h3>
        <p>${escapeHtml(error.message)}</p></div></div>`;
      el.foot.hidden = true;
    }
  }

  (async () => {
    try { await loadConfig(); } catch (error) {
      el.body.innerHTML = `<div class="chat-error"><div>
        <h3>Widget belum aktif</h3>
        <p>${escapeHtml(error.message)}</p></div></div>`;
      return;
    }
    notifyParent({ type: 'naga:ready' });
    if (!lazy) await boot();
  })();

  return { boot, state };
}

/* Geser kecerahan warna hex (positif = lebih terang). */
function shade(hex, percent) {
  let clean = String(hex || '').replace('#', '');
  if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
  const int = parseInt(clean, 16);
  if (Number.isNaN(int)) return hex;
  const amount = Math.round(255 * percent / 100);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(((int >> 16) & 255) + amount);
  const g = clamp(((int >> 8) & 255) + amount);
  const b = clamp((int & 255) + amount);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
