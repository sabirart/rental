'use strict';
/**
 * Strict, allow-list based validation for backup import / restore.
 *
 * Nothing from an untrusted backup is spread into live data: every record is
 * rebuilt field by field with type, range and size limits, ownership is
 * rewritten to the signed-in user, relationships are reconciled, and the
 * result is returned as a *new* object so the caller can preview it, take a
 * pre-import snapshot and only then swap it in atomically.
 */
const { AppError } = require('../middleware/errorHandler');
const { SCHEMA_VERSION, DEFAULT_SETTINGS } = require('./schema');
const { MAX_MONEY, toMoney, statusFor, receivedFromFlags } = require('./paymentMath');

const LIMITS = Object.freeze({ properties: 2000, rooms: 40000, tenants: 10000, payments: 200000, recycleBin: 10000, errors: 25 });
const MAX_DATA_URI_CHARS = 8 * 1024 * 1024; // ~6 MB raw once base64 decoded
const MAX_DOCS_PER_TENANT = 5;
const ID_RE = /^[A-Za-z0-9_.:\-]{1,160}$/;
const CNIC_RE = /^[0-9]{5}-[0-9]{7}-[0-9]$/;
const IMAGE_URI_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i;
const DOC_URI_RE = /^data:(image\/(png|jpe?g|gif|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,[A-Za-z0-9+/=\s]+$/i;
const PLAIN_OBJECT = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

class Collector {
  constructor() { this.errors = []; this.warnings = []; }
  error(path, message) { if (this.errors.length < LIMITS.errors) this.errors.push(`${path}: ${message}`); else this.truncated = true; }
  warn(message) { this.warnings.push(message); }
}

// ---- primitive readers (each returns the cleaned value or undefined on failure)
const read = {
  str(c, path, v, { max = 255, required = false, allowEmpty = false } = {}) {
    if (v === undefined || v === null || v === '') {
      if (required) c.error(path, 'is required');
      return allowEmpty ? '' : null;
    }
    if (typeof v !== 'string') { c.error(path, 'must be text'); return null; }
    const t = v.trim();
    if (!t && required) { c.error(path, 'is required'); return null; }
    if (t.length > max) { c.error(path, `must be at most ${max} characters`); return null; }
    // strip control characters except tab/newline
    return t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  },
  id(c, path, v, { required = true } = {}) {
    if (v === undefined || v === null || v === '') { if (required) c.error(path, 'is required'); return null; }
    const s = typeof v === 'number' ? String(v) : v;
    if (typeof s !== 'string' || !ID_RE.test(s)) { c.error(path, 'is not a valid id'); return null; }
    return s;
  },
  int(c, path, v, { min = 0, max = 1e6, required = false } = {}) {
    if (v === undefined || v === null || v === '') { if (required) c.error(path, 'is required'); return null; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) { c.error(path, `must be a whole number between ${min} and ${max}`); return null; }
    return n;
  },
  money(c, path, v, { required = false } = {}) {
    if (v === undefined || v === null || v === '') { if (required) c.error(path, 'is required'); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) { c.error(path, `must be an amount between 0 and ${MAX_MONEY}`); return 0; }
    return toMoney(n);
  },
  date(c, path, v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v)) || v.length > 40) { c.error(path, 'must be a valid date'); return null; }
    return v;
  },
  enum(c, path, v, values, fallback) {
    if (v === undefined || v === null || v === '') return fallback;
    if (!values.includes(v)) { c.error(path, `must be one of: ${values.join(', ')}`); return fallback; }
    return v;
  },
  image(c, path, v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || v.length > MAX_DATA_URI_CHARS || !IMAGE_URI_RE.test(v)) { c.error(path, 'must be a PNG, JPEG, GIF or WebP image'); return null; }
    return v;
  },
  bool(v, fallback = true) { return v === undefined || v === null ? fallback : v === true || v === 1 || v === 'true' || v === '1'; }
};

