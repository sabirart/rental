'use strict';
const { agentFor, seedProperty, tenantBody, Drive, fake } = require('./helpers/app');
const { SCHEMA_VERSION } = require('../services/schema');

const live = (a) => { const f = a.account.find((x) => x.name === 'rental-manager-data.json')[0]; return { file: f, json: JSON.parse(f.content) }; };
const backups = (a) => a.account.find((x) => x.name?.startsWith('rental-manager-backup-') && !x.trashed);
let n = 0;
const user = () => { n += 1; return agentFor(`store${n}`); };

describe('schema version (F-04)', () => {
  test('fresh, mutated and restored data are all stamped with the current version', async () => {
    const a = user();
    await a.get('/api/tenants');
    await seedProperty(a);
    expect(live(a).json.schemaVersion).toBe(SCHEMA_VERSION);
    const snap = await a.post('/api/auth/backup');
    expect(snap.status).toBe(200);
    expect(JSON.parse(backups(a)[0].content).schemaVersion).toBe(SCHEMA_VERSION);
    await a.post('/api/auth/backup/restore').send({});
    expect(live(a).json.schemaVersion).toBe(SCHEMA_VERSION);
  });
  test('a file stamped v2 by an older build is migrated, not rejected', async () => {
    const a = user();
    await seedProperty(a);
    const { file, json } = live(a);
    file.content = JSON.stringify({ ...json, schemaVersion: 2 });
    file.version = String(Number(file.version) + 1);
    expect((await a.get('/api/properties')).body.data).toHaveLength(1);
    await seedProperty(a, { name: 'Another Prop' });
    expect(live(a).json.schemaVersion).toBe(SCHEMA_VERSION);
  });
  test('a file from a newer schema is refused instead of being downgraded', async () => {
    const a = user();
    await seedProperty(a);
    const { file, json } = live(a);
    file.content = JSON.stringify({ ...json, schemaVersion: 99 });
    file.version = '777';
    const r = await a.get('/api/properties');
    expect(r.status).toBe(409);
  });
  test('a corrupt data file is reported and never overwritten', async () => {
    const a = user();
    await seedProperty(a);
    const { file } = live(a);
    file.content = '{not json'; file.version = '888';
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = await a.post('/api/properties').send({ name: 'Prop Two', address: '12345 Road', totalRooms: 1, baseRent: 1 });
    spy.mockRestore();
    expect(r.status).toBe(500);
    expect(file.content).toBe('{not json');
  });
});

describe('write consistency (F-02)', () => {
  test('a competing writer between read and write is detected and the mutation is retried on fresh data', async () => {
    const a = user();
    await seedProperty(a, { name: 'First Prop' });
    const { file } = live(a);
    // Another instance adds a property between our read and our write.
    a.account.beforeVersionCheck = async (f) => {
      const doc = JSON.parse(f.content);
      doc.properties.push({ id: 'other-instance', user_id: a.user.id, name: 'From Other Instance', address: 'x', total_rooms: 0, base_rent: 0, status: 'active', created_at: new Date().toISOString() });
      f.content = JSON.stringify(doc);
      f.version = String(Number(f.version) + 1);
    };
    const r = await a.post('/api/properties').send({ name: 'Second Prop', address: '12345 Road', totalRooms: 1, baseRent: 1 });
    expect(r.status).toBe(201);
    const names = live(a).json.properties.map((p) => p.name).sort();
    expect(names).toEqual(['First Prop', 'From Other Instance', 'Second Prop']);
    expect(file.id).toBeDefined();
  });
  test('many parallel writes in one process are all kept', async () => {
    const a = user();
    await seedProperty(a);
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => a.post('/api/properties').send({ name: `Parallel ${i}`, address: '12345 Road', totalRooms: 1, baseRent: 1 })));
    rs.forEach((r) => expect(r.status).toBe(201));
    expect(live(a).json.properties).toHaveLength(13);
  });
  test('a failed mutation leaves stored data untouched', async () => {
    const a = user();
    const prop = await seedProperty(a);
    await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }));
    const before = live(a).file.content;
    const bad = await a.post('/api/tenants').send(tenantBody({ propertyId: prop.id }));
    expect(bad.status).toBe(400);
    expect(live(a).file.content).toBe(before);
  });
});

describe('read cost / caching (H-04 short term)', () => {
  test('a repeated read costs one metadata call and no download or folder search', async () => {
    const a = user();
    await seedProperty(a);
    await a.get('/api/properties');
    a.account.calls.length = 0;
    await a.get('/api/properties');
    expect(a.account.calls).toEqual(['get-meta']);
  });
  test('a change made elsewhere invalidates the cache', async () => {
    const a = user();
    await seedProperty(a);
    await a.get('/api/properties');
    const { file, json } = live(a);
    json.properties[0].name = 'Renamed Elsewhere';
    file.content = JSON.stringify(json); file.version = String(Number(file.version) + 1);
    expect((await a.get('/api/properties')).body.data[0].name).toBe('Renamed Elsewhere');
  });
  test('cache survives a deleted-and-recreated file (stale ids are re-discovered)', async () => {
    const a = user();
    await seedProperty(a);
    const { file } = live(a);
    a.account.files.delete(file.id);
    expect((await a.get('/api/properties')).status).toBe(200);
  });
});

