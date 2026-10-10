'use strict';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csecret';
process.env.API_RATE_LIMIT = '100000';
process.env.AUTH_RATE_LIMIT = '100000';
const request = require('supertest');
const Drive = require('../../services/driveStore');
const Auth = require('../../middleware/auth');
const { FakeDrive } = require('./fakeDrive');

const app = require('../../server');
const fake = new FakeDrive();
Drive.setDriveClientFactory(fake.factory());

/** A signed-in browser: signed session cookie + short-lived Drive token cookie. */
function agentFor(userKey) {
  const user = { id: `google:${userKey}`, email: `${userKey}@example.com`, name: userKey, googleId: userKey };
  const cookie = [`rental_session=${encodeURIComponent(Auth.createSession(user))}`, `google_drive_token=tok-${userKey}`, `google_drive_owner=${encodeURIComponent(user.id)}`].join('; ');
  const wrap = (method) => (url) => request(app)[method](url).set('Cookie', cookie);
  return { user, cookie, account: fake.account(`tok-${userKey}`), get: wrap('get'), post: wrap('post'), put: wrap('put'), delete: wrap('delete') };
}

const tenantBody = (o = {}) => ({ name: 'Ali Khan', fatherName: 'Khan Sr', cnic: '12345-1234567-1', location: 'Karachi', propertyId: o.propertyId, roomNumber: 1, mobileNumber: '03001234567', ...o });
async function seedProperty(a, over = {}) {
  const r = await a.post('/api/properties').send({ name: 'Sunrise Plaza', address: '12 Main Road', totalRooms: 4, baseRent: 10000, ...over });
  return r.body.data;
}
module.exports = { app, fake, Drive, Auth, agentFor, tenantBody, seedProperty, request };