function sanitizeDocuments(c, path, list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) { c.error(path, 'must be a list'); return []; }
  if (list.length > MAX_DOCS_PER_TENANT) c.error(path, `can hold at most ${MAX_DOCS_PER_TENANT} documents`);
  return list.slice(0, MAX_DOCS_PER_TENANT).map((doc, i) => {
    const p = `${path}[${i}]`;
    if (!PLAIN_OBJECT(doc)) { c.error(p, 'must be an object'); return null; }
    const data = doc.data;
    if (typeof data !== 'string' || data.length > MAX_DATA_URI_CHARS || !DOC_URI_RE.test(data)) {
      c.error(`${p}.data`, 'must be a base64 image, PDF or Word document');
      return null;
    }
    return {
      name: read.str(c, `${p}.name`, doc.name, { max: 255 }) || 'Document',
      type: read.str(c, `${p}.type`, doc.type, { max: 120 }) || data.slice(5, data.indexOf(';')),
      size: read.int(c, `${p}.size`, doc.size, { min: 0, max: 50 * 1024 * 1024 }) ?? 0,
      data
    };
  }).filter(Boolean);
}

function sanitizeProperty(c, path, x, userId) {
  if (!PLAIN_OBJECT(x)) { c.error(path, 'must be an object'); return null; }
  const rooms = read.int(c, `${path}.total_rooms`, x.total_rooms ?? x.totalRooms, { min: 0, max: 10000 });
  return {
    id: read.id(c, `${path}.id`, x.id),
    user_id: userId,
    name: read.str(c, `${path}.name`, x.name, { max: 100, required: true }),
    address: read.str(c, `${path}.address`, x.address, { max: 500, required: true }),
    total_rooms: rooms ?? 0,
    base_rent: read.money(c, `${path}.base_rent`, x.base_rent ?? x.baseRent),
    status: read.enum(c, `${path}.status`, x.status, ['active', 'inactive', 'maintenance'], 'active'),
    description: read.str(c, `${path}.description`, x.description, { max: 500 }),
    created_at: read.date(c, `${path}.created_at`, x.created_at) || new Date().toISOString(),
    updated_at: read.date(c, `${path}.updated_at`, x.updated_at) || new Date().toISOString()
  };
}

function sanitizeRoom(c, path, x) {
  if (!PLAIN_OBJECT(x)) { c.error(path, 'must be an object'); return null; }
  const number = read.int(c, `${path}.room_number`, x.room_number, { min: 1, max: 10000, required: true });
  const propertyId = read.id(c, `${path}.property_id`, x.property_id);
  return {
    id: read.id(c, `${path}.id`, x.id, { required: false }) || (propertyId && number ? `${propertyId}-room-${number}` : null),
    property_id: propertyId,
    room_number: number,
    room_name: read.str(c, `${path}.room_name`, x.room_name, { max: 100 }) || (number ? `Room ${number}` : null),
    status: read.enum(c, `${path}.status`, x.status, ['available', 'occupied', 'maintenance'], 'available'),
    tenant_id: read.id(c, `${path}.tenant_id`, x.tenant_id, { required: false }),
    rent_amount: read.money(c, `${path}.rent_amount`, x.rent_amount ?? x.rentAmount)
  };
}

function sanitizeTenant(c, path, x, userId) {
  if (!PLAIN_OBJECT(x)) { c.error(path, 'must be an object'); return null; }
  const cnic = read.str(c, `${path}.cnic`, x.cnic, { max: 20, required: true });
  if (cnic && !CNIC_RE.test(cnic)) c.error(`${path}.cnic`, 'must look like XXXXX-XXXXXXX-X');
  return {
    id: read.id(c, `${path}.id`, x.id),
    user_id: userId,
    name: read.str(c, `${path}.name`, x.name, { max: 100, required: true }),
    father_name: read.str(c, `${path}.father_name`, x.father_name ?? x.fatherName, { max: 100, required: true }),
    cnic,
    location: read.str(c, `${path}.location`, x.location, { max: 200, required: true }),
    description: read.str(c, `${path}.description`, x.description, { max: 500 }),
    property_id: read.id(c, `${path}.property_id`, x.property_id, { required: false }),
    room_number: read.int(c, `${path}.room_number`, x.room_number, { min: 1, max: 10000 }),
    status: read.enum(c, `${path}.status`, x.status, ['active', 'inactive'], 'active'),
    profile_pic: read.image(c, `${path}.profile_pic`, x.profile_pic),
    documents: sanitizeDocuments(c, `${path}.documents`, x.documents),
    mobile_number: read.str(c, `${path}.mobile_number`, x.mobile_number ?? x.mobileNumber, { max: 30 }),
    advance_payment: read.money(c, `${path}.advance_payment`, x.advance_payment ?? x.advancePayment),
    lease_end_date: read.date(c, `${path}.lease_end_date`, x.lease_end_date ?? x.leaseEndDate),
    created_at: read.date(c, `${path}.created_at`, x.created_at) || new Date().toISOString(),
    updated_at: read.date(c, `${path}.updated_at`, x.updated_at) || new Date().toISOString()
  };
}

