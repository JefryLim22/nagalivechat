/** Konfigurasi default widget — dipakai saat project baru dibuat. */
export const DEFAULT_WIDGET_SETTINGS = {
  // Tampilan
  themeColor: '#6D5EF8',
  accentColor: '#FF7A45',
  useGradient: true,
  position: 'right',          // right | left
  offsetX: 24,
  offsetY: 24,
  cornerStyle: 'rounded',     // rounded | soft | square
  launcherLabel: 'Chat dengan kami',
  showLauncherLabel: true,

  // Identitas
  companyName: 'NagaLiveChat',
  tagline: 'Biasanya membalas dalam beberapa menit',
  avatarEmoji: '🐉',
  logoUrl: '',

  // Pesan
  welcomeMessage: 'Halo 👋 Ada yang bisa kami bantu hari ini?',
  offlineMessage: 'Tim kami sedang offline. Tinggalkan pesan dan kami akan membalas lewat email.',
  placeholder: 'Tulis pesan Anda…',

  // Perilaku
  preChatForm: true,
  preChatRequireEmail: true,
  proactiveEnabled: true,
  proactiveDelay: 12,         // detik
  proactiveMessage: 'Butuh bantuan? Tim kami siap membantu 🙌',

  // Eyecatcher — gambar/banner penarik perhatian di atas tombol chat
  eyecatcherEnabled: false,
  eyecatcherImageUrl: '',
  eyecatcherText: 'Ada promo hari ini 🎁',
  eyecatcherDelay: 4,         // detik
  eyecatcherOncePerSession: true,
  soundEnabled: true,
  ratingEnabled: true,
  showBranding: true,
};

/** Field yang isinya URL gambar — hanya http/https yang diterima. */
const URL_FIELDS = new Set(['logoUrl', 'eyecatcherImageUrl']);

/** Buang URL yang skema-nya bukan http/https (mis. javascript:, data:). */
function safeUrl(value) {
  const raw = String(value).trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href.slice(0, 400) : '';
  } catch {
    // URL relatif terhadap situs pemilik widget, mis. /img/promo.png
    return raw.startsWith('/') && !raw.startsWith('//') ? raw.slice(0, 400) : '';
  }
}

/** Gabungkan setting tersimpan dengan default agar tidak ada field hilang. */
export const mergeSettings = (stored = {}) => ({ ...DEFAULT_WIDGET_SETTINGS, ...stored });

/** Hanya izinkan key yang dikenal saat update dari dashboard. */
export function sanitizeSettings(input = {}) {
  const out = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_WIDGET_SETTINGS)) {
    if (input[key] === undefined) continue;
    const value = input[key];
    if (typeof defaultValue === 'boolean') out[key] = Boolean(value);
    else if (typeof defaultValue === 'number') out[key] = Number.isFinite(Number(value)) ? Number(value) : defaultValue;
    else if (URL_FIELDS.has(key)) out[key] = safeUrl(value);
    else out[key] = String(value).slice(0, 400);
  }
  return out;
}
