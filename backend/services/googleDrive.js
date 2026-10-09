const { google } = require('googleapis');
const { findOrCreateFolder, findDataFile, driveClient, emptyData, writeDriveData, getContext } = require('./driveStore');

const DRIVE_COOKIE = 'google_drive_token';
const DRIVE_REFRESH_COOKIE = 'google_drive_refresh_token';

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('='); return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
}
function appendCookie(res, value) {
  const existing = res.getHeader('Set-Cookie');
  const list = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader('Set-Cookie', [...list, value]);
}
function cookieFlags(maxAge) { return `Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }
function setDriveCookies(res, token, refreshToken, expiresIn = 3600) {
  if (token) appendCookie(res, `${DRIVE_COOKIE}=${encodeURIComponent(token)}; ${cookieFlags(Math.max(60, Number(expiresIn) - 60))}`);
  if (refreshToken) appendCookie(res, `${DRIVE_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; ${cookieFlags(60 * 60 * 24 * 30)}`);
}
function setDriveCookie(res, token, expiresIn = 3600) { setDriveCookies(res, token, null, expiresIn); }
function clearDriveCookie(res) {
  const flags = cookieFlags(0);
  appendCookie(res, `${DRIVE_COOKIE}=; ${flags}`);
  appendCookie(res, `${DRIVE_REFRESH_COOKIE}=; ${flags}`);
}
async function refreshAccessToken(req, res) {
  const cookies = parseCookies(req);
  const refreshToken = cookies[DRIVE_REFRESH_COOKIE];
  if (!refreshToken) return null;
  const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth.refreshAccessToken();
  if (credentials.access_token) setDriveCookies(res, credentials.access_token, null, credentials.expiry_date ? Math.max(60, Math.floor((credentials.expiry_date - Date.now()) / 1000)) : 3600);
  return credentials.access_token || null;
}
async function getDriveToken(req, res) {
  const cookies = parseCookies(req);
  if (cookies[DRIVE_COOKIE]) return cookies[DRIVE_COOKIE];
  return refreshAccessToken(req, res);
}
async function ensureUserData(userId, token) {
  if (!token) throw new Error('Google Drive is not connected');
  const drive = driveClient(token);
  const folderId = await findOrCreateFolder(drive);
  const file = await findDataFile(drive, folderId);
  if (!file) await writeDriveData(emptyData(userId), { drive, folderId, file: null });
  return { connected: true };
}
async function getStatus(req, res) {
  const token = await getDriveToken(req, res);
  if (!token) return { connected: false };
  try {
    const drive = driveClient(token);
    const about = await drive.about.get({ fields: 'user(emailAddress,displayName,photoLink),storageQuota(limit,usage)' });
    return { connected: true, user: about.data.user || null, storageQuota: about.data.storageQuota || null };
  } catch (e) { return { connected: false, error: e.message }; }
}
module.exports = { DRIVE_COOKIE, DRIVE_REFRESH_COOKIE, getDriveToken, setDriveCookie, setDriveCookies, clearDriveCookie, ensureUserData, getStatus, refreshAccessToken };
