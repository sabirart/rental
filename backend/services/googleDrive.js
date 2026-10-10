'use strict';
const { google } = require('googleapis');
const Drive = require('./driveStore');
const { parseCookies, appendCookie, setCookie, clearCookie, encryptValue, decryptValue } = require('../utils/cookies');

const DRIVE_COOKIE = 'google_drive_token';
const DRIVE_REFRESH_COOKIE = 'google_drive_refresh_token';
const DRIVE_OWNER_COOKIE = 'google_drive_owner';
const YEAR = 60 * 60 * 24 * 365;

/** Stores the short-lived access token and (when present) the encrypted refresh token. */
function setDriveCookies(res, token, refreshToken, expiresIn = 3600, ownerId = null) {
  if (token) setCookie(res, DRIVE_COOKIE, token, Math.max(60, Number(expiresIn) - 60));
  if (refreshToken) {
    setCookie(res, DRIVE_REFRESH_COOKIE, encryptValue(refreshToken), YEAR);
    const owner = ownerId || Drive.getContext().userId;
    if (owner) setCookie(res, DRIVE_OWNER_COOKIE, owner, YEAR);
  }
}
const setDriveCookie = (res, token, expiresIn = 3600) => setDriveCookies(res, token, null, expiresIn);
function clearDriveCookie(res) {
  [DRIVE_COOKIE, DRIVE_REFRESH_COOKIE, DRIVE_OWNER_COOKIE].forEach((name) => clearCookie(res, name));
}

async function refreshAccessToken(req, res) {
  const refreshToken = decryptValue(parseCookies(req)[DRIVE_REFRESH_COOKIE]);
  if (!refreshToken) return null;
  const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: refreshToken });
  try {
    const { credentials } = await oauth.refreshAccessToken();
    if (credentials.access_token) {
      const expiresIn = credentials.expiry_date ? Math.max(60, Math.floor((credentials.expiry_date - Date.now()) / 1000)) : 3600;
      setDriveCookies(res, credentials.access_token, credentials.refresh_token || refreshToken, expiresIn, req.userId);
    }
    return credentials.access_token || null;
  } catch (error) {
    // A revoked/expired refresh token triggers a clean Google re-consent path.
    clearDriveCookie(res);
    console.warn('Google Drive token refresh failed; user re-consent is required:', error.message);
    return null;
  }
}

async function getDriveToken(req, res) {
  const cookies = parseCookies(req);
  const expectedOwner = req.userId;
  if (expectedOwner && cookies[DRIVE_OWNER_COOKIE] && cookies[DRIVE_OWNER_COOKIE] !== expectedOwner) { clearDriveCookie(res); return null; }
  if (cookies[DRIVE_COOKIE]) return cookies[DRIVE_COOKIE];
  return refreshAccessToken(req, res);
}

const ensureUserData = (userId, token, profile = {}) => {
  if (!token) throw new Error('Google Drive is not connected');
  return Drive.ensureUserData(userId, token, profile);
};

async function getStatus(req, res) {
  const token = await getDriveToken(req, res);
  if (!token) return { connected: false };
  try {
    const about = await Drive.driveClient(token).about.get({ fields: 'user(emailAddress,displayName,photoLink),storageQuota(limit,usage)' });
    return { connected: true, user: about.data.user || null, storageQuota: about.data.storageQuota || null };
  } catch (e) { return { connected: false }; }
}

module.exports = {
  DRIVE_COOKIE, DRIVE_REFRESH_COOKIE, DRIVE_OWNER_COOKIE, getDriveToken, setDriveCookie, setDriveCookies,
  clearDriveCookie, ensureUserData, getStatus, refreshAccessToken, appendCookie
};
