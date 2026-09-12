/* Helper UI bersama untuk seluruh halaman NagaLiveChat. */

export const $  = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Ubah URL & baris baru dalam pesan menjadi HTML yang aman. */
export function formatMessage(value = '') {
  return escapeHtml(value)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br>');
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'baru saja';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mnt`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} hr`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export const clockTime = (iso) =>
  new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export function dayLabel(iso) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(date, today)) return 'Hari ini';
  if (same(date, yesterday)) return 'Kemarin';
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatDuration(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds} dtk`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mnt ${seconds % 60} dtk`;
  return `${Math.floor(minutes / 60)} jam ${minutes % 60} mnt`;
}

/* ------------------------------- Toast ------------------------------ */
let toastHost = null;
export function toast(message, variant = '') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
  }
  const element = document.createElement('div');
  element.className = `toast ${variant ? `toast-${variant}` : ''}`;
  element.textContent = message;
  toastHost.appendChild(element);
  setTimeout(() => {
    element.style.transition = 'opacity .3s ease, transform .3s ease';
    element.style.opacity = '0';
    element.style.transform = 'translateY(8px)';
    setTimeout(() => element.remove(), 320);
  }, 3200);
}

/* -------------------------------- API ------------------------------- */
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(payload?.error || 'Terjadi kesalahan. Coba lagi.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export const debounce = (fn, wait = 300) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
};