function sanitizeCustomCharges(c, path, list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).map((ch, i) => (PLAIN_OBJECT(ch)
    ? { name: read.str(c, `${path}[${i}].name`, ch.name, { max: 100 }) || 'Charge', amount: read.money(c, `${path}[${i}].amount`, ch.amount) }
    : null)).filter(Boolean);
}

function sanitizePayment(c, path, x, userId) {
  if (!PLAIN_OBJECT(x)) { c.error(path, 'must be an object'); return null; }
  const rent = read.money(c, `${path}.monthly_rent`, x.monthly_rent ?? x.monthlyRent);
  const electricity = read.money(c, `${path}.electricity`, x.electricity);
  const gas = read.money(c, `${path}.gas`, x.gas);
  const dues = read.money(c, `${path}.previous_dues`, x.previous_dues ?? x.previousDues);
  const flags = {
    rent_enabled: read.bool(x.rent_enabled), electricity_enabled: read.bool(x.electricity_enabled),
    gas_enabled: read.bool(x.gas_enabled), previous_dues_enabled: read.bool(x.previous_dues_enabled)
  };
  const total = toMoney(rent + electricity + gas + dues);
  let paid;
  if (x.amount_paid !== undefined && x.amount_paid !== null && x.amount_paid !== '') {
    paid = read.money(c, `${path}.amount_paid`, x.amount_paid);
    if (paid > total) { c.error(`${path}.amount_paid`, 'cannot exceed the total due'); paid = total; }
  } else {
    paid = receivedFromFlags([
      { value: rent, enabled: flags.rent_enabled }, { value: electricity, enabled: flags.electricity_enabled },
      { value: gas, enabled: flags.gas_enabled }, { value: dues, enabled: flags.previous_dues_enabled }
    ]);
  }
  const month = read.int(c, `${path}.month`, x.month, { min: 1, max: 12, required: true });
  const year = read.int(c, `${path}.year`, x.year, { min: 2000, max: 2100, required: true });
  return {
    id: read.id(c, `${path}.id`, x.id),
    user_id: userId,
    tenant_id: read.id(c, `${path}.tenant_id`, x.tenant_id),
    month, year,
    monthly_rent: rent, electricity, gas, previous_dues: dues,
    total_payment: total,
    amount_paid: paid,
    custom_charges: sanitizeCustomCharges(c, `${path}.custom_charges`, x.custom_charges),
    status: statusFor(total, paid),
    notes: read.str(c, `${path}.notes`, x.notes, { max: 500 }),
    ...flags,
    ...(x.placeholder === true ? { placeholder: true } : {}),
    created_at: read.date(c, `${path}.created_at`, x.created_at) || new Date().toISOString(),
    updated_at: read.date(c, `${path}.updated_at`, x.updated_at) || new Date().toISOString()
  };
}

function sanitizeRecycleItem(c, path, x, userId) {
  if (!PLAIN_OBJECT(x)) { c.error(path, 'must be an object'); return null; }
  const type = read.enum(c, `${path}.type`, x.type, ['tenant', 'property'], null);
  if (!type) { if (x.type !== undefined) return null; c.error(`${path}.type`, 'is required'); return null; }
  if (!PLAIN_OBJECT(x.data)) { c.error(`${path}.data`, 'must be an object'); return null; }
  let data;
  if (type === 'tenant') {
    data = sanitizeTenant(c, `${path}.data`, x.data, userId);
    if (data) {
      data.archivedPayments = (Array.isArray(x.data.archivedPayments) ? x.data.archivedPayments : [])
        .slice(0, LIMITS.payments).map((p, i) => sanitizePayment(c, `${path}.data.archivedPayments[${i}]`, p, userId)).filter(Boolean);
    }
  } else {
    data = sanitizeProperty(c, `${path}.data`, x.data, userId);
    if (data) data.rooms = (Array.isArray(x.data.rooms) ? x.data.rooms : []).slice(0, LIMITS.rooms).map((r, i) => sanitizeRoom(c, `${path}.data.rooms[${i}]`, r)).filter(Boolean);
  }
  if (!data) return null;
  return {
    id: read.id(c, `${path}.id`, x.id),
    user_id: userId,
    type,
    original_id: read.id(c, `${path}.original_id`, x.original_id ?? data.id),
    data,
    deleted_at: read.date(c, `${path}.deleted_at`, x.deleted_at) || new Date().toISOString()
  };
}

