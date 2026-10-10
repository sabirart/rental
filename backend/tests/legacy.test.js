'use strict';
const { agentFor, Drive, fake } = require('./helpers/app');
jest.mock('pg', () => {
  const rows = {
    'FROM users': [{ id: 7, name: 'Old' }],
    'FROM properties WHERE': [{ id: 11, name: 'Old Plaza', address: '12 Old Road', total_rooms: 1, base_rent: '100', created_at: new Date('2020-01-01') }],
    'FROM rooms': [{ id: 'r1', property_id: 11, room_number: 1, status: 'available', rent_amount: 100 }],
    'FROM tenants': [], 'FROM payments': [], 'FROM recycle_bin': [], 'FROM user_settings': []
  };
  return { Pool: class { async query(sql) { const k = Object.keys(rows).find((x) => sql.includes(x)); return { rows: rows[k] || [] }; } async end() {} } };
});
const { migrateCurrentUserFromLegacy } = require('../services/legacyMigration');

test('legacy rows are validated and imported once, never over existing data', async () => {
  process.env.LEGACY_DATABASE_URL = 'postgres://x';
  const a = agentFor('legacy1');
  const first = await migrateCurrentUserFromLegacy(a.user.id, 'x@y.z', 'g', 'tok-legacy1');
  expect(first).toMatchObject({ migrated: true, counts: { properties: 1, rooms: 1 } });
  const second = await migrateCurrentUserFromLegacy(a.user.id, 'x@y.z', 'g', 'tok-legacy1');
  expect(second.migrated).toBe(false);
  expect(JSON.parse(a.account.find((f) => f.name === 'rental-manager-data.json')[0].content).properties[0].name).toBe('Old Plaza');
  delete process.env.LEGACY_DATABASE_URL;
});
