/*!
 * NagaLiveChat Widget Loader
 * ---------------------------------------------------------------------------
 * Pemakaian:
 *   <script src="https://host-anda/widget.js" data-license="NAGA-XXXX-XXXX-XXXX" async></script>
 *
 * Loader ini sengaja dibuat kecil dan bebas dependency. Seluruh antarmuka chat
 * dirender di dalam <iframe> pada Shadow DOM sehingga CSS website pemilik
 * tidak pernah bentrok dengan widget, dan sebaliknya.
 *
 * API publik:
 *   NagaChat.open() / .close() / .toggle()
 *   NagaChat.identify({ name, email })
 *   NagaChat.on('open' | 'close' | 'message', handler)
 */
(function () {
  'use strict';

  if (window.__NAGA_WIDGET_LOADED__) return;
  window.__NAGA_WIDGET_LOADED__ = true;

  /* --------------------------- Konfigurasi --------------------------- */
  var script = document.currentScript || (function () {
    var list = document.getElementsByTagName('script');
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].src && list[i].src.indexOf('widget.js') !== -1) return list[i];
    }
    return null;
  })();

  if (!script) return console.warn('[NagaLiveChat] Tag script tidak ditemukan.');

  var LICENSE = script.getAttribute('data-license') || script.dataset.license || '';
  if (!LICENSE) return console.warn('[NagaLiveChat] Atribut data-license wajib diisi.');

  var ORIGIN = new URL(script.src, location.href).origin;
  var MOBILE_BREAKPOINT = 480;
  var STORAGE_GREETING = 'naga.greeting.' + LICENSE;

  /* ------------------------------ State ------------------------------ */
  var state = { open: false, ready: false, frameReady: false, unread: 0, settings: null, greetingShown: false };
  var pendingToFrame = [];
  var handlers = { open: [], close: [], message: [] };
  var queue = [];

  function emit(event, payload) {
    (handlers[event] || []).forEach(function (fn) {
      try { fn(payload); } catch (error) { console.error('[NagaLiveChat]', error); }
    });
  }

  /* ----------------------------- Shadow DOM --------------------------- */
  var root = document.createElement('div');
  root.id = 'naga-livechat';
  root.setAttribute('aria-live', 'polite');
  var shadow = root.attachShadow ? root.attachShadow({ mode: 'open' }) : root;

  var style = document.createElement('style');
  shadow.appendChild(style);

  var launcher, badge, panel, frame, greeting, labelPill;

  /* ---------------------------- Muat config --------------------------- */
  fetch(ORIGIN + '/api/public/config?license=' + encodeURIComponent(LICENSE))
    .then(function (response) {
      if (!response.ok) throw new Error('License tidak dikenal');
      return response.json();
    })
    .then(function (data) {
      state.settings = data.settings || {};
      build();
    })
    .catch(function (error) {
      console.warn('[NagaLiveChat] Gagal memuat konfigurasi widget:', error.message);
    });

  /* ------------------------------ Render ------------------------------ */
  function build() {
    var s = state.settings;
    var side = s.position === 'left' ? 'left' : 'right';
    var offsetX = Number(s.offsetX) || 24;
    var offsetY = Number(s.offsetY) || 24;
    var color = s.themeColor || '#6D5EF8';
    var accent = s.accentColor || '#FF7A45';
    var background = s.useGradient
      ? 'linear-gradient(135deg,' + lighten(color, 12) + ' 0%,' + color + ' 60%,' + darken(color, 10) + ' 100%)'
      : color;

    style.textContent = [
      ':host, * { box-sizing: border-box; }',
      '.wrap {',
      '  position: fixed; z-index: 2147483000; ' + side + ':' + offsetX + 'px; bottom:' + offsetY + 'px;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;',
      '  display: flex; flex-direction: column; align-items: ' + (side === 'left' ? 'flex-start' : 'flex-end') + '; gap: 12px;',
      '}',

      /* ---- Launcher ---- */
      '.launcher {',
      '  position: relative; width: 60px; height: 60px; border: 0; border-radius: 50%;',
      '  background: ' + background + '; color: #fff; cursor: pointer; padding: 0;',
      '  display: grid; place-items: center; flex: none;',
      '  box-shadow: 0 8px 28px ' + rgba(color, .42) + ', 0 2px 8px rgba(0,0,0,.14);',
      '  transition: transform .26s cubic-bezier(.34,1.56,.64,1), box-shadow .22s ease;',
      '  -webkit-tap-highlight-color: transparent;',
      '}',
      '.launcher:hover { transform: scale(1.07) translateY(-2px); box-shadow: 0 14px 36px ' + rgba(color, .5) + '; }',
      '.launcher:active { transform: scale(.97); }',
      '.launcher svg { width: 27px; height: 27px; transition: transform .3s cubic-bezier(.16,1,.3,1), opacity .2s ease; }',
      '.launcher .ic-close { position: absolute; opacity: 0; transform: rotate(-90deg) scale(.6); }',
      '.root.is-open .launcher .ic-chat { opacity: 0; transform: rotate(90deg) scale(.6); }',
      '.root.is-open .launcher .ic-close { opacity: 1; transform: none; }',

      '.badge {',
      '  position: absolute; top: -2px; ' + (side === 'left' ? 'left' : 'right') + ': -2px;',
      '  min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px;',
      '  background: ' + accent + '; color: #fff; border: 2.5px solid #fff;',
      '  font-size: 11px; font-weight: 800; line-height: 1; display: none;',
      '  align-items: center; justify-content: center;',
      '  animation: pop .34s cubic-bezier(.34,1.56,.64,1);',
      '}',
      '.badge.show { display: flex; }',
      '@keyframes pop { from { transform: scale(0); } }',

      /* ---- Label pill ---- */
      '.label {',
      '  display: flex; align-items: center; gap: 8px; max-width: 230px;',
      '  padding: 10px 15px; border-radius: 14px; background: #fff; color: #1E2440;',
      '  font-size: 13.5px; font-weight: 600; line-height: 1.4; cursor: pointer;',
      '  box-shadow: 0 8px 26px rgba(10,12,27,.16); border: 1px solid rgba(10,12,27,.06);',
      '  animation: slide-up .42s cubic-bezier(.16,1,.3,1) both;',
      '}',
      '.label:hover { transform: translateY(-1px); }',

      /* ---- Greeting proaktif ---- */
      '.greeting {',
      '  position: relative; display: flex; gap: 11px; width: 290px; max-width: calc(100vw - 48px);',
      '  padding: 15px 16px; border-radius: 18px; background: #fff; cursor: pointer;',
      '  box-shadow: 0 16px 44px rgba(10,12,27,.2); border: 1px solid rgba(10,12,27,.06);',
      '  animation: slide-up .46s cubic-bezier(.16,1,.3,1) both;',
      '}',
      '.greeting .g-av {',
      '  width: 36px; height: 36px; border-radius: 50%; flex: none; display: grid; place-items: center;',
      '  background: ' + background + '; font-size: 18px;',
      '}',
      '.greeting .g-body { min-width: 0; }',
      '.greeting .g-name { font-size: 12px; font-weight: 700; color: ' + color + '; margin-bottom: 2px; }',
      '.greeting .g-text { font-size: 13.5px; line-height: 1.5; color: #2C3355; }',
      '.greeting .g-x {',
      '  position: absolute; top: -8px; ' + (side === 'left' ? 'right' : 'right') + ': -8px;',
      '  width: 24px; height: 24px; border-radius: 50%; border: 0; cursor: pointer;',
      '  background: #fff; color: #656F8C; box-shadow: 0 3px 10px rgba(10,12,27,.18);',
      '  display: grid; place-items: center; font-size: 15px; line-height: 1; padding: 0;',
      '}',
      '.greeting .g-x:hover { background: #F6F7FB; color: #1E2440; }',
      '@keyframes slide-up { from { opacity: 0; transform: translateY(14px) scale(.96); } }',

      /* ---- Panel iframe ---- */
      '.panel {',
      '  position: fixed; ' + side + ':' + offsetX + 'px; bottom:' + (offsetY + 76) + 'px;',
      '  width: 390px; height: min(650px, calc(100vh - ' + (offsetY + 108) + 'px));',
      '  border-radius: 20px; overflow: hidden; background: #fff;',
      '  box-shadow: 0 28px 80px rgba(10,12,27,.28), 0 4px 16px rgba(10,12,27,.12);',
      '  opacity: 0; pointer-events: none; transform: translateY(18px) scale(.97);',
      '  transform-origin: ' + side + ' bottom;',
      '  transition: opacity .24s ease, transform .32s cubic-bezier(.16,1,.3,1);',
      '}',
      '.root.is-open .panel { opacity: 1; pointer-events: auto; transform: none; }',
      '.panel iframe { width: 100%; height: 100%; border: 0; display: block; }',

      '@media (max-width:' + MOBILE_BREAKPOINT + 'px) {',
      '  .panel { inset: 0; width: 100%; height: 100%; border-radius: 0; }',
      '  .root.is-open .launcher, .root.is-open .label, .root.is-open .greeting { display: none; }',
      '  .label, .greeting { max-width: calc(100vw - 40px); }',
      '}',
      '@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }',
    ].join('\n');

    /* Panel dan launcher dibungkus satu container agar kelas "is-open" pada
       container dapat menjangkau keduanya lewat selektor keturunan. */
    var root_ = document.createElement('div');
    root_.className = 'root';

    var wrap = document.createElement('div');
    wrap.className = 'wrap';

    /* Panel + iframe */
    panel = document.createElement('div');
    panel.className = 'panel';
    frame = document.createElement('iframe');
    frame.title = 'Jendela live chat';
    frame.setAttribute('allow', 'clipboard-write; autoplay');
    frame.src = ORIGIN + '/widget/frame?license=' + encodeURIComponent(LICENSE)
      + '&host=' + encodeURIComponent(location.origin);
    panel.appendChild(frame);

    /* Greeting proaktif */
    if (s.proactiveEnabled && !sessionStorage.getItem(STORAGE_GREETING)) {
      setTimeout(showGreeting, Math.max(2, Number(s.proactiveDelay) || 12) * 1000);
    }

    /* Label pill */
    if (s.showLauncherLabel && s.launcherLabel) {
      labelPill = document.createElement('button');
      labelPill.className = 'label';
      labelPill.type = 'button';
      labelPill.textContent = s.launcherLabel;
      labelPill.addEventListener('click', open);
      wrap.appendChild(labelPill);
    }

    /* Launcher */
    launcher = document.createElement('button');
    launcher.className = 'launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Buka live chat');
    launcher.innerHTML =
      '<svg class="ic-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
      + '<svg class="ic-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">'
      + '<path d="M18 6 6 18M6 6l12 12"/></svg>';

    badge = document.createElement('span');
    badge.className = 'badge';
    launcher.appendChild(badge);
    launcher.addEventListener('click', toggle);

    wrap.appendChild(launcher);
    root_.appendChild(panel);
    root_.appendChild(wrap);
    shadow.appendChild(root_);
    document.body.appendChild(root);

    state.wrap = wrap;
    state.root = root_;
    state.ready = true;
    queue.splice(0).forEach(function (fn) { fn(); });
  }

  /* ----------------------------- Greeting ----------------------------- */
  function showGreeting() {
    if (state.open || state.greetingShown || !state.wrap) return;
    var s = state.settings;
    state.greetingShown = true;

    greeting = document.createElement('div');
    greeting.className = 'greeting';
    greeting.innerHTML =
      '<div class="g-av">' + (s.avatarEmoji || '💬') + '</div>'
      + '<div class="g-body">'
      + '<div class="g-name">' + esc(s.companyName || 'Support') + '</div>'
      + '<div class="g-text">' + esc(s.proactiveMessage || 'Butuh bantuan?') + '</div>'
      + '</div><button class="g-x" aria-label="Tutup sapaan">×</button>';

    greeting.addEventListener('click', function (event) {
      if (event.target.classList.contains('g-x')) return;
      open();
    });
    greeting.querySelector('.g-x').addEventListener('click', function (event) {
      event.stopPropagation();
      dismissGreeting();
    });

    if (labelPill) labelPill.remove();
    state.wrap.insertBefore(greeting, launcher);
    ping();
  }

  function dismissGreeting() {
    try { sessionStorage.setItem(STORAGE_GREETING, '1'); } catch (e) { /* storage diblokir */ }
    if (greeting) { greeting.remove(); greeting = null; }
  }

  /* ------------------------------ Kontrol ----------------------------- */
  function open() {
    if (!state.ready) return queue.push(open);
    state.open = true;
    state.root.classList.add('is-open');
    launcher.setAttribute('aria-label', 'Tutup live chat');
    dismissGreeting();
    if (labelPill) labelPill.remove();
    setUnread(0);
    post({ type: 'naga:open' });
    sendContext();
    setTimeout(function () { try { frame.contentWindow.focus(); } catch (e) {} }, 320);
    emit('open');
  }

  function close() {
    if (!state.ready) return queue.push(close);
    state.open = false;
    state.root.classList.remove('is-open');
    launcher.setAttribute('aria-label', 'Buka live chat');
    post({ type: 'naga:close' });
    emit('close');
  }

  function toggle() { state.open ? close() : open(); }

  function setUnread(count) {
    state.unread = count;
    if (!badge) return;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.toggle('show', count > 0);
  }

  /**
   * Kirim pesan ke iframe. Bila script di dalam frame belum selesai dimuat,
   * pesan diantrekan dan dikirim ulang saat frame melapor "naga:ready" —
   * tanpa ini, klik cepat pada launcher bisa membuat pesan hilang.
   */
  function post(message) {
    if (!state.frameReady) { pendingToFrame.push(message); return; }
    try { frame.contentWindow.postMessage(message, ORIGIN); } catch (error) { pendingToFrame.push(message); }
  }

  function flushToFrame() {
    var queued = pendingToFrame.splice(0);
    for (var i = 0; i < queued.length; i++) {
      try { frame.contentWindow.postMessage(queued[i], ORIGIN); } catch (error) { /* abaikan */ }
    }
  }

  function sendContext() {
    post({
      type: 'naga:context',
      url: location.href,
      title: document.title,
      referrer: document.referrer,
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }

  /* Nada notifikasi ringan tanpa file audio. */
  function ping() {
    if (!state.settings || state.settings.soundEnabled === false) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + .09);
      gain.gain.setValueAtTime(.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.13, ctx.currentTime + .02);
      gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .3);
      osc.start(); osc.stop(ctx.currentTime + .32);
      setTimeout(function () { ctx.close(); }, 600);
    } catch (error) { /* autoplay policy */ }
  }

  /* -------------------------- Pesan dari frame ------------------------- */
  window.addEventListener('message', function (event) {
    if (event.origin !== ORIGIN || !event.data || typeof event.data !== 'object') return;
    if (frame && event.source !== frame.contentWindow) return;
    var data = event.data;

    switch (data.type) {
      case 'naga:ready':
        state.frameReady = true;
        flushToFrame();
        sendContext();
        if (state.open) post({ type: 'naga:open' });
        break;
      case 'naga:close':
        close();
        break;
      case 'naga:unread':
        if (!state.open) { setUnread(data.count || 0); if (data.count) ping(); }
        break;
      case 'naga:message':
        emit('message', data.message);
        break;
      case 'naga:agent-message':
        if (!state.open) {
          setUnread(state.unread + 1);
          ping();
          if (!greeting && state.settings.proactiveEnabled !== false) { /* biarkan badge saja */ }
        }
        break;
    }
  });

  /* Perbarui konteks saat SPA berpindah halaman. */
  var lastUrl = location.href;
  setInterval(function () {
    if (location.href !== lastUrl) { lastUrl = location.href; sendContext(); }
  }, 1500);

  /* ------------------------------ API publik --------------------------- */
  var existing = window.NagaChat;
  window.NagaChat = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: function () { return state.open; },
    identify: function (data) {
      var run = function () { post({ type: 'naga:identify', data: data || {} }); };
      state.ready ? run() : queue.push(run);
    },
    on: function (event, handler) {
      if (handlers[event] && typeof handler === 'function') handlers[event].push(handler);
      return window.NagaChat;
    },
    destroy: function () { root.remove(); window.__NAGA_WIDGET_LOADED__ = false; },
  };

  /* Dukung pola antrean: window.NagaChat = window.NagaChat || []; NagaChat.push(['open']) */
  if (existing && typeof existing.length === 'number') {
    existing.forEach(function (call) {
      var method = Array.isArray(call) ? call[0] : call;
      if (typeof window.NagaChat[method] === 'function') {
        window.NagaChat[method].apply(null, Array.isArray(call) ? call.slice(1) : []);
      }
    });
  }

  /* ------------------------------ Utilitas ----------------------------- */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hexToRgb(hex) {
    var clean = String(hex || '').replace('#', '');
    if (clean.length === 3) clean = clean.split('').map(function (c) { return c + c; }).join('');
    var int = parseInt(clean, 16);
    if (isNaN(int)) return { r: 109, g: 94, b: 248 };
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }
  function rgba(hex, alpha) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
  }
  function shift(hex, amount) {
    var c = hexToRgb(hex);
    var clamp = function (v) { return Math.max(0, Math.min(255, Math.round(v))); };
    return '#' + [clamp(c.r + amount), clamp(c.g + amount), clamp(c.b + amount)]
      .map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }
  function lighten(hex, percent) { return shift(hex, 255 * percent / 100); }
  function darken(hex, percent) { return shift(hex, -255 * percent / 100); }
})();
