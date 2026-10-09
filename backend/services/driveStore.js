const { google } = require('googleapis');
const { AsyncLocalStorage } = require('async_hooks');
const { Readable } = require('stream');

const FOLDER_NAME = 'Rental Manager';
const DATA_FILE_NAME = 'rental-manager-data.json';
const BACKUP_FOLDER_NAME = 'Rental Manager Backups';
const BACKUP_PREFIX = 'rental-manager-backup-';
const context = new AsyncLocalStorage();
const mutationQueues = new Map();

function getContext() { return context.getStore() || {}; }
function requireToken() {
  const token = getContext().driveToken;
  if (!token) throw new Error('Google Drive is not connected. Please sign in with Google and allow Google Drive access.');
  return token;
}
function driveClient(token = requireToken()) {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ access_token: token });
  return google.drive({ version: 'v3', auth });
}
function qEscape(v) { return String(v).replace(/'/g, "\\'"); }
async function findOrCreateFolder(drive) {
  const q = `name = '${qEscape(FOLDER_NAME)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const found = await drive.files.list({ q, fields: 'files(id,name)', spaces: 'drive', pageSize: 10 });
  if (found.data.files?.length) return found.data.files[0].id;
  const created = await drive.files.create({ requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
  return created.data.id;
}
async function findDataFile(drive, folderId) {
  const q = `'${folderId}' in parents and name = '${qEscape(DATA_FILE_NAME)}' and trashed = false`;
  const found = await drive.files.list({ q, fields: 'files(id,name,modifiedTime)', spaces: 'drive', pageSize: 10 });
  return found.data.files?.[0] || null;
}
function emptyData(userId) {
  return { schemaVersion: 2, user: { id: userId }, properties: [], rooms: [], tenants: [], payments: [], recycleBin: [], settings: { user_id: userId, notifications_enabled: 1, monthly_reset_day: 31, last_reset_month: null, last_reset_year: null } };
}
async function readJsonFile(drive, fileId) {
  const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  let raw = response.data;
  if (raw && typeof raw[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const chunk of raw) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') return JSON.parse(raw);
  if (raw && typeof raw === 'object') return raw;
  throw new Error('The backup file is empty or invalid');
}
async function readDriveData() {
  const drive = driveClient();
  const folderId = await findOrCreateFolder(drive);
  const file = await findDataFile(drive, folderId);
  if (!file) return { drive, folderId, file: null, data: emptyData(getContext().userId) };
  let data = await readJsonFile(drive, file.id);
  if (!data || typeof data !== 'object') data = emptyData(getContext().userId);
  for (const key of ['properties','rooms','tenants','payments','recycleBin']) if (!Array.isArray(data[key])) data[key] = [];
  data.settings = data.settings || emptyData(getContext().userId).settings;
  return { drive, folderId, file, data };
}
async function writeDriveData(data, meta = null) {
  const loaded = meta || await readDriveData();
  const payload = JSON.stringify({ ...data, schemaVersion: 2, updatedAt: new Date().toISOString() }, null, 2);
  const media = { mimeType: 'application/json', body: Readable.from([payload]) };
  if (loaded.file) await loaded.drive.files.update({ fileId: loaded.file.id, media, fields: 'id,modifiedTime' });
  else await loaded.drive.files.create({ requestBody: { name: DATA_FILE_NAME, parents: [loaded.folderId], mimeType: 'application/json' }, media, fields: 'id,modifiedTime' });
  return data;
}

async function findOrCreateBackupFolder(drive) {
  const q = `name = '${qEscape(BACKUP_FOLDER_NAME)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const found = await drive.files.list({ q, fields: 'files(id,name)', spaces: 'drive', pageSize: 10 });
  if (found.data.files?.length) return found.data.files[0].id;
  const created = await drive.files.create({ requestBody: { name: BACKUP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
  return created.data.id;
}
async function listBackups() {
  const drive = driveClient();
  const folderId = await findOrCreateBackupFolder(drive);
  const found = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,modifiedTime,size,mimeType)',
    orderBy: 'modifiedTime desc', spaces: 'drive', pageSize: 100
  });
  return { drive, folderId, files: (found.data.files || []).filter(f => f.name.startsWith(BACKUP_PREFIX)) };
}
async function backupStatus() {
  const { drive, folderId, files } = await listBackups();
  const live = await findDataFile(drive, await findOrCreateFolder(drive));
  const current = await readDriveData();
  const counts = { properties: current.data.properties.length, rooms: current.data.rooms.length, tenants: current.data.tenants.length, payments: current.data.payments.length, recycleBin: current.data.recycleBin.length };
  const hasExistingData = Object.values(counts).some(Boolean);
  return {
    available: hasExistingData || files.length > 0,
    hasExistingData,
    liveUpdatedAt: live?.modifiedTime || null,
    counts,
    backups: files.map(f => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime || null, size: Number(f.size || 0) }))
  };
}
async function createBackupSnapshot() {
  const loaded = await readDriveData();
  const data = loaded.data;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const folderId = await findOrCreateBackupFolder(loaded.drive);
  const payload = JSON.stringify({
    ...data,
    schemaVersion: 3,
    backup: { createdAt: new Date().toISOString(), userId: getContext().userId, source: 'Rental Manager' }
  });
  const media = { mimeType: 'application/json', body: Readable.from([payload]) };
  const created = await loaded.drive.files.create({
    requestBody: { name: `${BACKUP_PREFIX}${stamp}.json`, parents: [folderId], mimeType: 'application/json' },
    media, fields: 'id,name,modifiedTime,size'
  });
  return { id: created.data.id, name: created.data.name, modifiedTime: created.data.modifiedTime || new Date().toISOString(), size: Number(created.data.size || Buffer.byteLength(payload)) };
}
async function restoreBackup(backupId = null) {
  const userId = getContext().userId;
  if (!userId) throw new Error('A signed-in account is required to restore a backup');
  const listed = await listBackups();
  const selected = backupId ? listed.files.find(f => f.id === backupId) : listed.files[0];
  if (!selected) throw new Error('No backup is available for this Google account');
  let restored = await readJsonFile(listed.drive, selected.id);
  if (!restored || typeof restored !== 'object' || (restored.user?.id && restored.user.id !== userId)) {
    throw new Error('This backup does not belong to the signed-in account');
  }
  for (const key of ['properties', 'rooms', 'tenants', 'payments', 'recycleBin']) {
    if (!Array.isArray(restored[key])) restored[key] = [];
  }
  restored.settings = restored.settings || emptyData(userId).settings;
  restored.user = { ...(restored.user || {}), id: userId };
  const live = await readDriveData();
  await writeDriveData(restored, live);
  return { restoredAt: new Date().toISOString(), counts: { properties: restored.properties.length, rooms: restored.rooms.length, tenants: restored.tenants.length, payments: restored.payments.length, recycleBin: restored.recycleBin.length } };
}
async function startFreshAccount() {
  const userId = getContext().userId;
  if (!userId) throw new Error('A signed-in account is required');
  const live = await readDriveData();
  const hasContent = ['properties', 'rooms', 'tenants', 'payments', 'recycleBin'].some(k => Array.isArray(live.data[k]) && live.data[k].length);
  if (hasContent) await createBackupSnapshot();
  const fresh = emptyData(userId);
  fresh.user = { id: userId, name: getContext().userName || null, email: getContext().userEmail || null };
  await writeDriveData(fresh, live);
  return { createdAt: new Date().toISOString() };
}

