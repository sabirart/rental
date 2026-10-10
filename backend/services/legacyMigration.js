'use strict';
/**
 * One-time import of a user's records from the retired PostgreSQL deployment
 * into their Google Drive file. Only runs at sign-in when LEGACY_DATABASE_URL
 * is configured; never touches request-path code. Imported rows go through
 * the same strict validator as backup import, so legacy data cannot corrupt
 * the live document.
 *
 * TLS to the legacy database is verified by default. Set
 * LEGACY_DATABASE_SSL=false for a plain connection, or
 * LEGACY_DATABASE_SSL_REJECT_UNAUTHORIZED=false ONLY if the old host uses a
 * self-signed certificate.
 */
const Drive = require('./driveStore');
const { validateBackup } = require('./backupSchema');

function sslOption() {
  if (process.env.LEGACY_DATABASE_SSL === 'false') return false;
  return { rejectUnauthorized: process.env.LEGACY_DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' };
}

const parseJson = (v, fallback) => (Array.isArray(v) || (v && typeof v === 'object') ? v : (v ? JSON.parse(v) : fallback));

async function migrateCurrentUserFromLegacy(userId, email, googleId, driveToken) {
  const url = process.env.LEGACY_DATABASE_URL || process.env.LEGACY_POSTGRES_URL;
  if (!url) return { migrated: false, reason: 'LEGACY_DATABASE_URL is not configured' };
  const { Pool } = require('pg'); // loaded lazily: not needed unless a migration is configured
  const pool = new Pool({ connectionString: url, ssl: sslOption(), connectionTimeoutMillis: 10000, max: 1 });
  try {
    const u = (await pool.query('SELECT * FROM users WHERE email=$1 OR google_id=$2 LIMIT 1', [email, googleId])).rows[0];
    if (!u) return { migrated: false, reason: 'No legacy user found' };
    const q = async (sql, params) => {
      try { return (await pool.query(sql, params)).rows; } catch (e) { if (/relation .* does not exist/i.test(e.message)) return []; throw e; }
    };
    const [properties, rooms, tenants, payments, recycleBin, settings] = await Promise.all([
      q('SELECT * FROM properties WHERE user_id=$1 ORDER BY created_at ASC', [u.id]),
      q('SELECT r.* FROM rooms r JOIN properties p ON p.id=r.property_id WHERE p.user_id=$1 ORDER BY r.property_id,r.room_number', [u.id]),
      q('SELECT * FROM tenants WHERE user_id=$1 ORDER BY created_at ASC', [u.id]),
      q('SELECT * FROM payments WHERE user_id=$1 ORDER BY year DESC,month DESC,created_at DESC', [u.id]),
      q('SELECT * FROM recycle_bin WHERE user_id=$1 ORDER BY deleted_at DESC', [u.id]),
      q('SELECT * FROM user_settings WHERE user_id=$1 LIMIT 1', [u.id])
    ]);
    // Dates/ids from pg arrive as Date/number objects: round-trip through JSON to plain values first.
    const raw = JSON.parse(JSON.stringify({
      properties: properties.map((p) => ({ ...p, id: String(p.id) })),
      rooms,
      tenants: tenants.map((t) => ({ ...t, documents: parseJson(t.documents, []) })),
      payments: payments.map((p) => ({ ...p, custom_charges: parseJson(p.custom_charges, []) })),
      recycleBin: recycleBin.map((x) => ({ ...x, data: parseJson(x.data, {}) })),
      settings: settings[0] || {}
    }));
    return await Drive.runWithRequestContext(userId, driveToken, async () => {
      const { data: clean, counts, warnings } = validateBackup(raw, userId);
      const imported = await Drive.mutate((live) => {
        if (live.properties.length || live.tenants.length) return false; // never overwrite existing Drive data
        Object.assign(live, clean);
        return true;
      });
      return imported ? { migrated: true, counts, warnings } : { migrated: false, reason: 'Drive already contains Rental Manager data' };
    });
  } finally { await pool.end(); }
}
module.exports = { migrateCurrentUserFromLegacy, sslOption };
