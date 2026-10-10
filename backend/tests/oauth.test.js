'use strict';
const { app, request, fake, Auth } = require('./helpers/app');
const { google } = require('googleapis');

const setCookies = (r) => (r.headers['set-cookie'] || []).join('\n');
const jar = (r) => (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

describe('Google OAuth flow (Google endpoints mocked)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('start redirects to Google with state cookie and drive.file scope only', async () => {
    const r = await request(app).get('/api/auth/google/start');
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.location);
    expect(loc.searchParams.get('scope')).toMatch(/drive\.file/);
    expect(loc.searchParams.get('scope')).not.toMatch(/auth\/drive(\s|$)/);
    expect(loc.searchParams.get('state')).toHaveLength(48);
    expect(setCookies(r)).toMatch(/google_oauth_state=.*HttpOnly/);
  });

  test('callback with a wrong state is rejected', async () => {
    const r = await request(app).get('/api/auth/google/callback?state=bad&code=x').set('Cookie', 'google_oauth_state=good');
    expect(r.status).toBe(302);
    expect(r.headers.location).toMatch(/google_auth=error/);
    expect(setCookies(r)).not.toMatch(/rental_session=[^;]/);
  });

  test('successful callback: session + encrypted refresh cookie + data file created', async () => {
    jest.spyOn(google.auth.OAuth2.prototype, 'getToken').mockResolvedValue({ tokens: { access_token: 'tok-oauth', refresh_token: 'REFRESH-SECRET', expiry_date: Date.now() + 3600e3 } });
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ sub: '777', email: 'o@x.com', email_verified: true, name: 'Oauth User' }) });
    const r = await request(app).get('/api/auth/google/callback?state=s1&code=c').set('Cookie', 'google_oauth_state=s1');
    expect(r.headers.location).toMatch(/google_auth=success/);
    const cookies = setCookies(r);
    expect(cookies).toMatch(/rental_session=[^;]+/);
    expect(cookies).not.toMatch(/REFRESH-SECRET/); // refresh token is encrypted at rest in the cookie
    expect(cookies).toMatch(/google_drive_refresh_token=v1\./);
    expect(fake.account('tok-oauth').find((f) => f.name === 'rental-manager-data.json')).toHaveLength(1);
    const me = await request(app).get('/api/auth/me').set('Cookie', jar(r));
    expect(me.body.data.user).toMatchObject({ id: 'google:777', email: 'o@x.com', name: 'Oauth User' });
  });

  test('expired access token is transparently refreshed from the encrypted cookie', async () => {
    const first = await (async () => {
      jest.spyOn(google.auth.OAuth2.prototype, 'getToken').mockResolvedValue({ tokens: { access_token: 'tok-r1', refresh_token: 'R2', expiry_date: Date.now() + 3600e3 } });
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ sub: '888', email: 'r@x.com', email_verified: true, name: 'R' }) });
      return request(app).get('/api/auth/google/callback?state=s&code=c').set('Cookie', 'google_oauth_state=s');
    })();
    const cookie = jar(first).split('; ').filter((c) => !c.startsWith('google_drive_token=') && !c.startsWith('google_oauth_state=')).join('; ');
    const refresh = jest.spyOn(google.auth.OAuth2.prototype, 'refreshAccessToken').mockImplementation(function () {
      expect(this.credentials.refresh_token).toBe('R2'); // decrypted correctly
      return Promise.resolve({ credentials: { access_token: 'tok-r1', expiry_date: Date.now() + 3600e3 } });
    });
    const r = await request(app).get('/api/tenants').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setCookies(r)).toMatch(/google_drive_token=tok-r1/);
  });

  test('a revoked refresh token clears Drive cookies and yields 401', async () => {
    const user = { id: 'google:999', email: 'z@x.com' };
    jest.spyOn(google.auth.OAuth2.prototype, 'refreshAccessToken').mockRejectedValue(new Error('invalid_grant'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { encryptValue } = require('../utils/cookies');
    const cookie = `rental_session=${encodeURIComponent(Auth.createSession(user))}; google_drive_refresh_token=${encodeURIComponent(encryptValue('dead'))}; google_drive_owner=${encodeURIComponent(user.id)}`;
    const r = await request(app).get('/api/tenants').set('Cookie', cookie);
    expect(r.status).toBe(401);
    expect(setCookies(r)).toMatch(/google_drive_refresh_token=;/);
  });

  test('a Drive grant owned by another account is never used', async () => {
    const user = { id: 'google:me', email: 'm@x.com' };
    const cookie = `rental_session=${encodeURIComponent(Auth.createSession(user))}; google_drive_token=tok-victim; google_drive_owner=${encodeURIComponent('google:victim')}`;
    expect((await request(app).get('/api/tenants').set('Cookie', cookie)).status).toBe(401);
  });

  test('drive status route works with only a refresh cookie (previous crash)', async () => {
    const user = { id: 'google:st', email: 'st@x.com' };
    const { encryptValue } = require('../utils/cookies');
    jest.spyOn(google.auth.OAuth2.prototype, 'refreshAccessToken').mockResolvedValue({ credentials: { access_token: 'tok-st', expiry_date: Date.now() + 3600e3 } });
    const cookie = `rental_session=${encodeURIComponent(Auth.createSession(user))}; google_drive_refresh_token=${encodeURIComponent(encryptValue('r'))}; google_drive_owner=${encodeURIComponent(user.id)}`;
    const r = await request(app).get('/api/auth/google-drive/status').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.data.connected).toBe(true);
  });
});
