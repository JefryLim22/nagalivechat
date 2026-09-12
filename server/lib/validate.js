/** Utilitas validasi & sanitasi input ringan. */

export const isEmail = (value) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

export function str(value, maxLength = 500) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

export function pick(object, keys) {
  const out = {};
  for (const key of keys) if (object?.[key] !== undefined) out[key] = object[key];
  return out;
}

/** Error dengan HTTP status, ditangkap oleh error handler global. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Bungkus handler async agar rejection otomatis diteruskan ke next(). */
export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
