import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { get } from '../db/index.js';

export const hashPassword = (plain) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

/** Token sesi agent (disimpan di cookie httpOnly). */
export function signSession(user) {
  return jwt.sign(
    { sub: user.id, accountId: user.account_id, role: user.role, kind: 'agent' },
    config.jwtSecret,
    { expiresIn: `${config.sessionTtlDays}d` },
  );
}

/** Token pengunjung — mengunci akses hanya ke percakapannya sendiri. */
export function signVisitorToken(payload) {
  return jwt.sign({ ...payload, kind: 'visitor' }, config.jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token, kind) {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (kind && decoded.kind !== kind) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export const clearSessionCookie = (res) => res.clearCookie(config.cookieName, { path: '/' });

/** Ambil user dari cookie sesi; null jika tidak valid. */
export function userFromRequest(req) {
  const token = req.cookies?.[config.cookieName];
  if (!token) return null;
  const decoded = verifyToken(token, 'agent');
  if (!decoded) return null;
  const user = get('SELECT * FROM users WHERE id = ?', decoded.sub);
  return user ? { ...user } : null;
}

/** Middleware: wajib login. */
export function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Sesi tidak valid atau sudah berakhir.' });
  req.user = user;
  next();
}

/** Middleware: wajib owner/admin. */
export function requireAdmin(req, res, next) {
  if (!['owner', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Hanya owner atau admin yang boleh melakukan aksi ini.' });
  }
  next();
}
