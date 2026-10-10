'use strict';
const { agentFor, seedProperty, tenantBody } = require('./helpers/app');
const { validateBackup } = require('../services/backupSchema');

let n = 0;
const user = () => { n += 1; return agentFor(`bk${n}`); };
const PIC = 'data:image/png;base64,iVBORw0KGgo=';
const good = () => ({
  schemaVersion: 3,
  properties: [{ id: 'p1', name: 'Plaza', address: '12 Main Road', total_rooms: 2, base_rent: 5000 }],
  rooms: [{ id: 'p1-room-1', property_id: 'p1', room_number: 1, status: 'occupied', tenant_id: 't1', rent_amount: 5000 }, { id: 'p1-room-2', property_id: 'p1', room_number: 2, status: 'available', rent_amount: 5000 }],
  tenants: [{ id: 't1', name: 'Ali', father_name: 'Khan', cnic: '12345-1234567-1', location: 'Karachi', property_id: 'p1', room_number: 1, status: 'active', profile_pic: PIC, documents: [] }],
  payments: [{ id: 'pay1', tenant_id: 't1', month: 3, year: 2025, monthly_rent: 5000, electricity: 500, amount_paid: 1000 }],
  recycleBin: []
});

describe('backup import validation (F-03, M-02)', () => {
  test('a valid backup imports with relationships, totals and statuses normalised', async () => {
    const a = user();
    const r = await a.post('/api/auth/backup/import').send(good());
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ properties: 1, rooms: 2, tenants: 1, payments: 1 });
    const pay = (await a.get('/api/payments')).body.data.find((p) => p.id === 'pay1');
    expect(pay).toMatchObject({ total_payment: 5500, amount_paid: 1000, status: 'partial', user_id: a.user.id });
    expect((await a.get('/api/properties/p1/rooms')).body.data[0]).toMatchObject({ status: 'occupied', tenant_id: 't1' });
  });
  test('preview validates without writing anything', async () => {
    const a = user();
    const r = await a.post('/api/auth/backup/import?preview=1').send(good());
    expect(r.body.data).toMatchObject({ preview: true, counts: { tenants: 1 } });
    expect((await a.get('/api/tenants')).body.data).toEqual([]);
  });
  test('hostile attribute-breaking image payloads are rejected and live data is untouched', async () => {
    const a = user();
    await seedProperty(a, { name: 'Keep Me' });
    const evil = good(); evil.tenants[0].profile_pic = 'x" onerror="alert(1)';
    const r = await a.post('/api/auth/backup/import').send(evil);
    expect(r.status).toBe(400);
    expect(r.body.details.join(' ')).toMatch(/tenants\[0\]\.profile_pic/);
    expect((await a.get('/api/properties')).body.data.map((p) => p.name)).toEqual(['Keep Me']);
  });
  test.each([
    ['not an object', 'hello'],
    ['missing arrays', { properties: [] }],
    ['arrays of junk', { properties: [1], tenants: [null], payments: ['x'] }],
    ['bad CNIC', (() => { const g = good(); g.tenants[0].cnic = '123'; return g; })()],
    ['duplicate property ids', (() => { const g = good(); g.properties.push({ ...g.properties[0] }); return g; })()],
    ['duplicate tenant ids', (() => { const g = good(); g.tenants.push({ ...g.tenants[0], cnic: '99999-9999999-9' }); return g; })()],
    ['absurd money', (() => { const g = good(); g.payments[0].monthly_rent = 1e15; return g; })()],
    ['amount paid above total', (() => { const g = good(); g.payments[0].amount_paid = 999999; return g; })()],
    ['bad month', (() => { const g = good(); g.payments[0].month = 13; return g; })()],
    ['two tenants in one room', (() => { const g = good(); g.tenants.push({ ...g.tenants[0], id: 't2', cnic: '99999-9999999-9' }); return g; })()],
    ['document with executable type', (() => { const g = good(); g.tenants[0].documents = [{ name: 'a', data: 'data:text/html;base64,PHNjcmlwdD4=' }]; return g; })()],
    ['too many documents', (() => { const g = good(); g.tenants[0].documents = Array(6).fill({ name: 'a', data: PIC }); return g; })()],
    ['newer schema', { ...good(), schemaVersion: 50 }]
  ])('rejects: %s', async (_name, body) => {
    const a = user();
    await seedProperty(a, { name: 'Keep Me' });
    const r = await a.post('/api/auth/backup/import').send(body);
    expect(r.status).toBe(400);
    expect((await a.get('/api/properties')).body.data.map((p) => p.name)).toEqual(['Keep Me']);
  });
  test('unknown fields are dropped and ownership is rewritten to the importer', () => {
    const g = good(); g.properties[0].user_id = 'google:victim'; g.properties[0].__proto__x = 1; g.tenants[0].evil = '<script>';
    const { data } = validateBackup(g, 'google:me');
    expect(data.properties[0].user_id).toBe('google:me');
    expect(data.tenants[0].evil).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/__proto__x|<script>/);
  });
  test('orphans are reported as warnings instead of corrupting relationships', () => {
    const g = good(); g.payments.push({ id: 'orph', tenant_id: 'ghost', month: 1, year: 2025, monthly_rent: 1 });
    const { data, warnings } = validateBackup(g, 'google:me');
    expect(data.payments.map((p) => p.id)).toEqual(['pay1']);
    expect(warnings.join(' ')).toMatch(/unknown tenants/);
  });
  test('import takes a pre-import snapshot of existing data', async () => {
    const a = user();
    await seedProperty(a, { name: 'Before Import' });
    await a.post('/api/auth/backup/import').send(good());
    const snaps = a.account.find((f) => f.name?.startsWith('rental-manager-backup-')).map((f) => JSON.parse(f.content));
    expect(snaps.some((s) => s.backup.reason === 'pre-import' && s.properties[0].name === 'Before Import')).toBe(true);
  });
  test('legacy exports (no rooms list, camelCase fields) still import', async () => {
    const a = user();
    const legacy = { properties: [{ id: 'lp', name: 'Legacy', address: '12345 Road', totalRooms: 3, baseRent: 100 }], tenants: [], payments: [] };
    const r = await a.post('/api/auth/backup/import').send(legacy);
    expect(r.status).toBe(200);
    expect(r.body.data.rooms).toBe(3);
  });
  test('export then import round-trips', async () => {
    const a = user(); const b = user();
    const prop = await seedProperty(a);
    await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }));
    const exported = (await a.get('/api/auth/backup/export')).body;
    const r = await b.post('/api/auth/backup/import').send(exported);
    expect(r.status).toBe(200);
    expect((await b.get('/api/tenants')).body.data).toHaveLength(1);
    expect((await b.get('/api/tenants')).body.data[0].user_id).toBe(b.user.id);
  });
});
