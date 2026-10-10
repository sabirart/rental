'use strict';
const Drive = require('../services/driveStore');
const { httpError } = require('../middleware/errorHandler');
const { newId } = require('../utils/id');

const now = () => new Date().toISOString();
const findRoom = (d, propertyId, roomNumber) => d.rooms.find((r) => r.property_id === propertyId && Number(r.room_number) === Number(roomNumber));

function enrich(t, d) {
  if (!t) return null;
  const p = d.properties.find((x) => x.id === t.property_id);
  return { ...t, property_name: p?.name || null, property_address: p?.address || null, documents: Array.isArray(t.documents) ? t.documents : [] };
}

/** Frees the room only if THIS tenant is the one holding it. */
function releaseRoom(d, tenant) {
  if (!tenant.property_id || !tenant.room_number) return;
  const room = findRoom(d, tenant.property_id, tenant.room_number);
  if (room && room.tenant_id === tenant.id) { room.status = 'available'; room.tenant_id = null; }
}

/**
 * Room assignment lives here and ONLY here. Only active tenants occupy a
 * room; inactive tenants keep their historical property/room reference but
 * never hold the room.
 */
function occupyRoom(d, tenant) {
  if (tenant.status !== 'active' || !tenant.property_id || !tenant.room_number) return;
  const room = findRoom(d, tenant.property_id, tenant.room_number);
  if (room) { room.status = 'occupied'; room.tenant_id = tenant.id; }
}

class Tenant {
  static enrich(t, d) { return enrich(t, d); }
  static releaseRoom(d, t) { return releaseRoom(d, t); }

  static async findAll(userId) {
    const d = await Drive.getData();
    return d.tenants.filter((t) => t.user_id === userId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map((t) => enrich(t, d));
  }

  static async findById(id, userId) {
    const d = await Drive.getData();
    return enrich(d.tenants.find((t) => t.id === id && t.user_id === userId), d);
  }

  static async create(data, userId) {
    const { id, name, fatherName, cnic, location, description, propertyId, roomNumber, status, documents, mobileNumber, advancePayment, leaseEndDate } = data;
    if (!name || !fatherName || !cnic || !location) throw httpError('Required fields missing: name, fatherName, cnic, location');
    return Drive.mutate((d) => {
      if (d.tenants.some((t) => t.user_id === userId && t.cnic === cnic)) throw httpError('A tenant with this CNIC already exists');
      const t = {
        id: id || newId(), user_id: userId, name, father_name: fatherName, cnic, location,
        description: description || null, property_id: propertyId || null, room_number: roomNumber || null,
        status: status || 'active', profile_pic: data.profile_pic || null, documents: Array.isArray(documents) ? documents : [],
        mobile_number: mobileNumber || null, advance_payment: Number(advancePayment) || 0, lease_end_date: leaseEndDate || null,
        created_at: now(), updated_at: now()
      };
      d.tenants.push(t);
      occupyRoom(d, t);
      return enrich(t, d);
    });
  }

  static async update(id, data, userId) {
    const { name, fatherName, cnic, location, description, propertyId, roomNumber, status, documents, mobileNumber, advancePayment, leaseEndDate } = data;
    if (!name || !fatherName || !cnic || !location) throw httpError('Required fields missing: name, fatherName, cnic, location');
    return Drive.mutate((d) => {
      const t = d.tenants.find((x) => x.id === id && x.user_id === userId);
      if (!t) throw httpError('Tenant not found');
      if (d.tenants.some((x) => x.user_id === userId && x.id !== id && x.cnic === cnic)) throw httpError('A tenant with this CNIC already exists');
      releaseRoom(d, t);
      Object.assign(t, {
        name, father_name: fatherName, cnic, location, description: description || null,
        property_id: propertyId || null, room_number: roomNumber || null, status: status || t.status || 'active',
        // Omitted media fields keep their stored value; null/[] explicitly clears them.
        profile_pic: data.profile_pic !== undefined ? (data.profile_pic || null) : t.profile_pic,
        documents: documents !== undefined ? (Array.isArray(documents) ? documents : []) : (t.documents || []),
        mobile_number: mobileNumber !== undefined ? (mobileNumber || null) : t.mobile_number,
        advance_payment: advancePayment !== undefined ? (Number(advancePayment) || 0) : t.advance_payment,
        lease_end_date: leaseEndDate !== undefined ? (leaseEndDate || null) : t.lease_end_date,
        updated_at: now()
      });
      occupyRoom(d, t);
      return enrich(t, d);
    });
  }

  static async delete(id, userId) {
    return Drive.mutate((d) => {
      const t = d.tenants.find((x) => x.id === id && x.user_id === userId);
      if (!t) throw httpError('Tenant not found');
      releaseRoom(d, t);
      const archivedPayments = d.payments.filter((p) => p.tenant_id === id && (!p.user_id || p.user_id === userId)).map((p) => JSON.parse(JSON.stringify(p)));
      d.recycleBin.push({ id: `rb-${newId()}`, user_id: userId, type: 'tenant', original_id: id, data: { ...JSON.parse(JSON.stringify(t)), archivedPayments }, deleted_at: now() });
      d.tenants = d.tenants.filter((x) => x.id !== id);
      d.payments = d.payments.filter((p) => !(p.tenant_id === id && (!p.user_id || p.user_id === userId)));
      return t;
    });
  }

  static async findByProperty(propertyId, userId) {
    const d = await Drive.getData();
    return d.tenants.filter((t) => t.property_id === propertyId && t.user_id === userId).sort((a, b) => (a.room_number || 0) - (b.room_number || 0)).map((t) => enrich(t, d));
  }

  static async findByCNIC(cnic, userId) {
    const d = await Drive.getData();
    return enrich(d.tenants.find((t) => t.cnic === cnic && t.user_id === userId), d);
  }
}
module.exports = Tenant;
