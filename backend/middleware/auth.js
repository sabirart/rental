'use strict';
const crypto = require('crypto');
const { AppError } = require('./errorHandler');
const { getDriveToken } = require('../services/googleDrive');
const { runWithRequestContext } = require('../services/driveStore');
const { parseCookies, clearCookie } = require('../utils/cookies');

const SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'development-only-change-me');
if (process.env.NODE_ENV === 'production' && SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
}
const COOKIE_NAME = 'rental_session';
const SESSION_MS = 7 * 86400000;

// Logged-out session ids are remembered until they would have expired anyway.
// (In-process: after a restart a stolen cookie is valid until its 7-day expiry.)
const revoked = new Map();
function pruneRevoked() { const now = Date.now(); for (const [sid, exp] of revoked) if (exp < now) revoked.delete(sid); }

const b64 = (v) => Buffer.from(v).toString('base64url');
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
function verify(token) {
  if (!token || !SECRET) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(crypto.createHmac('sha256', SECRET).update(body).digest('base64url'));
  const supplied = Buffer.from(sig);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!p || typeof p !== 'object' || !p.sub || !p.exp || p.exp < Date.now()) return null;
  if (p.sid && revoked.has(p.sid)) return null;
  return p;
}
function createSession(user) {
  const now = Date.now();
  return sign({
    sub: user.id, email: user.email, name: user.name || '', picture: user.profilePic || null,
    googleId: user.googleId || null, sid: crypto.randomBytes(12).toString('hex'), iat: now, exp: now + SESSION_MS
  });
}
function getToken(req) {
  const cookie = parseCookies(req)[COOKIE_NAME];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  return header && /^Bearer /i.test(header) ? header.slice(7) : null;
}
function revokeSession(req) {
  const session = verify(getToken(req));
  if (session?.sid) { pruneRevoked(); revoked.set(session.sid, session.exp); }
}

const authMiddleware = {
  async authenticate(req, res, next) {
    try {
      const session = verify(getToken(req));
      if (!session) throw new AppError('Invalid or expired session', 401, 'SESSION_EXPIRED');
      req.userId = session.sub;
      req.userEmail = session.email;
      req.user = { id: session.sub, name: session.name, email: session.email, profilePic: session.picture, googleId: session.googleId, isVerified: true };
      req.session = session;
      const driveToken = await getDriveToken(req, res);
      runWithRequestContext(req.userId, driveToken, () => next(), { userName: session.name, userEmail: session.email });
    } catch (e) { next(e); }
  },
  createSession,
  verifySession: (req) => verify(getToken(req)),
  revokeSession,
  clearCookieHeader(res) { clearCookie(res, COOKIE_NAME); },
  COOKIE_NAME
};
module.exports = authMiddleware;
