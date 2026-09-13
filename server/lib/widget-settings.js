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
  preChatAskName: true,
  preChatAskEmail: true,
  preChatTitle: 'Sebelum mulai',
  preChatIntro: 'Isi data singkat agar tim kami bisa menghubungi Anda kembali bila chat terputus.',
  preChatButtonLabel: 'Mulai obrolan',
  /* Pertanyaan tambahan buatan pemilik widget. Setiap item:
     { id, label, type: text|textarea|radio|select, required, placeholder, options[] } */
  preChatFields: [],

  // Layar sambutan
  welcomeImageUrl: '',        // banner di atas form / sapaan
  /* Tombol aksi cepat di layar sambutan. Setiap item: { label, url }.
     url kosong berarti tombol langsung membuka percakapan. */
  quickActions: [],

  // Tampilan panel
  panelTransparent: false,    // latar panel tembus pandang, kartu tetap solid
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

export const PRECHAT_FIELD_TYPES = ['text', 'textarea', 'radio', 'select'];
const MAX_PRECHAT_FIELDS = 8;
const MAX_PRECHAT_OPTIONS = 12;

/** Bersihkan daftar pertanyaan pre-chat yang dikirim dari dashboard. */
export function sanitizePreChatFields(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input.slice(0, MAX_PRECHAT_FIELDS)) {
    if (!raw || typeof raw !== 'object') continue;
    const label = String(raw.label ?? '').trim().slice(0, 120);
    if (!label) continue;
    const type = PRECHAT_FIELD_TYPES.includes(raw.type) ? raw.type : 'text';
    const options = (type === 'radio' || type === 'select')
      ? (Array.isArray(raw.options) ? raw.options : [])
        .map((option) => String(option ?? '').trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, MAX_PRECHAT_OPTIONS)
      : [];
    /* Pilihan tanpa opsi tidak bisa dijawab — turunkan jadi isian teks
       agar pengunjung tidak terjebak di form yang mustahil divalidasi. */
    const safeType = (type === 'radio' || type === 'select') && options.length === 0 ? 'text' : type;
    out.push({
      id: String(raw.id ?? '').trim().slice(0, 40) || `f${out.length + 1}`,
      label,
      type: safeType,
      required: Boolean(raw.required),
      placeholder: String(raw.placeholder ?? '').trim().slice(0, 120),
      options,
    });
  }
  return out;
}

/** Field yang isinya URL gambar — hanya http/https yang diterima. */
const URL_FIELDS = new Set(['logoUrl', 'eyecatcherImageUrl', 'welcomeImageUrl']);

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

const MAX_QUICK_ACTIONS = 6;

/** Bersihkan tombol aksi cepat; tautan non-http/https dibuang. */
export function sanitizeQuickActions(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input.slice(0, MAX_QUICK_ACTIONS)) {
    if (!raw || typeof raw !== 'object') continue;
    const label = String(raw.label ?? '').trim().slice(0, 60);
    if (!label) continue;
    out.push({ label, url: safeUrl(raw.url ?? '') });
  }
  return out;
}

/** Sanitizer khusus untuk setting yang berbentuk array. */
const ARRAY_SANITIZERS = {
  preChatFields: sanitizePreChatFields,
  quickActions: sanitizeQuickActions,
};

/** Gabungkan setting tersimpan dengan default agar tidak ada field hilang. */
export const mergeSettings = (stored = {}) => ({ ...DEFAULT_WIDGET_SETTINGS, ...stored });

/** Hanya izinkan key yang dikenal saat update dari dashboard. */
export function sanitizeSettings(input = {}) {
  const out = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_WIDGET_SETTINGS)) {
    if (input[key] === undefined) continue;
    const value = input[key];
    if (Array.isArray(defaultValue)) out[key] = (ARRAY_SANITIZERS[key] ?? (() => []))(value);
    else if (typeof defaultValue === 'boolean') out[key] = Boolean(value);
    else if (typeof defaultValue === 'number') out[key] = Number.isFinite(Number(value)) ? Number(value) : defaultValue;
    else if (URL_FIELDS.has(key)) out[key] = safeUrl(value);
    else out[key] = String(value).slice(0, key === 'preChatIntro' ? 1200 : 400);
  }
  return out;
}
