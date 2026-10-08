const { google } = require('googleapis');
const { AsyncLocalStorage } = require('async_hooks');
const { Readable } = require('stream');

const FOLDER_NAME = 'Rental Manager';
const DATA_FILE_NAME = 'rental-manager-data.json';
const context = new AsyncLocalStorage();

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
async function readDriveData() {
  const drive = driveClient();
  const folderId = await findOrCreateFolder(drive);
  const file = await findDataFile(drive, folderId);
  if (!file) return { drive, folderId, file: null, data: emptyData(getContext().userId) };
  const response = await drive.files.get({ fileId: file.id, alt: 'media' });
  let data = response.data;
  if (typeof data === 'string') data = JSON.parse(data);
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
  const data = await getData();
  const result = await mutator(data);
  if (!getContext().transaction) await saveData();
  return result;
}
function rowsForUser(data, userId) { return data; }
module.exports = { context, getContext, runWithRequestContext, transaction, getData, saveData, mutate, driveClient, findOrCreateFolder, findDataFile, writeDriveData, emptyData, requireToken, FOLDER_NAME, DATA_FILE_NAME };