async function getData() {
  const ctx = getContext();
  if (ctx.data) return ctx.data;
  const loaded = await readDriveData();
  ctx.data = loaded.data;
  ctx.meta = loaded;
  return ctx.data;
}
async function saveData() {
  const ctx = getContext();
  if (!ctx.data) return;
  await writeDriveData(ctx.data, ctx.meta);
}
async function runWithRequestContext(userId, driveToken, fn) {
  return context.run({ userId, driveToken }, fn);
}
async function transaction(fn) {
  const parent = getContext();
  const loaded = await readDriveData();
  const tx = { ...parent, data: JSON.parse(JSON.stringify(loaded.data)), meta: loaded, transaction: true };
  return context.run(tx, async () => {
    const executor = { query: async()=>[], get: async()=>undefined, run: async()=>({changes:0}) };
    const result = await fn(executor);
    await writeDriveData(tx.data, loaded);
    return result;
  });
}
async function mutate(mutator) {
  const userId = getContext().userId || 'anonymous';
  const previous = mutationQueues.get(userId) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  mutationQueues.set(userId, previous.then(() => current));
  await previous;
  try {
    const data = await getData();
    const result = await mutator(data);
    if (!getContext().transaction) await saveData();
    return result;
  } finally {
    release();
    if (mutationQueues.get(userId) === current) mutationQueues.delete(userId);
  }
}
function rowsForUser(data, userId) { return data; }
module.exports = { context, getContext, runWithRequestContext, transaction, getData, saveData, mutate, driveClient, findOrCreateFolder, findDataFile, writeDriveData, emptyData, requireToken, backupStatus, createBackupSnapshot, restoreBackup, startFreshAccount, FOLDER_NAME, DATA_FILE_NAME, BACKUP_FOLDER_NAME };
