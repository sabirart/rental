'use strict';
process.env.JWT_SECRET = 'unit-secret-unit-secret-unit-secret-123';
const { toMoney, computeTotal, statusFor, receivedFromFlags } = require('../services/paymentMath');
const { migrate, emptyData, SCHEMA_VERSION } = require('../services/schema');
const { encryptValue, decryptValue } = require('../utils/cookies');
const UserSettings = require('../models/UserSettings');
const { errorHandler, AppError, httpError } = require('../middleware/errorHandler');

describe('paymentMath', () => {
  test('money is rounded to cents and never negative/NaN', () => {
    expect(toMoney('12.345')).toBe(12.35);
    expect(toMoney(-5)).toBe(0);
    expect(toMoney('abc')).toBe(0);
    expect(computeTotal({ rent: 0.1, electricity: 0.2 })).toBe(0.3);
  });
  test('status derives from amounts', () => {
    expect(statusFor(0, 0)).toBe('unbilled');
    expect(statusFor(100, 0)).toBe('unpaid');
    expect(statusFor(100, 0.01)).toBe('partial');
    expect(statusFor(100, 100)).toBe('paid');
    expect(statusFor(100, 150)).toBe('paid');
  });
  test('flags: only an explicit true counts as received', () => {
    expect(receivedFromFlags([{ value: 10, enabled: true }, { value: 5, enabled: undefined }, { value: 3, enabled: false }])).toBe(10);
  });
});

describe('schema.migrate', () => {
  test('adds missing structure, keeps records, stamps current version', () => {
    const d = migrate({ schemaVersion: 1, properties: [{ id: 'a' }] }, 'u');
    expect(d.properties).toHaveLength(1);
    expect(d.rooms).toEqual([]);
    expect(d.settings.monthly_reset_day).toBe(31);
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
  });
  test('legacy all-zero payments are flagged as placeholders', () => {
    const d = migrate({ ...emptyData('u'), payments: [{ id: 'x', monthly_rent: 0, total_payment: 0 }, { id: 'y', monthly_rent: 5, total_payment: 5 }] }, 'u');
    expect(d.payments[0].placeholder).toBe(true);
    expect(d.payments[1].placeholder).toBeUndefined();
  });
  test('garbage input becomes an empty document', () => {
    expect(migrate(null, 'u').properties).toEqual([]);
    expect(migrate([], 'u').tenants).toEqual([]);
  });
});

describe('cookie encryption', () => {
  test('round-trips, is randomised, detects tampering, accepts legacy plaintext', () => {
    const token = '1//0g-refresh-token';
    const a = encryptValue(token); const b = encryptValue(token);
    expect(a).not.toBe(b);
    expect(a).not.toContain(token);
    expect(decryptValue(a)).toBe(token);
    expect(decryptValue(a.slice(0, -2) + 'AA')).toBeNull();
    expect(decryptValue(token)).toBe(token);
    expect(decryptValue('')).toBeNull();
  });
});

describe('billing period', () => {
  test('reset day 31 is the calendar month; later reset days roll to next month after the day', () => {
    expect(UserSettings.getEffectivePeriod(new Date(2025, 0, 20), 31)).toEqual({ month: 1, year: 2025 });
    expect(UserSettings.getEffectivePeriod(new Date(2025, 0, 26), 25)).toEqual({ month: 2, year: 2025 });
    expect(UserSettings.getEffectivePeriod(new Date(2025, 11, 30), 25)).toEqual({ month: 1, year: 2026 });
    expect(UserSettings.getEffectivePeriod(new Date(2025, 1, 28), 31)).toEqual({ month: 2, year: 2025 });
  });
});

describe('error handler mapping', () => {
  const run = (err) => {
    const res = { headersSent: false, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(err, { method: 'GET', path: '/x' }, res, () => {});
    spy.mockRestore();
    return res;
  };
  test('model messages', () => { expect(httpError('Tenant not found').statusCode).toBe(404); expect(httpError('Bad thing').statusCode).toBe(400); });
  test('AppError keeps status', () => expect(run(new AppError('nope', 418)).code).toBe(418));
  test('plain Error is 500 and generic', () => { const r = run(new Error('db password leaked')); expect(r.code).toBe(500); expect(JSON.stringify(r.body)).not.toMatch(/password/); });
  test('Google 401/403 map to re-auth, quota to storage-full', () => {
    const g = (code, extra = {}) => Object.assign(new Error('x'), { code, response: { status: code, config: { url: 'https://www.googleapis.com/drive' }, data: {} }, ...extra });
    expect(run(g(401)).code).toBe(401);
    expect(run(g(403)).code).toBe(403);
    expect(run(g(403, { errors: [{ reason: 'storageQuotaExceeded' }] })).body.code).toBe('GOOGLE_DRIVE_STORAGE_FULL');
    expect(run(g(429)).code).toBe(503);
  });
});
