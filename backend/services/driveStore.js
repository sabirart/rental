'use strict';
/**
 * Google Drive backed data store.
 *
 * Each signed-in Google account owns ONE JSON document
 * ("Rental Manager/rental-manager-data.json") plus timestamped recovery
 * snapshots in "Rental Manager Backups". This module is the only place that
 * talks to Drive.
 *
 * Safety properties implemented here:
 *  - Ownership markers: every folder/file this app creates is stamped with
 *    appProperties (rm_role / rm_user). Destructive operations act ONLY on
 *    objects whose IDs were resolved through those markers - never on
 *    "everything named Rental Manager".
 *  - Write consistency: PostgreSQL mode uses a shared per-account advisory
 *    lock around each mutation and stores the canonical JSONB record in the
 *    database. Legacy Drive-only mode serializes writes in-process and checks
 *    the Drive version before updating; Drive has no atomic compare-and-swap,
 *    so legacy mode must remain single-instance.
 *  - Bounded read cost: folder/file ids and the parsed file are cached per
 *    user and revalidated with a single metadata call.
 */
const { google } = require('googleapis');
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
const { Readable } = require('stream');
const { AppError } = require('../middleware/errorHandler');
const { SCHEMA_VERSION, COLLECTIONS, emptyData, migrate } = require('./schema');
const { validateBackup, countsOf } = require('./backupSchema');
const { withDistributedWriteLock } = require('./distributedLock');

const FOLDER_NAME = 'Rental Manager';
const DATA_FILE_NAME = 'rental-manager-data.json';
const BACKUP_FOLDER_NAME = 'Rental Manager Backups';
const BACKUP_PREFIX = 'rental-manager-backup-';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_BACKUPS = Number(process.env.MAX_BACKUPS) > 0 ? Number(process.env.MAX_BACKUPS) : 30;
const MAX_WRITE_ATTEMPTS = 4;
const DRIVE_TIMEOUT_MS = 30000;
const CACHE_MAX_USERS = 50;
const CACHE_MAX_BYTES = 96 * 1024 * 1024;

const context = new AsyncLocalStorage();
const mutationQueues = new Map();
const refsCache = new Map(); // userId -> { folderId, fileId, backupFolderId }
const dataCache = new Map(); // userId -> { fileId, version, json }
let driveFactory = null; // test seam: (token, ctx) => drive-like client
let dataPool = null;
let dataSchemaPromise = null;

const getContext = () => context.getStore() || {};
const nowIso = () => new Date().toISOString();
const statusOf = (e) => Number(e?.code && typeof e.code === 'number' ? e.code : e?.response?.status || e?.status) || null;
const qEscape = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function setDriveClientFactory(factory) { driveFactory = factory; refsCache.clear(); dataCache.clear(); }
function clearCaches(userId) { if (userId) { refsCache.delete(userId); dataCache.delete(userId); } else { refsCache.clear(); dataCache.clear(); } }

function requireToken() {
  const token = getContext().driveToken;
  if (!token) throw new AppError('Google Drive is not connected. Please sign in with Google and allow Google Drive access.', 401, 'DRIVE_NOT_CONNECTED');
  return token;
}
function requireUser() {
  const id = getContext().userId;
  if (!id) throw new AppError('A signed-in account is required.', 401);
  return id;
}
function driveClient(token = requireToken()) {
  if (driveFactory) return driveFactory(token, getContext());
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ access_token: token });
  return google.drive({ version: 'v3', auth, timeout: DRIVE_TIMEOUT_MS });
}

class ConflictError extends AppError {
  constructor() {
    super('Your data was changed from another device or tab while saving. Please try again.', 409, 'WRITE_CONFLICT');
  }
}

// ---------------------------------------------------------------- discovery
const markers = (role, userId) => ({ rm_app: 'rental-manager', rm_role: role, rm_user: userId });