describe('backups & restore (H-05, M-10)', () => {
  test('restore snapshots the current data first and can be undone', async () => {
    const a = user();
    await seedProperty(a, { name: 'Original' });
    await a.post('/api/auth/backup');
    await seedProperty(a, { name: 'Newer Than Backup' });
    const count = backups(a).length;
    const r = await a.post('/api/auth/backup/restore').send({});
    expect(r.status).toBe(200);
    expect((await a.get('/api/properties')).body.data.map((p) => p.name)).toEqual(['Original']);
    expect(backups(a).length).toBe(count + 1);
    const pre = backups(a).map((f) => JSON.parse(f.content)).find((j) => j.backup.reason === 'pre-restore');
    expect(pre.properties.map((p) => p.name)).toContain('Newer Than Backup');
  });
  test('restoring a backup that belongs to someone else is refused', async () => {
    const a = user(); const b = user();
    await seedProperty(a);
    await a.post('/api/auth/backup');
    const snap = backups(a)[0];
    const foreign = JSON.parse(snap.content); foreign.user = { id: 'google:someone-else' };
    snap.content = JSON.stringify(foreign);
    expect((await a.post('/api/auth/backup/restore').send({})).status).toBe(403);
    expect(b.user.id).not.toBe(a.user.id);
  });
  test('retention keeps only the newest MAX_BACKUPS and listing is paginated', async () => {
    const a = user();
    await seedProperty(a);
    for (let i = 0; i < Drive.MAX_BACKUPS + 6; i += 1) await a.post('/api/auth/backup');
    expect(backups(a).length).toBe(Drive.MAX_BACKUPS);
    const status = (await a.get('/api/auth/backup/status')).body.data;
    expect(status.backups.length).toBe(Drive.MAX_BACKUPS);
  });
  test('the first write of a UTC day snapshots the previous state', async () => {
    const a = user();
    await seedProperty(a, { name: 'Day One' });
    const doc = live(a);
    doc.json._autoBackupDate = '2000-01-01'; doc.file.content = JSON.stringify(doc.json); doc.file.version = '55';
    const before = backups(a).length;
    await seedProperty(a, { name: 'Day Two' });
    expect(backups(a).length).toBe(before + 1);
  });
  test('start-fresh snapshots first and empties the account', async () => {
    const a = user();
    await seedProperty(a);
    const n0 = backups(a).length;
    expect((await a.post('/api/auth/backup/new-account').send({})).status).toBe(200);
    expect((await a.get('/api/properties')).body.data).toEqual([]);
    expect(backups(a).length).toBe(n0 + 1);
  });
});

describe('account deletion boundary (F-01)', () => {
  const seedFolders = (a) => {
    // Legacy-style duplicates + unrelated content that must never be touched.
    const decoyFolder = a.account.seed({ name: 'Rental Manager', mimeType: 'application/vnd.google-apps.folder', parents: [], appProperties: { rm_role: 'data-folder', rm_user: 'google:SOMEONE-ELSE' } });
    const decoyFile = a.account.seed({ name: 'precious-photos.zip', mimeType: 'application/zip', parents: [decoyFolder.id], content: 'x' });
    return { decoyFolder, decoyFile };
  };
  test('only tracked app files are removed; look-alike folders and unrelated files survive', async () => {
    const a = user();
    await seedProperty(a);
    await a.post('/api/auth/backup');
    const { decoyFolder, decoyFile } = seedFolders(a);
    const strayInTracked = a.account.seed({ name: 'my-own-notes.txt', mimeType: 'text/plain', parents: [live(a).file.parents[0]], content: 'keep me' });

    const preview = (await a.get('/api/auth/account/delete-preview')).body.data;
    expect(preview.fileCount).toBe(2); // data file + 1 backup
    expect(preview.skippedCount).toBe(1); // the stray file
    expect(preview.mode).toBe('trash');
    expect(preview.folders.map((f) => f.id)).not.toContain(decoyFolder.id);

    expect((await a.post('/api/auth/account/delete').send({ confirmText: 'nope' })).status).toBe(400);
    const r = await a.post('/api/auth/account/delete').send({ confirmText: 'Delete my account' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ files: 2, mode: 'trash', skipped: 1 });
    expect(a.account.files.get(decoyFolder.id).trashed).toBe(false);
    expect(a.account.files.get(decoyFile.id).trashed).toBe(false);
    expect(a.account.files.get(strayInTracked.id).trashed).toBe(false);
    expect(a.account.find((f) => f.name === 'rental-manager-data.json')[0].trashed).toBe(true); // recoverable
    // the folder holding a foreign file is kept; the empty backup folder is trashed
    expect(a.account.find((f) => f.name === 'Rental Manager')[0].trashed).toBe(false);
    expect(a.account.find((f) => f.name === 'Rental Manager Backups')[0].trashed).toBe(true);
    expect(r.headers['set-cookie'].join(';')).toMatch(/rental_session=;/);
  });
  test('permanent mode hard-deletes the tracked files', async () => {
    const a = user();
    await seedProperty(a);
    const r = await a.post('/api/auth/account/delete').send({ confirmText: 'delete my account', permanent: true });
    expect(r.body.data.mode).toBe('permanent');
    expect(a.account.find((f) => f.name === 'rental-manager-data.json')).toHaveLength(0);
  });
  test('legacy unmarked folders are adopted (stamped) on first use', async () => {
    const a = user();
    const folder = a.account.seed({ name: 'Rental Manager', mimeType: 'application/vnd.google-apps.folder' });
    const file = a.account.seed({ name: 'rental-manager-data.json', parents: [folder.id], content: JSON.stringify({ schemaVersion: 2, properties: [], tenants: [], payments: [], rooms: [], recycleBin: [] }) });
    expect((await a.get('/api/properties')).status).toBe(200);
    expect(a.account.files.get(folder.id).appProperties).toMatchObject({ rm_role: 'data-folder', rm_user: a.user.id });
    expect(a.account.files.get(file.id).appProperties.rm_role).toBe('data-file');
  });
});
