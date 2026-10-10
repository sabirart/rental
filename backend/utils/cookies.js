'use strict';
const crypto = require('crypto');

const isProd = () => process.env.NODE_ENV === 'production';

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const i = trimmed.indexOf('=');
    if (i < 1) continue;
    try { out[trimmed.slice(0, i)] = decodeURIComponent(trimmed.slice(i + 1)); } catch (_) { /* ignore malformed cookie */ }
  }
  return out;
}

function appendCookie(res, value) {
  const existing = res.getHeader('Set-Cookie');
  const list = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader('Set-Cookie', [...list, value]);
}

function cookieFlags(maxAge) {
  return `Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${isProd() ? '; Secure' : ''}`;
}
const setCookie = (res, name, value, maxAge) => appendCookie(res, `${name}=${encodeURIComponent(value)}; ${cookieFlags(maxAge)}`);
const clearCookie = (res, name) => appendCookie(res, `${name}=; ${cookieFlags(0)}`);

// --- authenticated encryption for the long-lived Google refresh token cookie
const secret = () => process.env.JWT_SECRET || (isProd() ? '' : 'development-only-change-me');
const key = () => crypto.createHash('sha256').update(`rental-manager:cookie-key:${secret()}`).digest();

function encryptValue(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

/** Returns the plaintext, or null when the value is tampered/foreign. Legacy plaintext values pass through. */
function decryptValue(value) {
  if (!value) return null;
  if (!String(value).startsWith('v1.')) return String(value); // pre-encryption cookie: still honoured, re-encrypted on next refresh
  try {
    const [, iv, tag, data] = String(value).split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch (_) { return null; }
}

module.exports = { parseCookies, appendCookie, cookieFlags, setCookie, clearCookie, encryptValue, decryptValue, isProd };
