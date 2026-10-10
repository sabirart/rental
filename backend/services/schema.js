'use strict';
const { AppError } = require('../middleware/errorHandler');
/**
 * Single source of truth for the persisted data format version.
 *  v1/v2  – early Drive JSON layouts (no explicit rooms/recycleBin guarantees)
 *  v3     – current: properties, rooms, tenants, payments, recycleBin, settings
 */
const SCHEMA_VERSION = 3;
const COLLECTIONS = ['properties', 'rooms', 'tenants', 'payments', 'recycleBin'];

const DEFAULT_SETTINGS = Object.freeze({
  notifications_enabled: 1,
  monthly_reset_day: 31,
  last_reset_month: null,
  last_reset_year: null
});

function emptyData(userId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    user: { id: userId, profileComplete: false },
    properties: [],
    rooms: [],
    tenants: [],
    payments: [],
    recycleBin: [],
    settings: { user_id: userId, ...DEFAULT_SETTINGS }
  };
}

/**
 * Brings any previously written document up to SCHEMA_VERSION. Idempotent and
 * non-destructive: it only adds missing structure, never drops records.
 * Files stamped v2 by older builds (which wrongly overwrote the version on
 * every write) are structurally identical to v3, so they migrate in place.
 */
function migrate(data, userId) {
  let doc = data && typeof data === 'object' && !Array.isArray(data) ? data : emptyData(userId);
  for (const key of COLLECTIONS) if (!Array.isArray(doc[key])) doc[key] = [];
  if (!doc.settings || typeof doc.settings !== 'object') doc.settings = { user_id: userId, ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) if (doc.settings[k] === undefined) doc.settings[k] = v;
  if (!doc.user || typeof doc.user !== 'object') doc.user = { id: userId, profileComplete: false };
  const from = Number(doc.schemaVersion) || 1;
  if (from > SCHEMA_VERSION) {
    throw new AppError(`Data file uses a newer schema (v${from}) than this server supports (v${SCHEMA_VERSION}). Please update the application.`, 409, 'SCHEMA_TOO_NEW');
  }
  // Placeholder flag introduced with the payments rollover rework: legacy
  // auto-created rows are all-zero and note-less.
  for (const p of doc.payments) {
    if (p && p.placeholder === undefined && !p.notes && !Number(p.total_payment) && !Number(p.monthly_rent) && !Number(p.electricity) && !Number(p.gas) && !Number(p.previous_dues)) {
      p.placeholder = true;
    }
  }
  doc.schemaVersion = SCHEMA_VERSION;
  return doc;
}

module.exports = { SCHEMA_VERSION, COLLECTIONS, DEFAULT_SETTINGS, emptyData, migrate };