async function listFolders(drive, name) {
  const found = await drive.files.list({
    q: `name = '${qEscape(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id,name,createdTime,appProperties)', spaces: 'drive', pageSize: 100, orderBy: 'createdTime'
  });
  return found.data.files || [];
}

/**
 * Picks the folder this user owns: a marker-matching folder first, otherwise
 * the OLDEST legacy (unmarked) folder, which is then adopted (stamped) so all
 * later destructive actions can rely on the marker. Never returns folders
 * stamped for another user.
 */
async function resolveFolder(drive, name, role, userId, { create }) {
  const all = await listFolders(drive, name);
  const mine = all.find((f) => f.appProperties?.rm_role === role && f.appProperties?.rm_user === userId);
  if (mine) return mine.id;
  const legacy = all.find((f) => !f.appProperties?.rm_role);
  if (legacy) {
    await drive.files.update({ fileId: legacy.id, requestBody: { appProperties: markers(role, userId) }, fields: 'id' });
    return legacy.id;
  }
  if (!create) return null;
  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, appProperties: markers(role, userId) }, fields: 'id'
  });
  return created.data.id;
}

async function findDataFile(drive, folderId, userId) {
  const found = await drive.files.list({
    q: `'${folderId}' in parents and name = '${qEscape(DATA_FILE_NAME)}' and trashed = false`,
    fields: 'files(id,name,version,modifiedTime,appProperties)', spaces: 'drive', pageSize: 10, orderBy: 'createdTime'
  });
  const file = found.data.files?.[0] || null;
  if (file && !file.appProperties?.rm_role && userId) {
    await drive.files.update({ fileId: file.id, requestBody: { appProperties: markers('data-file', userId) }, fields: 'id' });
  }
  return file;
}

async function findOrCreateFolder(drive, userId = getContext().userId) {
  return resolveFolder(drive, FOLDER_NAME, 'data-folder', userId, { create: true });
}
async function findOrCreateBackupFolder(drive, userId = getContext().userId) {
  const refs = refsCache.get(userId);
  if (refs?.backupFolderId) return refs.backupFolderId;
  const id = await resolveFolder(drive, BACKUP_FOLDER_NAME, 'backup-folder', userId, { create: true });
  refsCache.set(userId, { ...(refsCache.get(userId) || {}), backupFolderId: id });
  return id;
}

async function readText(drive, fileId) {
  const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  let raw = response.data;
  if (raw && typeof raw[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const chunk of raw) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (raw && typeof raw === 'object') return JSON.stringify(raw);
  if (typeof raw !== 'string') throw new AppError('The stored file is empty or unreadable.', 500, 'DATA_UNREADABLE');
  return raw;
}
const parseJson = (text, what) => {
  try { return JSON.parse(text); } catch (_) {
    throw new AppError(`${what} is corrupted and was left untouched. Restore a backup from Settings.`, 500, 'DATA_CORRUPT');
  }
};

function cacheSet(userId, entry) {
  dataCache.delete(userId);
  dataCache.set(userId, entry);
  let bytes = 0;
  for (const v of dataCache.values()) bytes += v.json.length;
  for (const key of dataCache.keys()) {
    if (dataCache.size <= CACHE_MAX_USERS && bytes <= CACHE_MAX_BYTES) break;
    if (key === userId) continue; // never evict the entry just written
    bytes -= dataCache.get(key).json.length;
    dataCache.delete(key);
  }
}

// -------------------------------------------------------------- read / write
function getDataPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!dataPool) {
    dataPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATA_STORE_POOL_SIZE) > 0 ? Number(process.env.DATA_STORE_POOL_SIZE) : 10,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    });
    dataPool.on('error', (error) => console.error('PostgreSQL data-store pool error:', error.message));
  }
  return dataPool;
}

async function ensureDataSchema(pool) {
  if (!dataSchemaPromise) {
    dataSchemaPromise = pool.query(`CREATE TABLE IF NOT EXISTS rental_manager_account_data (
      user_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).then(() => pool.query('CREATE INDEX IF NOT EXISTS rental_manager_account_data_updated_idx ON rental_manager_account_data (updated_at)'));
    dataSchemaPromise.catch(() => { dataSchemaPromise = null; });
  }
  return dataSchemaPromise;
}

async function readPostgresRow(pool, userId) {
  await ensureDataSchema(pool);
  const result = await pool.query('SELECT data, updated_at FROM rental_manager_account_data WHERE user_id = $1', [String(userId)]);
  return result.rows[0] || null;
}

async function checkDataStore() {
  const pool = getDataPool();
  if (!pool) return { configured: false, available: false };
  await ensureDataSchema(pool);
  await pool.query('SELECT 1');
  return { configured: true, available: true };
}

async function readDriveData() {
  const userId = getContext().userId || 'anonymous';
  const pool = getDataPool();
  if (!pool) return readDriveDataFromDrive(userId, driveClient());

  try {
    let row = await readPostgresRow(pool, userId);
    if (row) {
      let drive = null;
      try { drive = driveClient(); } catch (_) { /* primary data reads do not require Drive access */ }
      const data = migrate(typeof row.data === 'string' ? parseJson(row.data, 'Your PostgreSQL data') : row.data, userId);
      return { drive, folderId: null, file: null, data, postgres: true, updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null };
    }
    if (!row) {
      // One-time, non-destructive migration: seed PostgreSQL from the existing
      // Drive document. INSERT ... ON CONFLICT never overwrites a concurrent
      // first write. The Drive source is retained as a recovery copy.
      const drive = driveClient();
      const legacy = await readDriveDataFromDrive(userId, drive);
      const migrated = migrate(legacy.data, userId);
      const payload = { ...migrated, schemaVersion: SCHEMA_VERSION, updatedAt: nowIso() };
      await pool.query(
        'INSERT INTO rental_manager_account_data (user_id, data, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (user_id) DO NOTHING',
        [String(userId), JSON.stringify(payload)]
      );
      row = await readPostgresRow(pool, userId);
    }
    if (!row) throw new Error('PostgreSQL row missing after initialization');
    const data = migrate(typeof row.data === 'string' ? parseJson(row.data, 'Your PostgreSQL data') : row.data, userId);
    let drive = null;
    try { drive = driveClient(); } catch (_) { /* PostgreSQL is the primary store */ }
    return { drive, folderId: null, file: null, data, postgres: true, updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('PostgreSQL account-data read failed:', error.message);
    throw new AppError('Your account data store is temporarily unavailable. No changes were made; please retry shortly.', 503, 'DATA_STORE_UNAVAILABLE');
  }
}

async function readDriveDataFromDrive(userId, drive) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let refs = refsCache.get(userId);
      if (!refs?.folderId) {
        const folderId = await findOrCreateFolder(drive, userId);
        refs = { ...(refsCache.get(userId) || {}), folderId };
        refsCache.set(userId, refs);
      }
      if (!refs.fileId) {
        const file = await findDataFile(drive, refs.folderId, userId);
        if (!file) return { drive, folderId: refs.folderId, file: null, data: emptyData(userId) };
        refs.fileId = file.id;
      }
      const meta = (await drive.files.get({ fileId: refs.fileId, fields: 'id,version,modifiedTime' })).data;
      const cached = dataCache.get(userId);
      let json;
      if (cached && cached.fileId === refs.fileId && String(cached.version) === String(meta.version)) json = cached.json;
      else {
        json = await readText(drive, refs.fileId);
        cacheSet(userId, { fileId: refs.fileId, version: meta.version, json });
      }
      const data = migrate(parseJson(json, 'Your data file'), userId);
      return { drive, folderId: refs.folderId, file: { id: refs.fileId, version: meta.version, modifiedTime: meta.modifiedTime }, data };
    } catch (e) {
      if (statusOf(e) === 404 && attempt === 0) { clearCaches(userId); continue; } // stale cached id
      throw e;
    }
  }
  /* istanbul ignore next */ throw new AppError('Could not read your data.', 500);
}

