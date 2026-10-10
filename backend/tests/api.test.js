'use strict';
const { app, agentFor, request, Auth, fake, seedProperty, tenantBody } = require('./helpers/app');

describe('platform & security basics', () => {
  test('health and readiness', async () => {
    expect((await request(app).get('/api/health')).body.status).toBe('OK');
    expect((await request(app).get('/api/ready')).status).toBe(200);
  });
  test('CSP has no unsafe-inline for scripts', async () => {
    const csp = (await request(app).get('/api/health')).headers['content-security-policy'];
    const script = csp.split(';').find((d) => d.trim().startsWith('script-src '));
    expect(script).toBe("script-src 'self'");
    expect(csp).toMatch(/script-src-attr 'none'/);
    expect(csp).not.toMatch(/cdnjs/);
  });
  test('unauthenticated and forged sessions are rejected (401)', async () => {
    expect((await request(app).get('/api/tenants')).status).toBe(401);
    const forged = (await request(app).get('/api/tenants').set('Cookie', 'rental_session=abc.def')).status;
    expect(forged).toBe(401);
    const good = Auth.createSession({ id: 'google:1', email: 'a@b.c' });
    const tampered = good.slice(0, -3) + 'xxx';
    expect((await request(app).get('/api/tenants').set('Cookie', `rental_session=${tampered}`)).status).toBe(401);
  });
  test('cross-site mutating request is blocked, same-origin allowed', async () => {
    const a = agentFor('csrf');
    const blocked = await a.post('/api/properties').set('Origin', 'https://evil.example').send({});
    expect(blocked.status).toBe(403);
    const sf = await a.post('/api/properties').set('Sec-Fetch-Site', 'cross-site').send({});
    expect(sf.status).toBe(403);
    const ok = await a.post('/api/properties').set('Origin', 'http://127.0.0.1:5000').send({});
    expect(ok.status).toBe(400); // passes the guard, fails validation
  });
  test('logout works with an expired/invalid session and clears cookies', async () => {
    const r = await request(app).post('/api/auth/logout').set('Cookie', 'rental_session=garbage');
    expect(r.status).toBe(200);
    expect(r.headers['set-cookie'].join(';')).toMatch(/rental_session=;/);
  });
  test('logout revokes the session server-side', async () => {
    const a = agentFor('revoke');
    expect((await a.get('/api/tenants')).status).toBe(200);
    await a.post('/api/auth/logout');
    expect((await a.get('/api/tenants')).status).toBe(401);
  });
  test('missing Drive token is 401, not a generic 400', async () => {
    const a = agentFor('notoken');
    const cookie = a.cookie.replace(/;\s*google_drive_token=[^;]*/, '');
    const r = await request(app).get('/api/tenants').set('Cookie', cookie);
    expect(r.status).toBe(401);
  });
  test('unexpected faults are 500 with a generic message (no internals)', async () => {
    const a = agentFor('boom');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    a.account.failCreateWith = new TypeError('Cannot read properties of undefined (reading secret)');
    const r = await a.get('/api/tenants');
    expect(r.status).toBe(500);
    expect(r.body.error).not.toMatch(/Cannot read/);
    expect(r.body.errorId).toBeDefined();
    spy.mockRestore();
  });
  test('validation errors never echo submitted values', async () => {
    const a = agentFor('echo');
    const r = await a.post('/api/tenants').send({ name: 'X', cnic: 'SECRET-CNIC-VALUE' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toMatch(/SECRET-CNIC-VALUE/);
  });
  test('malformed JSON is a clean 400', async () => {
    const a = agentFor('badjson');
    const r = await a.post('/api/properties').set('Content-Type', 'application/json').send('{bad');
    expect(r.status).toBe(400);
  });
  test('oversized body is a friendly 413', async () => {
    const a = agentFor('big');
    const r = await a.post('/api/properties').set('Content-Type', 'application/json').send(JSON.stringify({ name: 'x'.repeat(29 * 1024 * 1024) }));
    expect(r.status).toBe(413);
  });
  test('unknown API route is 404 JSON', async () => {
    expect((await agentFor('nf').get('/api/nope')).status).toBe(404);
  });
  test('frontend is served with revalidation caching and compression', async () => {
    const r = await request(app).get('/');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-cache');
    const js = await request(app).get('/js/app.js').set('Accept-Encoding', 'gzip');
    expect(js.headers['content-encoding']).toBe('gzip');
  });
});

describe('account isolation', () => {
  test('another account cannot read or change my records by id', async () => {
    const A = agentFor('iso-a'); const B = agentFor('iso-b');
    const prop = await seedProperty(A);
    const t = (await A.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    expect((await B.get(`/api/tenants/${t.id}`)).status).toBe(404);
    expect((await B.get(`/api/properties/${prop.id}`)).status).toBe(404);
    expect((await B.delete(`/api/tenants/${t.id}`)).status).toBe(404);
    expect((await B.put(`/api/properties/${prop.id}/rooms/1`).send({ roomName: 'hax' })).status).toBe(404);
    expect((await B.get('/api/tenants')).body.data).toEqual([]);
    expect((await A.get(`/api/tenants/${t.id}`)).status).toBe(200);
  });
});
