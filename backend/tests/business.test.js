'use strict';
const { agentFor, seedProperty, tenantBody } = require('./helpers/app');

let n = 0;
const fresh = async () => { n += 1; const a = agentFor(`biz${n}`); const prop = await seedProperty(a); return { a, prop }; };
const pay = (t, o = {}) => ({ tenantId: t.id, month: 3, year: 2025, monthlyRent: 7000, electricity: 2000, gas: 1000, ...o });

describe('payments: server is the source of truth (C-01)', () => {
  test('partial amount typed by the user is stored exactly', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    const r = await a.post('/api/payments').send(pay(t, { amountPaid: 4000, status: 'partial' }));
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ amount_paid: 4000, total_payment: 10000, status: 'partial' });
    const u = await a.put(`/api/payments/${r.body.data.id}`).send(pay(t, { amountPaid: 10000 }));
    expect(u.body.data).toMatchObject({ amount_paid: 10000, status: 'paid' });
    const z = await a.put(`/api/payments/${r.body.data.id}`).send(pay(t, { amountPaid: 0 }));
    expect(z.body.data).toMatchObject({ amount_paid: 0, status: 'unpaid' });
  });
  test('omitted amount/flags fail closed (nothing received), never "paid"', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    const r = await a.post('/api/payments').send(pay(t));
    expect(r.body.data).toMatchObject({ amount_paid: 0, status: 'unpaid' });
  });
  test('status-only clients: paid => total, unpaid => 0, partial without amount rejected', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    const paid = await a.post('/api/payments').send(pay(t, { month: 1, status: 'paid' }));
    expect(paid.body.data).toMatchObject({ amount_paid: 10000, status: 'paid' });
    const part = await a.post('/api/payments').send(pay(t, { month: 2, status: 'partial' }));
    expect(part.status).toBe(400);
  });
  test('legacy per-charge flags still work when no amount is sent', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    const r = await a.post('/api/payments').send(pay(t, { rentEnabled: true, electricityEnabled: false, gasEnabled: true, previousDuesEnabled: false }));
    expect(r.body.data).toMatchObject({ amount_paid: 8000, status: 'partial' });
  });
  test('amount above total, negative and absurd values are rejected', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    expect((await a.post('/api/payments').send(pay(t, { amountPaid: 10001 }))).status).toBe(400);
    expect((await a.post('/api/payments').send(pay(t, { amountPaid: -1 }))).status).toBe(400);
    expect((await a.post('/api/payments').send(pay(t, { monthlyRent: 1e15 }))).status).toBe(400);
  });
  test('duplicate month for a tenant is rejected', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    expect((await a.post('/api/payments').send(pay(t))).status).toBe(201);
    expect((await a.post('/api/payments').send(pay(t))).status).toBe(400);
  });
  test('client cannot choose the payment id', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    const r = await a.post('/api/payments').send({ ...pay(t), id: 'chosen-id' });
    expect(r.body.data.id).not.toBe('chosen-id');
  });
  test('payment for a foreign/unknown tenant is 404', async () => {
    const { a } = await fresh();
    expect((await a.post('/api/payments').send({ tenantId: 'nope', month: 1, year: 2025, monthlyRent: 1 })).status).toBe(404);
  });
});