function sanitizeSettings(c, x, userId) {
  const s = PLAIN_OBJECT(x) ? x : {};
  return {
    user_id: userId,
    notifications_enabled: s.notifications_enabled === 0 || s.notifications_enabled === false ? 0 : DEFAULT_SETTINGS.notifications_enabled,
    monthly_reset_day: read.int(c, 'settings.monthly_reset_day', s.monthly_reset_day, { min: 1, max: 31 }) ?? DEFAULT_SETTINGS.monthly_reset_day,
    last_reset_month: read.int(c, 'settings.last_reset_month', s.last_reset_month, { min: 1, max: 12 }),
    last_reset_year: read.int(c, 'settings.last_reset_year', s.last_reset_year, { min: 2000, max: 2100 })
  };
}

function collect(c, name, list, fn) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) { c.error(name, 'must be a list'); return []; }
  if (list.length > LIMITS[name]) { c.error(name, `has too many records (limit ${LIMITS[name]})`); return []; }
  return list.map((item, i) => fn(c, `${name}[${i}]`, item)).filter(Boolean);
}

function uniqueBy(c, name, list, keyFn, label) {
  const seen = new Set();
  for (const item of list) {
    const k = keyFn(item);
    if (seen.has(k)) c.error(name, `contains a duplicate ${label} (${k})`);
    seen.add(k);
  }
}

/**
 * @param {object} incoming  parsed backup JSON (untrusted)
 * @param {string} userId    the signed-in account that will own the records
 * @returns {{ data: object, warnings: string[], counts: object }}
 * @throws  AppError(400, 'INVALID_BACKUP') with per-field `details`
 */
