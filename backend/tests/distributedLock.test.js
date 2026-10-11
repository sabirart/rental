'use strict';
const { lockKey } = require('../services/distributedLock');

describe('distributed write-lock keys', () => {
  test('keys are stable signed int64 strings suitable for PostgreSQL advisory locks', () => {
    const a = lockKey('google:account-a');
    expect(a).toBe(lockKey('google:account-a'));
    expect(a).toMatch(/^-?\d+$/);
    expect(BigInt(a)).toBeGreaterThanOrEqual(-(1n << 63n));
    expect(BigInt(a)).toBeLessThan(1n << 63n);
  });
  test('different accounts have independent keys', () => {
    expect(lockKey('google:account-a')).not.toBe(lockKey('google:account-b'));
  });
});