async function writeDriveData(data, loaded, { force = false } = {}) {
  const userId = getContext().userId || 'anonymous';
  const meta = loaded || (await readDriveData());
  const payload = JSON.stringify({ ...data, schemaVersion: SCHEMA_VERSION, updatedAt: nowIso() });
  if (meta.postgres || process.env.DATABASE_URL) {
    const pool = getDataPool();
    try {
      await ensureDataSchema(pool);
      await pool.query(
        `INSERT INTO rental_manager_account_data (user_id, data, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [String(userId), payload]
      );
      meta.postgres = true;
      meta.updatedAt = nowIso();
      meta.file = null;
      return data;
    } catch (error) {
      console.error('PostgreSQL account-data write failed:', error.message);
      throw new AppError('Your account data could not be saved because the database is unavailable. No changes were saved; please retry.', 503, 'DATA_STORE_UNAVAILABLE');
    }
  }
  const media = { mimeType: 'application/json', body: Readable.from([payload]) };
  let result;
  if (meta.file) {
    if (!force) {
      const current = (await meta.drive.files.get({ fileId: meta.file.id, fields: 'id,version' })).data;
      if (String(current.version) !== String(meta.file.version)) { clearCaches(userId); throw new ConflictError(); }
    }
    result = (await meta.drive.files.update({ fileId: meta.file.id, media, fields: 'id,version,modifiedTime' })).data;
  } else {
    result = (await meta.drive.files.create({
      requestBody: { name: DATA_FILE_NAME, parents: [meta.folderId], mimeType: 'application/json', appProperties: markers('data-file', userId) },
      media, fields: 'id,version,modifiedTime'
    })).data;
  }
  meta.file = { id: result.id, version: result.version, modifiedTime: result.modifiedTime };
  refsCache.set(userId, { ...(refsCache.get(userId) || {}), folderId: meta.folderId, fileId: result.id });
  cacheSet(userId, { fileId: result.id, version: result.version, json: payload });
  return data;
}

// ------------------------------------------------------------------ backups
async function listBackups() {
  const userId = requireUser();
  const drive = driveClient();
  const folderId = await findOrCreateBackupFolder(drive, userId);
  const files = [];
  let pageToken;
  do {
    const page = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,modifiedTime,size,appProperties)',
      orderBy: 'modifiedTime desc', spaces: 'drive', pageSize: 100, ...(pageToken ? { pageToken } : {})
    });
    files.push(...(page.data.files || []).filter((f) => f.name.startsWith(BACKUP_PREFIX)));
    pageToken = page.data.nextPageToken;
  } while (pageToken);
  return { drive, folderId, files };
}

const hasContent = (d) => COLLECTIONS.some((k) => Array.isArray(d[k]) && d[k].length);

async function pruneBackups(drive, folderId) {
  try {
    const { files } = await listBackups();
    for (const old of files.slice(MAX_BACKUPS)) await drive.files.delete({ fileId: old.id });
  } catch (e) { console.warn('Backup retention pruning skipped:', e.message); }
}

async function writeSnapshot(drive, data, reason = 'manual') {
  const userId = requireUser();
  const folderId = await findOrCreateBackupFolder(drive, userId);
  const stamp = nowIso().replace(/[:.]/g, '-');
  const payload = JSON.stringify({ ...data, schemaVersion: SCHEMA_VERSION, backup: { createdAt: nowIso(), userId, source: 'Rental Manager', reason } });
  const created = await drive.files.create({
    requestBody: { name: `${BACKUP_PREFIX}${stamp}.json`, parents: [folderId], mimeType: 'application/json', appProperties: markers('backup', userId) },
    media: { mimeType: 'application/json', body: Readable.from([payload]) }, fields: 'id,name,modifiedTime,size'
  });
  await pruneBackups(drive, folderId);
  return { id: created.data.id, name: created.data.name, modifiedTime: created.data.modifiedTime || nowIso(), size: Number(created.data.size || Buffer.byteLength(payload)) };
}

async function createBackupSnapshot(reason = 'manual') {
  const loaded = await readDriveData();
  return writeSnapshot(loaded.drive, loaded.data, reason);
}

async function backupStatus() {
  requireUser();
  const { files } = await listBackups();
  const current = await readDriveData();
  const counts = countsOf(current.data);
  const hasExistingData = Object.values(counts).some(Boolean);
  return {
    available: hasExistingData || files.length > 0,
    hasExistingData,
    liveUpdatedAt: current.updatedAt || current.file?.modifiedTime || null,
    counts,
    retention: MAX_BACKUPS,
    backups: files.map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime || null, size: Number(f.size || 0) }))
  };
}

function replaceContents(target, next) {
  const keepUser = target.user || {};
  const keepStamp = target._autoBackupDate;
  // Security revocations and the payment audit log are append-only operational
  // records. A user-data import/restore must never erase them by omission.
  const keepAudit = Array.isArray(target.paymentAudit) ? target.paymentAudit : [];
  const keepRevocations = Array.isArray(target.authRevocations) ? target.authRevocations : [];
  Object.keys(target).forEach((k) => delete target[k]);
  Object.assign(target, next, {
    user: { ...keepUser, ...(next.user || {}), id: keepUser.id || next.user?.id },
    paymentAudit: keepAudit,
    authRevocations: keepRevocations
  });
  if (keepStamp) target._autoBackupDate = keepStamp;
}

async function restoreBackup(backupId = null) {
  const userId = requireUser();
  const listed = await listBackups();
  const selected = backupId ? listed.files.find((f) => f.id === backupId) : listed.files[0];
  if (!selected) throw new AppError('No backup is available for this Google account.', 404);
  const raw = parseJson(await readText(listed.drive, selected.id), 'This backup file');
  if (raw?.user?.id && raw.user.id !== userId) throw new AppError('This backup does not belong to the signed-in account.', 403);
  const { data: clean, warnings, counts } = validateBackup(raw, userId);
  await mutate(async (data) => {
    // Safety net: the newest live data is snapshotted BEFORE it is replaced.
    if (hasContent(data)) await writeSnapshot(listed.drive, data, 'pre-restore');
    replaceContents(data, { ...clean, user: { ...(raw.user || {}), id: userId } });
  });
  return { restoredAt: nowIso(), counts, warnings };
}

async function importValidated(clean, owner) {
  return mutate(async (data) => {
    if (hasContent(data)) await writeSnapshot(driveClient(), data, 'pre-import');
    replaceContents(data, { ...clean, user: owner });
    return countsOf(data);
  });
}

async function startFreshAccount() {
  const userId = requireUser();
  await mutate(async (data) => {
    if (hasContent(data)) await writeSnapshot(driveClient(), data, 'pre-reset');
    const fresh = emptyData(userId);
    fresh.user = { id: userId, name: getContext().userName || data.user?.name || null, email: getContext().userEmail || data.user?.email || null, profilePic: data.user?.profilePic || null, profileComplete: !!data.user?.profileComplete };
    replaceContents(data, fresh);
  });
  return { createdAt: nowIso() };
}

/** Saves `data` (the current, not-yet-changed state) as a recovery snapshot when it holds any records. */
async function snapshotBeforeChange(data, reason) {
  if (!hasContent(data)) return null;
  return writeSnapshot(driveClient(), data, reason);
}

// --------------------------------------------------------- account deletion
/**
 * Resolves EXACTLY what account deletion would touch. Only tracked folders
 * (resolved through ownership markers) are considered, and inside them only
 * files this app wrote for this user. Anything else is reported as `skipped`
 * and is never deleted.
 */
async function buildDeletionPlan() {
  const userId = requireUser();
  const drive = driveClient();
  const plan = { folders: [], files: [], skipped: [] };
  const targets = [
    [FOLDER_NAME, 'data-folder', (f) => f.name === DATA_FILE_NAME],
    [BACKUP_FOLDER_NAME, 'backup-folder', (f) => f.name.startsWith(BACKUP_PREFIX)]
  ];
  for (const [name, role, isOwnedLegacyFile] of targets) {
    const folderId = await resolveFolder(drive, name, role, userId, { create: false });
    if (!folderId) continue;
    plan.folders.push({ id: folderId, name, role });
    let pageToken;
    do {
      const page = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,appProperties)', spaces: 'drive', pageSize: 100, ...(pageToken ? { pageToken } : {})
      });
      for (const f of page.data.files || []) {
        const markedMine = f.appProperties?.rm_user === userId;
        const legacyMine = !f.appProperties?.rm_role && f.mimeType !== FOLDER_MIME && isOwnedLegacyFile(f);
        if (markedMine || legacyMine) plan.files.push({ id: f.id, name: f.name, size: Number(f.size || 0), modifiedTime: f.modifiedTime || null, folderId });
        else plan.skipped.push({ id: f.id, name: f.name, folderId });
      }
      pageToken = page.data.nextPageToken;
    } while (pageToken);
  }
  return { drive, userId, plan };
}

async function deletionPreview() {
  const { plan } = await buildDeletionPlan();
  return {
    folders: plan.folders.map(({ id, name }) => ({ id, name })),
    fileCount: plan.files.length,
    totalBytes: plan.files.reduce((s, f) => s + f.size, 0),
    files: plan.files.slice(0, 50).map(({ id, name, size, modifiedTime }) => ({ id, name, size, modifiedTime })),
    skippedCount: plan.skipped.length,
    skipped: plan.skipped.slice(0, 20).map(({ id, name }) => ({ id, name })),
    mode: 'trash'
  };
}

/**
 * Default: files/folders are moved to the Google Drive trash (recoverable for
 * 30 days). `permanent: true` deletes them for good.
 */
async function deleteUserAccountData({ permanent = false } = {}) {
  const { drive, userId, plan } = await buildDeletionPlan();
  const remove = (fileId) => (permanent ? drive.files.delete({ fileId }) : drive.files.update({ fileId, requestBody: { trashed: true }, fields: 'id' }));
  const result = { files: 0, folders: 0, skipped: plan.skipped.length, mode: permanent ? 'permanent' : 'trash' };
  for (const f of plan.files) { await remove(f.id); result.files += 1; }
  const skippedFolders = new Set(plan.skipped.map((s) => s.folderId));
  for (const folder of plan.folders) {
    if (skippedFolders.has(folder.id)) continue; // contains foreign content: keep the folder
    await remove(folder.id);
    result.folders += 1;
  }
  const pool = getDataPool();
  if (pool) {
    try {
      await ensureDataSchema(pool);
      await pool.query('DELETE FROM rental_manager_account_data WHERE user_id = $1', [String(userId)]);
    } catch (error) {
      console.error('PostgreSQL account-data deletion failed:', error.message);
      throw new AppError('The account data could not be fully deleted because the database is unavailable. Please retry or contact support.', 503, 'DATA_STORE_UNAVAILABLE');
    }
  }
  clearCaches(userId);
  return result;
}

/** First-sign-in bootstrap: make sure the data file exists and refresh profile info. */
async function ensureUserData(userId, token, profile = {}) {
  return context.run({ userId, driveToken: token }, async () => withUserWriteLock(userId, async () => {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const loaded = await readDriveData();
      const data = loaded.data;
      const existed = !!loaded.file || !!loaded.postgres;
      const before = JSON.stringify(data.user || {});
      data.user = {
        ...(data.user || {}), id: userId,
        name: data.user?.name || profile.name || null,
        email: profile.email || data.user?.email || null,
        profilePic: data.user?.profilePic || profile.profilePic || null,
        profileComplete: !!data.user?.profileComplete
      };
      if (existed && before === JSON.stringify(data.user)) return { connected: true };
      try { await writeDriveData(data, loaded); return { connected: true }; } catch (e) { if (!(e instanceof ConflictError)) throw e; }
    }
    throw new ConflictError();
  }));
}

// ------------------------------------------------------- request-scoped data
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
function runWithRequestContext(userId, driveToken, fn, extra = {}) {
  return context.run({ userId, driveToken, ...extra }, fn);
}

async function withUserWriteLock(userId, task) {
  const previous = mutationQueues.get(userId) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  mutationQueues.set(userId, tail);
  await previous;
  try { return await withDistributedWriteLock(userId, task); } finally { release(); if (mutationQueues.get(userId) === tail) mutationQueues.delete(userId); }
}

const todayUtc = () => nowIso().slice(0, 10);

/**
 * Once per UTC day the state BEFORE the first change of that day is saved as a
 * recovery snapshot, and the stamp is persisted in the same write.
 */
async function maybeDailySnapshot(drive, beforeJson, data) {
  if (!beforeJson || data._autoBackupDate === todayUtc()) return;
  try {
    const before = JSON.parse(beforeJson);
    if (hasContent(before)) await writeSnapshot(drive, before, 'daily');
    data._autoBackupDate = todayUtc();
  } catch (e) { console.warn('Automatic daily backup skipped:', e.message); }
}

/** Runs `fn` against a private clone of the data and persists the result atomically. */
async function transaction(fn) {
  const parent = getContext();
  const userId = parent.userId || 'anonymous';
  return withUserWriteLock(userId, async () => {
    for (let attempt = 1; ; attempt += 1) {
      const loaded = await readDriveData();
      const beforeJson = JSON.stringify(loaded.data);
      const tx = { ...parent, data: JSON.parse(beforeJson), meta: loaded, transaction: true };
      try {
        return await context.run(tx, async () => {
          const result = await fn({});
          await maybeDailySnapshot(loaded.drive, beforeJson, tx.data);
          await writeDriveData(tx.data, loaded);
          parent.data = null; parent.meta = null; // next read in this request sees the committed state
          return result;
        });
      } catch (e) {
        if (e instanceof ConflictError && attempt < MAX_WRITE_ATTEMPTS) continue;
        throw e;
      }
    }
  });
}

/** Applies `mutator` to freshly loaded data under the per-user lock and saves it. */
async function mutate(mutator) {
  const current = getContext();
  if (current.transaction) return mutator(await getData());
  const userId = current.userId || 'anonymous';
  return withUserWriteLock(userId, async () => {
    for (let attempt = 1; ; attempt += 1) {
      current.data = null; current.meta = null; // never reuse a snapshot read before the lock
      const data = await getData();
      // Serialising a large document is only needed on the first write of a UTC day.
      const beforeJson = data._autoBackupDate === todayUtc() ? null : JSON.stringify(data);
      try {
        const result = await mutator(data);
        await maybeDailySnapshot(current.meta.drive, beforeJson, data);
        await saveData();
        return result;
      } catch (e) {
        current.data = null; current.meta = null; // discard partially applied changes
        if (e instanceof ConflictError && attempt < MAX_WRITE_ATTEMPTS) continue;
        throw e;
      }
    }
  });
}

module.exports = {
  context, getContext, runWithRequestContext, transaction, getData, saveData, mutate,
  driveClient, findOrCreateFolder, findDataFile, writeDriveData, emptyData, requireToken,
  backupStatus, createBackupSnapshot, restoreBackup, importValidated, startFreshAccount, snapshotBeforeChange,
  deletionPreview, deleteUserAccountData, ensureUserData, listBackups,
  setDriveClientFactory, clearCaches, ConflictError, checkDataStore,
  FOLDER_NAME, DATA_FILE_NAME, BACKUP_FOLDER_NAME, BACKUP_PREFIX, MAX_BACKUPS
};
