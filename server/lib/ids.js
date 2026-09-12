import crypto from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** ID pendek acak yang aman secara kriptografis. */
export function randomId(length = 16) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** ID berprefix supaya mudah dibaca saat debugging, mis. "cnv_8fd2...". */
export function prefixedId(prefix, length = 14) {
  return `${prefix}_${randomId(length)}`;
}

/** License key publik untuk widget, format NAGA-XXXX-XXXX-XXXX. */
export function licenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += chars[bytes[i] % chars.length];
  }
  return `NAGA-${out}`;
}

export const nowIso = () => new Date().toISOString();
