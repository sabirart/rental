'use strict';
const crypto = require('crypto');
const { AppError } = require('./errorHandler');
const { getDriveToken } = require('../services/googleDrive');
const Drive = require('../services/driveStore');
const { runWithRequestContext } = Drive;
const { parseCookies, clearCookie } = require('../utils/cookies');
const { Pool } = require('pg');

const SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'development-only-change-me');
if (process.env.NODE_ENV === 'production' && SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
}
const COOKIE_NAME = 'rental_session';
const SESSION_MS = 7 * 86400000;

// Logged-out session ids are remembered until they would have expired anyway.
// (In-process: after a restart a stolen cookie is valid until its 7-day expiry.)
const revoked = new Map();
let revocationPool = null;
let revocationSchemaPromise = null;
function getRevocationPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!revocationPool) {
    revocationPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.SESSION_STORE_POOL_SIZE) > 0 ? Number(process.env.SESSION_STORE_POOL_SIZE) : 5,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    });
    revocationPool.on('error', (error) => console.error('Session revocation store error:', error.message));
  }
  return revocationPool;
}
async function ensureRevocationSchema(pool) {
  if (!revocationSchemaPromise) {
    revocationSchemaPromise = pool.query(`CREATE TABLE IF NOT EXISTS rental_session_revocations (
      sid_hash CHAR(64) PRIMARY KEY, user_id TEXT NOT NULL, expires_at BIGINT NOT NULL, revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).then(() => pool.query('CREATE INDEX IF NOT EXISTS rental_session_revocations_expiry_idx ON rental_session_revocations (expires_at)'));
    revocationSchemaPromise.catch(() => { revocationSchemaPromise = null; });
  }
  return revocationSchemaPromise;
}
const hashSessionId = (sid) => crypto.createHash('sha256').update(String(sid)).digest('hex');
async function persistRevocation(session) {
  const pool = getRevocationPool();
  if (!pool || !session?.sid || !session?.sub) return false;
  await ensureRevocationSchema(pool);
  await pool.query(
    'INSERT INTO rental_session_revocations (sid_hash, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (sid_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at',
    [hashSessionId(session.sid), String(session.sub), Number(session.exp)]
  );
  await pool.query('DELETE FROM rental_session_revocations WHERE expires_at < $1', [Date.now()]).catch(() => {});
  return true;
}
async function isPersistentlyRevoked(session) {
  const pool = getRevocationPool();
  if (!pool || !session?.sid) return false;
  try {
    await ensureRevocationSchema(pool);
    const result = await pool.query(
      'SELECT 1 FROM rental_session_revocations WHERE sid_hash = $1 AND user_id = $2 AND expires_at >= $3 LIMIT 1',
      [hashSessionId(session.sid), String(session.sub), Date.now()]
    );
    return result.rowCount > 0;
  } catch (_) {
    // Fail closed when the operator has explicitly configured a shared session store.
    throw new AppError('Session verification is temporarily unavailable. Please retry shortly.', 503, 'SESSION_STORE_UNAVAILABLE');
  }
}
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
      if (await isPersistentlyRevoked(session)) throw new AppError('Invalid or expired session', 401, 'SESSION_EXPIRED');
      req.userId = session.sub;
      req.userEmail = session.email;
      req.user = { id: session.sub, name: session.name, email: session.email, profilePic: session.picture, googleId: session.googleId, isVerified: true };
      req.session = session;
      const driveToken = await getDriveToken(req, res);
      runWithRequestContext(req.userId, driveToken, async () => {
        // Revocation is stored with the account's Drive data, so it survives a
        // process restart. This read is reused by the request's data handlers.
        if (driveToken && session.sid) {
          const data = await Drive.getData();
          const now = Date.now();
          data.authRevocations = (Array.isArray(data.authRevocations) ? data.authRevocations : [])
            .filter((entry) => Number(entry?.exp) >= now);
          if (data.authRevocations.some((entry) => entry.sid === session.sid)) {
            throw new AppError('Invalid or expired session', 401, 'SESSION_EXPIRED');
          }
        }
        next();
      }, { userName: session.name, userEmail: session.email }).catch(next);
    } catch (e) { next(e); }
  },
  createSession,
  verifySession: (req) => verify(getToken(req)),
  revokeSession,
  persistRevocation,
  isPersistentlyRevoked,
  clearCookieHeader(res) { clearCookie(res, COOKIE_NAME); },
  COOKIE_NAME
};
module.exports = authMiddleware;