describe('payments rollover (H-01, H-02)', () => {
  test('GET endpoints never write; parallel loads all succeed', async () => {
    const { a, prop } = await fresh();
    await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }));
    const before = a.account.calls.filter((c) => c === 'update' || c === 'create').length;
    const rs = await Promise.all([a.get('/api/payments'), a.get('/api/payments'), a.get('/api/payments/dashboard-stats'), a.get('/api/payments/dashboard-stats')]);
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(a.account.calls.filter((c) => c === 'update' || c === 'create').length).toBe(before);
  });
  test('rollover is idempotent, concurrent-safe, prefilled with rent and not counted as paid', async () => {
    const { a, prop } = await fresh();
    const t1 = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    const t2 = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id, cnic: '12345-1234567-2', roomNumber: 2, name: 'Second' }))).body.data;
    // Remove this month's rows to simulate a new month.
    await a.delete('/api/payments/clear?confirm=yes');
    const rs = await Promise.all([a.post('/api/payments/rollover'), a.post('/api/payments/rollover'), a.post('/api/payments/rollover')]);
    rs.forEach((r) => expect(r.status).toBe(200));
    const all = (await a.get('/api/payments')).body.data;
    expect(all).toHaveLength(2);
    all.forEach((p) => expect(p).toMatchObject({ monthly_rent: 10000, status: 'unpaid', amount_paid: 0, placeholder: true }));
    const stats = (await a.get('/api/payments/dashboard-stats')).body.data;
    expect(stats).toMatchObject({ paidPayments: 0, unpaidPayments: 2 });
    const again = await a.post('/api/payments/rollover');
    expect(again.body.data.created).toBe(0);
    expect(t1.id && t2.id).toBeTruthy();
  });
  test('recording a payment fills the placeholder instead of conflicting', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    await a.delete('/api/payments/clear?confirm=yes');
    await a.post('/api/payments/rollover');
    const ph = (await a.get('/api/payments')).body.data[0];
    const r = await a.post('/api/payments').send({ tenantId: t.id, month: ph.month, year: ph.year, monthlyRent: 10000, amountPaid: 10000 });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: ph.id, status: 'paid' });
    expect(r.body.data.placeholder).toBeUndefined();
    expect((await a.get('/api/payments')).body.data).toHaveLength(1);
  });
  test('rooms without rent produce an "unbilled" row, never "paid"', async () => {
    const { a } = await fresh();
    const prop = await seedProperty(a, { name: 'Free Rooms', baseRent: 0 });
    await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id, cnic: '99999-9999999-9' }));
    await a.delete('/api/payments/clear?confirm=yes');
    await a.post('/api/payments/rollover');
    const row = (await a.get('/api/payments')).body.data[0];
    expect(row.status).toBe('unbilled');
    expect((await a.get('/api/payments/dashboard-stats')).body.data.paidPayments).toBe(0);
  });
  test('payments/clear needs explicit confirmation and takes a snapshot', async () => {
    const { a, prop } = await fresh();
    await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }));
    expect((await a.delete('/api/payments/clear')).status).toBe(400);
    const before = [...a.account.files.values()].filter((f) => f.name?.startsWith('rental-manager-backup-')).length;
    expect((await a.delete('/api/payments/clear?confirm=yes')).status).toBe(200);
    const after = [...a.account.files.values()].filter((f) => f.name?.startsWith('rental-manager-backup-')).length;
    expect(after).toBeGreaterThan(before);
    expect((await a.get('/api/payments')).body.data).toEqual([]);
  });
});