function validateBackup(incoming, userId) {
  const c = new Collector();
  if (!PLAIN_OBJECT(incoming) || !Array.isArray(incoming.properties) || !Array.isArray(incoming.tenants) || !Array.isArray(incoming.payments)) {
    throw new AppError('This file is not a valid Rental Manager backup.', 400, 'INVALID_BACKUP');
  }
  if (Number(incoming.schemaVersion) > SCHEMA_VERSION) {
    throw new AppError('This backup was created by a newer version of Rental Manager.', 400, 'INVALID_BACKUP');
  }

  const properties = collect(c, 'properties', incoming.properties, (cc, p, x) => sanitizeProperty(cc, p, x, userId));
  const tenants = collect(c, 'tenants', incoming.tenants, (cc, p, x) => sanitizeTenant(cc, p, x, userId));
  uniqueBy(c, 'properties', properties, (p) => p.id, 'id');
  uniqueBy(c, 'tenants', tenants, (t) => t.id, 'id');
  uniqueBy(c, 'tenants', tenants, (t) => t.cnic, 'CNIC');

  const propertyIds = new Set(properties.map((p) => p.id));
  const tenantIds = new Set(tenants.map((t) => t.id));

  // Rooms: explicit list, or rebuilt from per-property data / room counts (legacy exports).
  let rooms;
  if (Array.isArray(incoming.rooms)) {
    rooms = collect(c, 'rooms', incoming.rooms, sanitizeRoom);
  } else {
    rooms = [];
    incoming.properties.forEach((raw, idx) => {
      const prop = properties[idx];
      if (!prop || !PLAIN_OBJECT(raw)) return;
      const nested = Array.isArray(raw.rooms) ? raw.rooms : [];
      const count = Math.min(10000, Math.max(0, Number(raw.total_rooms || raw.totalRooms || nested.length || 0)));
      for (let n = 1; n <= count; n += 1) {
        const room = sanitizeRoom(c, `properties[${idx}].rooms[${n - 1}]`, { ...(nested.find((r) => Number(r?.room_number) === n) || {}), property_id: prop.id, room_number: n, rent_amount: nested.find((r) => Number(r?.room_number) === n)?.rent_amount ?? prop.base_rent });
        if (room) rooms.push(room);
      }
    });
  }
  const orphanRooms = rooms.filter((r) => !propertyIds.has(r.property_id)).length;
  if (orphanRooms) c.warn(`${orphanRooms} room(s) referencing unknown properties were skipped.`);
  rooms = rooms.filter((r) => propertyIds.has(r.property_id));
  uniqueBy(c, 'rooms', rooms, (r) => `${r.property_id}#${r.room_number}`, 'room number');
  uniqueBy(c, 'rooms', rooms, (r) => r.id, 'id');

  // Reconcile tenant <-> room relationships so the live data satisfies the app's invariants.
  const roomByKey = new Map(rooms.map((r) => [`${r.property_id}#${r.room_number}`, r]));
  for (const r of rooms) { if (r.tenant_id && !tenantIds.has(r.tenant_id)) r.tenant_id = null; if (r.status === 'occupied' && !r.tenant_id) r.status = 'available'; if (r.status !== 'occupied') r.tenant_id = null; }
  let relinked = 0;
  for (const t of tenants) {
    if (t.property_id && !propertyIds.has(t.property_id)) { t.property_id = null; t.room_number = null; relinked += 1; continue; }
    if (t.status !== 'active' || !t.property_id || !t.room_number) continue;
    const room = roomByKey.get(`${t.property_id}#${t.room_number}`);
    if (!room) { relinked += 1; continue; }
    if (room.status === 'occupied' && room.tenant_id && room.tenant_id !== t.id) { c.error('tenants', `tenants ${room.tenant_id} and ${t.id} both occupy room ${t.room_number} of property ${t.property_id}`); continue; }
    if (room.status !== 'maintenance') { room.status = 'occupied'; room.tenant_id = t.id; }
  }
  if (relinked) c.warn(`${relinked} tenant(s) referenced a missing property or room and were left without a room assignment.`);

  let payments = collect(c, 'payments', incoming.payments, (cc, p, x) => sanitizePayment(cc, p, x, userId));
  uniqueBy(c, 'payments', payments, (p) => p.id, 'id');
  const orphanPayments = payments.filter((p) => !tenantIds.has(p.tenant_id)).length;
  if (orphanPayments) c.warn(`${orphanPayments} payment(s) referencing unknown tenants were skipped.`);
  payments = payments.filter((p) => tenantIds.has(p.tenant_id));
  const seenPeriod = new Set();
  const dedupedPayments = [];
  for (const p of payments) {
    const key = `${p.tenant_id}#${p.year}#${p.month}`;
    if (seenPeriod.has(key)) { c.warn(`Duplicate payment for tenant ${p.tenant_id} ${p.month}/${p.year} was skipped.`); continue; }
    seenPeriod.add(key);
    dedupedPayments.push(p);
  }

  const recycleBin = collect(c, 'recycleBin', incoming.recycleBin, (cc, p, x) => sanitizeRecycleItem(cc, p, x, userId));
  uniqueBy(c, 'recycleBin', recycleBin, (r) => r.id, 'id');

  if (c.errors.length) {
    throw new AppError(
      `This backup could not be imported because ${c.errors.length}${c.truncated ? '+' : ''} problem(s) were found. Nothing was changed.`,
      400, 'INVALID_BACKUP', c.errors
    );
  }

  const data = {
    schemaVersion: SCHEMA_VERSION,
    properties, rooms, tenants, payments: dedupedPayments, recycleBin,
    settings: sanitizeSettings(c, incoming.settings, userId)
  };
  return { data, warnings: c.warnings, counts: countsOf(data) };
}

function countsOf(d) {
  return { properties: d.properties.length, rooms: d.rooms.length, tenants: d.tenants.length, payments: d.payments.length, recycleBin: d.recycleBin.length };
}

module.exports = { validateBackup, countsOf, LIMITS, MAX_DATA_URI_CHARS, IMAGE_URI_RE, DOC_URI_RE };
