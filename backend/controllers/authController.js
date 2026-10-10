'use strict';
const { google } = require('googleapis');
const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const Drive = require('../services/driveStore');
const Auth = require('../middleware/auth');
const { validateBackup } = require('../services/backupSchema');
const { SCHEMA_VERSION } = require('../services/schema');
const { parseCookies, setCookie, clearCookie, encryptValue, decryptValue } = require('../utils/cookies');
const { clearDriveCookie, ensureUserData, getDriveToken, DRIVE_COOKIE, DRIVE_REFRESH_COOKIE, DRIVE_OWNER_COOKIE } = require('../services/googleDrive');

const STATE_COOKIE = 'google_oauth_state';
const YEAR = 31536000;

// Hosting dashboards sometimes store KEY=value instead of value; normalise so Express never sees a broken URL.
function configuredUrl(name, fallback, allowedPath) {
  let value = String(process.env[name] || '').trim();
  if (value) value = value.replace(new RegExp(`^${name}\\s*=\\s*`, 'i'), '').replace(/^['"]|['"]$/g, '').trim();
  try {
    const parsed = new URL(value || fallback);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported URL protocol');
    if (allowedPath && parsed.pathname !== allowedPath) throw new Error('Unexpected URL path');
    return parsed.toString().replace(/\/$/, '');
  } catch (_) { return fallback.replace(/\/$/, ''); }
}
const frontendBaseUrl = (req) => configuredUrl('FRONTEND_URL', `${req.protocol}://${req.get('host')}`);
const googleRedirectUrl = (req) => configuredUrl('GOOGLE_REDIRECT_URI', `${req.protocol}://${req.get('host')}/api/auth/google/callback`, '/api/auth/google/callback');
const oauthClient = (req) => new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleRedirectUrl(req));

function friendlyGoogleError(error) {
  const quota = Number(error?.code || error?.response?.status) === 403 && (
    [...(error?.errors || []), ...(error?.response?.data?.error?.errors || [])].some((i) => i?.reason === 'storageQuotaExceeded')
    || /storageQuotaExceeded|Drive storage quota has been exceeded/i.test(String(error?.message || '')));
  if (quota) return 'Your Google Drive storage is full. Free up space in Google Drive, Gmail, or Google Photos, then sign in again. Rental Manager saves your data in your own Google Drive.';
  if (error instanceof AppError) return error.message;
  return 'Google sign-in could not be completed. Please try again.';
}

const userView = (req, u = {}) => ({
  id: req.userId, name: u.name || req.user?.name, email: req.userEmail,
  profilePic: u.profilePic || req.user?.profilePic || null, profileComplete: !!u.profileComplete,
  googleId: req.user?.googleId || null, isVerified: true
});

const authController = {
  async googleStart(req, res, next) {
    try {
      const state = crypto.randomBytes(24).toString('hex');
      setCookie(res, STATE_COOKIE, state, 600);
      const cookies = parseCookies(req);
      const known = cookies[DRIVE_REFRESH_COOKIE] && cookies[DRIVE_OWNER_COOKIE];
      const prompt = known && req.query.forceConsent !== '1' ? 'select_account' : 'consent select_account';
      res.redirect(oauthClient(req).generateAuthUrl({
        access_type: 'offline', prompt, include_granted_scopes: true,
        scope: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file'], state
      }));
    } catch (e) { next(e); }
  },

  async googleCallback(req, res) {
    const fail = (message) => res.redirect(`${frontendBaseUrl(req)}/?google_auth=error&message=${encodeURIComponent(message)}`);
    try {
      const cookies = parseCookies(req);
      if (!req.query.state || req.query.state !== cookies[STATE_COOKIE]) throw new AppError('Google sign-in session expired. Please try again.', 400);
      if (!req.query.code) throw new AppError('Google sign-in was cancelled.', 400);
      const oauth = oauthClient(req);
      const { tokens } = await oauth.getToken(req.query.code);
      oauth.setCredentials(tokens);
      const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!info.ok) throw new AppError('Unable to read Google account', 401);
      const payload = await info.json();
      if (payload.email_verified === false) throw new AppError('Please use a verified Google account email.', 403);
      if (!payload.sub || !payload.email) throw new AppError('Google did not return an account identity.', 403);
      const user = { id: `google:${payload.sub}`, name: payload.name || payload.email.split('@')[0], email: payload.email, profilePic: payload.picture || null, googleId: payload.sub, isVerified: true };

      // A different account without a fresh refresh token cannot be trusted with the previous account's Drive grant.
      if (!tokens.refresh_token && cookies[DRIVE_OWNER_COOKIE] !== user.id) {
        [Auth.COOKIE_NAME, DRIVE_COOKIE, DRIVE_REFRESH_COOKIE, DRIVE_OWNER_COOKIE, STATE_COOKIE].forEach((n) => clearCookie(res, n));
        return fail('Please continue with Google again to approve Drive access for this account.');
      }
      if (!tokens.access_token) throw new AppError('Google did not grant Google Drive access. Please try again and approve the requested permission.', 403);

      setCookie(res, Auth.COOKIE_NAME, Auth.createSession(user), 604800);
      clearCookie(res, STATE_COOKIE);
      const maxAge = tokens.expiry_date ? Math.max(60, Math.floor((tokens.expiry_date - Date.now()) / 1000) - 60) : 3500;
      setCookie(res, DRIVE_COOKIE, tokens.access_token, maxAge);
      if (tokens.refresh_token) {
        setCookie(res, DRIVE_REFRESH_COOKIE, encryptValue(tokens.refresh_token), YEAR);
        setCookie(res, DRIVE_OWNER_COOKIE, user.id, YEAR);
      }
      await ensureUserData(user.id, tokens.access_token, user);
      if (process.env.LEGACY_DATABASE_URL || process.env.LEGACY_POSTGRES_URL) {
        try { await require('../services/legacyMigration').migrateCurrentUserFromLegacy(user.id, user.email, user.googleId, tokens.access_token); }
        catch (migrationError) { console.warn('Legacy migration skipped:', migrationError.message); }
      }
      res.redirect(`${frontendBaseUrl(req)}/?google_auth=success`);
    } catch (e) {
      console.error('Google OAuth callback error:', e.message);
      fail(friendlyGoogleError(e));
    }
  },

  async exportBackup(req, res, next) {
    try {
      const data = await Drive.getData();
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Disposition', `attachment; filename="rental-manager-backup-${date}.json"`);
      res.json({ ...data, schemaVersion: SCHEMA_VERSION, backup: { source: 'Rental Manager', format: 'rental-manager-backup', exportedAt: new Date().toISOString() } });
    } catch (e) { next(e); }
  },

  /**
   * Validate -> (preview | snapshot -> atomic replace). Nothing is written when
   * validation fails, and `?preview=1` never writes at all.
   */
  async importBackup(req, res, next) {
    try {
      const { data: clean, warnings, counts } = validateBackup(req.body, req.userId);
      if (req.query.preview === '1' || req.query.preview === 'true') {
        return res.json({ success: true, data: { counts, warnings, preview: true }, message: 'Backup is valid. Nothing has been changed yet.' });
      }
      const current = await Drive.getData();
      const owner = { id: req.userId, name: current.user?.name || req.user?.name || '', email: req.userEmail, profilePic: current.user?.profilePic || req.user?.profilePic || null, profileComplete: true };
      await Drive.importValidated(clean, owner);
      res.json({ success: true, data: { ...counts, warnings }, message: 'Backup imported. This Google account now owns the imported records.' });
    } catch (e) { next(e); }
  },

  async backup(req, res, next) {
    try {
      const token = await getDriveToken(req, res);
      if (!token) throw new AppError('Google Drive is not connected', 401);
      const snapshot = await Drive.createBackupSnapshot('manual');
      res.json({ success: true, data: { ...snapshot, updatedAt: new Date().toISOString() }, message: 'Backup created successfully' });
    } catch (e) { next(e); }
  },
  async backupStatus(req, res, next) {
    try { res.json({ success: true, data: await Drive.backupStatus() }); } catch (e) { next(e); }
  },
  async restoreBackup(req, res, next) {
    try {
      const result = await Drive.restoreBackup(req.body?.backupId || null);
      res.json({ success: true, data: result, message: 'Backup restored successfully' });
    } catch (e) { next(e); }
  },
  async startFreshAccount(req, res, next) {
    try {
      const result = await Drive.startFreshAccount();
      res.json({ success: true, data: result, message: 'New empty account created. Existing backup snapshots were preserved.' });
    } catch (e) { next(e); }
  },

  async deletePreview(req, res, next) {
    try { res.json({ success: true, data: await Drive.deletionPreview() }); } catch (e) { next(e); }
  },

  async deleteAccount(req, res, next) {
    try {
      if (String(req.body?.confirmText || '').trim().toLowerCase() !== 'delete my account') throw new AppError('Type delete my account to confirm permanent deletion.', 400);
      const refresh = decryptValue(parseCookies(req)[DRIVE_REFRESH_COOKIE]);
      const deleted = await Drive.deleteUserAccountData({ permanent: req.body?.permanent === true });
      if (refresh) {
        try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refresh }) }); }
        catch (revokeError) { console.warn('Google token revocation after account deletion was skipped:', revokeError.message); }
      }
      Auth.revokeSession(req);
      Auth.clearCookieHeader(res); clearDriveCookie(res); clearCookie(res, STATE_COOKIE);
      const message = deleted.mode === 'trash'
        ? 'Rental Manager data moved to your Google Drive trash (recoverable for 30 days) and you were signed out.'
        : 'Rental Manager account data permanently deleted and signed out.';
      res.json({ success: true, data: deleted, message });
    } catch (e) { next(e); }
  },

  /** Public on purpose: logging out must work even when the session has already expired. */
  async logout(req, res) {
    try { Auth.revokeSession(req); } catch (_) { /* nothing to revoke */ }
    Auth.clearCookieHeader(res);
    clearDriveCookie(res);
    res.json({ success: true, message: 'Logged out successfully' });
  },

  async me(req, res, next) {
    try { res.json({ success: true, data: { user: userView(req, (await Drive.getData()).user || {}) } }); } catch (e) { next(e); }
  },

  async updateProfile(req, res, next) {
    try {
      const { name, profilePic, profileComplete } = req.body || {};
      const updated = await Drive.mutate((d) => {
        d.user = d.user || {};
        d.user.id = req.userId;
        d.user.name = String(name || d.user.name || req.user.name || '').trim();
        d.user.email = req.userEmail;
        d.user.profilePic = profilePic !== undefined ? (profilePic || null) : (d.user.profilePic || req.user.profilePic || null);
        if (profileComplete === true) d.user.profileComplete = true;
        return d.user;
      });
      res.json({ success: true, data: { user: userView(req, updated) }, message: 'Owner profile saved successfully' });
    } catch (e) { next(e); }
  }
};
module.exports = authController;