describe('tenants & rooms', () => {
  test('inactive tenant frees the room; re-activation re-occupies (H-03)', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    let rooms = (await a.get(`/api/properties/${prop.id}/rooms`)).body.data;
    expect(rooms[0]).toMatchObject({ status: 'occupied', tenant_id: t.id });
    await a.put(`/api/tenants/${t.id}`).send(tenantBody({ propertyId: prop.id, status: 'inactive' }));
    rooms = (await a.get(`/api/properties/${prop.id}/rooms`)).body.data;
    expect(rooms[0]).toMatchObject({ status: 'available', tenant_id: null });
    const t2 = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id, cnic: '22222-2222222-2', name: 'New' }))).body.data;
    expect(t2.id).toBeDefined();
    // inactive tenant can still be edited while their old room is re-let
    const edit = await a.put(`/api/tenants/${t.id}`).send(tenantBody({ propertyId: prop.id, status: 'inactive', location: 'Lahore' }));
    expect(edit.status).toBe(200);
    // ...but cannot be re-activated into an occupied room
    const react = await a.put(`/api/tenants/${t.id}`).send(tenantBody({ propertyId: prop.id, status: 'active' }));
    expect(react.status).toBe(400);
  });
  test('occupied room and duplicate CNIC are rejected', async () => {
    const { a, prop } = await fresh();
    await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }));
    expect((await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id, cnic: '33333-3333333-3' }))).body.error).toMatch(/occupied/i);
    expect((await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id, roomNumber: 2 }))).body.error).toMatch(/CNIC/i);
  });
  test('client-supplied ids are ignored for tenants and properties (M-06)', async () => {
    const { a } = await fresh();
    const p1 = (await a.post('/api/properties').send({ id: 'dup', name: 'Prop One', address: '12345 Road', totalRooms: 2, baseRent: 1 })).body.data;
    const p2 = (await a.post('/api/properties').send({ id: p1.id, name: 'Prop Two', address: '12345 Road', totalRooms: 2, baseRent: 1 })).body.data;
    expect(p1.id).not.toBe('dup');
    expect(p2.id).not.toBe(p1.id);
    const list = (await a.get('/api/properties')).body.data;
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
  });
  test('tenant edits keep photos/documents when the fields are omitted', async () => {
    const { a, prop } = await fresh();
    const pic = 'data:image/png;base64,iVBORw0KGgo=';
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id, profile_pic: pic }))).body.data;
    const u = (await a.put(`/api/tenants/${t.id}`).send(tenantBody({ propertyId: prop.id, location: 'Multan' }))).body.data;
    expect(u.profile_pic).toBe(pic);
  });
  test('non-image profile_pic and script-ish data are rejected (M-09/M-02)', async () => {
    const { a, prop } = await fresh();
    const bad = await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id, profile_pic: 'x" onerror="alert(1)' }));
    expect(bad.status).toBe(400);
  });
  test('text is stored as typed, not HTML-encoded (M-07)', async () => {
    const { a } = await fresh();
    const r = await a.post('/api/properties').send({ name: "O'Brien Plaza & Co", address: '12345 Road', totalRooms: 1, baseRent: 1 });
    expect(r.body.data.name).toBe("O'Brien Plaza & Co");
  });
  test('removing a middle room keeps later rooms assignable (M-08)', async () => {
    const { a, prop } = await fresh();
    expect((await a.delete(`/api/properties/${prop.id}/rooms/2`)).status).toBe(200);
    const p = (await a.get(`/api/properties/${prop.id}`)).body.data;
    expect(p.total_rooms).toBe(4);
    expect(p.room_count).toBe(3);
    const ok = await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id, roomNumber: 4 }));
    expect(ok.status).toBe(201);
    const gone = await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id, roomNumber: 2, cnic: '44444-4444444-4' }));
    expect(gone.status).toBe(404);
  });
  test('editing a room name/rent does not unlink its tenant', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    await a.put(`/api/properties/${prop.id}/rooms/1`).send({ roomName: 'Master', rentAmount: 12000 });
    const room = (await a.get(`/api/properties/${prop.id}/rooms`)).body.data[0];
    expect(room).toMatchObject({ room_name: 'Master', rent_amount: 12000, status: 'occupied', tenant_id: t.id });
  });
  test('deleting a tenant archives tenant+payments; recovery restores them', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    expect((await a.delete(`/api/tenants/${t.id}`)).status).toBe(200);
    const bin = (await a.get('/api/recycle')).body.data;
    expect(bin).toHaveLength(1);
    const rec = await a.post(`/api/recycle/recover/${bin[0].id}`);
    expect(rec.status).toBe(200);
    expect((await a.get('/api/tenants')).body.data).toHaveLength(1);
    expect((await a.get('/api/payments')).body.data.length).toBeGreaterThan(0);
    expect((await a.get(`/api/properties/${prop.id}/rooms`)).body.data[0].status).toBe('occupied');
  });
  test('property with active tenants cannot be deleted', async () => {
    const { a, prop } = await fresh();
    await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }));
    expect((await a.delete(`/api/properties/${prop.id}`)).status).toBe(400);
  });
});

describe('recycle bin & settings', () => {
  test('purge with days=0 / negative / junk is rejected and removes nothing (M-09)', async () => {
    const { a, prop } = await fresh();
    const t = (await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }))).body.data;
    await a.delete(`/api/tenants/${t.id}`);
    for (const d of ['0', '-5', 'abc']) expect((await a.delete(`/api/recycle/clear/old?days=${d}`)).status).toBe(400);
    expect((await a.get('/api/recycle')).body.data).toHaveLength(1);
    expect((await a.delete('/api/recycle/clear/old?days=15')).status).toBe(200);
    expect((await a.get('/api/recycle')).body.data).toHaveLength(1);
  });
  test('settings validate the reset day', async () => {
    const { a } = await fresh();
    expect((await a.put('/api/settings').send({ monthlyResetDay: 40 })).status).toBe(400);
    const ok = await a.put('/api/settings').send({ monthlyResetDay: 15, notificationsEnabled: false });
    expect(ok.body.data).toMatchObject({ monthlyResetDay: 15, notificationsEnabled: false });
    expect((await a.get('/api/settings')).body.data.monthlyResetDay).toBe(15);
  });
  test('clear-all is atomic, snapshot-first and recoverable', async () => {
    const { a, prop } = await fresh();
    await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }));
    const r = await a.delete('/api/settings/data');
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ tenants: 1, properties: 1 });
    expect((await a.get('/api/tenants')).body.data).toEqual([]);
    expect((await a.get('/api/properties')).body.data).toEqual([]);
    expect((await a.get('/api/payments')).body.data).toEqual([]);
    expect((await a.get('/api/recycle/count')).body.data.total).toBe(2);
    const snaps = (await a.get('/api/auth/backup/status')).body.data.backups;
    expect(snaps.length).toBeGreaterThan(0);
  });
});
