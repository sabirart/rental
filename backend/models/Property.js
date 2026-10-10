'use strict';
const Drive = require('../services/driveStore');
const { httpError } = require('../middleware/errorHandler');
const { newId } = require('../utils/id');

const now = () => new Date().toISOString();
const roomId = (propertyId, n) => `${propertyId}-room-${n}`;

function prop(data, userId) {
  return {
    id: data.id, user_id: userId, name: data.name, address: data.address, total_rooms: Number(data.totalRooms),
    base_rent: Number(data.baseRent) || 0, status: data.status || 'active', description: data.description || null,
    created_at: data.created_at || now(), updated_at: now()
  };
}
const maxRoomNumber = (rooms) => rooms.reduce((m, r) => Math.max(m, Number(r.room_number)), 0);

/**
 * `total_rooms` is the highest room NUMBER in use (so removing a middle room
 * does not make the later rooms unassignable); `room_count` is how many rooms exist.
 */
function enrich(p, d) {
  if (!p) return null;
  const rooms = d.rooms.filter((r) => r.property_id === p.id);
  const tenants = d.tenants.filter((t) => t.property_id === p.id && t.status === 'active');
  return {
    ...p, tenant_count: tenants.length, occupied_rooms: rooms.filter((r) => r.status === 'occupied').length,
    room_count: rooms.length, total_rooms: rooms.length ? maxRoomNumber(rooms) : p.total_rooms
  };
}
const ownProperty = (d, id, userId) => {
  const p = d.properties.find((x) => x.id === id && x.user_id === userId);
  if (!p) throw httpError('Property not found');
  return p;
};

class Property {
  static async findAll(userId) {
    const d = await Drive.getData();
    return d.properties.filter((p) => p.user_id === userId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map((p) => enrich(p, d));
  }

  static async findById(id, userId) {
    const d = await Drive.getData();
    return enrich(d.properties.find((x) => x.id === id && (!userId || x.user_id === userId)), d);
  }

  static async create(data, userId) {
    if (!data.name || !data.address || !data.totalRooms || data.totalRooms < 1) throw httpError('Name, address, and totalRooms (minimum 1) are required');
    if (data.baseRent === undefined || data.baseRent < 0) throw httpError('Base rent must be a positive number');
    return Drive.mutate((d) => {
      const p = prop({ ...data, id: data.id || newId() }, userId);
      d.properties.push(p);
      for (let i = 1; i <= p.total_rooms; i += 1) {
        d.rooms.push({ id: roomId(p.id, i), property_id: p.id, room_number: i, room_name: `Room ${i}`, status: 'available', tenant_id: null, rent_amount: p.base_rent });
      }
      return enrich(p, d);
    });
  }

  static async update(id, data, userId) {
    if (!data.name || !data.address || !data.totalRooms || data.totalRooms < 1) throw httpError('Name, address, and totalRooms (minimum 1) are required');
    if (data.baseRent === undefined || data.baseRent < 0) throw httpError('Base rent must be a positive number');
    return Drive.mutate((d) => {
      const p = ownProperty(d, id, userId);
      const mine = d.rooms.filter((r) => r.property_id === id);
      const old = mine.length ? maxRoomNumber(mine) : Number(p.total_rooms);
      const next = Number(data.totalRooms);
      for (let i = next + 1; i <= old; i += 1) {
        const r = mine.find((x) => Number(x.room_number) === i);
        if (r && r.status === 'occupied') throw httpError(`Cannot remove Room ${i} because it is occupied`);
      }
      d.rooms = d.rooms.filter((r) => !(r.property_id === id && r.room_number > next));
      for (let i = old + 1; i <= next; i += 1) {
        d.rooms.push({ id: roomId(id, i), property_id: id, room_number: i, room_name: `Room ${i}`, status: 'available', tenant_id: null, rent_amount: Number(data.baseRent) });
      }
      Object.assign(p, prop({ ...data, id }, userId), { created_at: p.created_at });
      return enrich(p, d);
    });
  }

  static async delete(id, userId) {
    return Drive.mutate((d) => {
      const p = ownProperty(d, id, userId);
      const active = d.tenants.filter((t) => t.property_id === id && t.status === 'active');
      if (active.length) throw httpError(`Cannot delete property with ${active.length} active tenants`);
      const rooms = d.rooms.filter((r) => r.property_id === id);
      d.recycleBin.push({ id: `rb-${newId()}`, user_id: userId, type: 'property', original_id: id, data: { ...JSON.parse(JSON.stringify(p)), rooms: JSON.parse(JSON.stringify(rooms)) }, deleted_at: now() });
      d.properties = d.properties.filter((x) => x.id !== id);
      d.rooms = d.rooms.filter((x) => x.property_id !== id);
      return p;
    });
  }

  static async getRooms(propertyId, userId) {
    const d = await Drive.getData();
    if (userId && !d.properties.some((p) => p.id === propertyId && p.user_id === userId)) return [];
    return d.rooms.filter((r) => r.property_id === propertyId).sort((a, b) => a.room_number - b.room_number);
  }

  /** Only the fields present in `data` are touched (editing name/rent never unlinks the tenant). */
  static async updateRoom(propertyId, roomNumber, data, userId) {
    return Drive.mutate((d) => {
      if (userId) ownProperty(d, propertyId, userId);
      const r = d.rooms.find((x) => x.property_id === propertyId && Number(x.room_number) === Number(roomNumber));
      if (!r) throw httpError('Room not found');
      if (data.status && !['available', 'occupied', 'maintenance'].includes(data.status)) throw httpError('Invalid status. Must be: available, occupied, or maintenance');
      if (data.status !== undefined) {
        const holder = r.tenant_id && d.tenants.find((t) => t.id === r.tenant_id && t.status === 'active');
        if (holder && data.status !== 'occupied') throw httpError(`Room ${roomNumber} is occupied by ${holder.name}. Move or deactivate the tenant first.`);
        r.status = data.status;
      }
      if (data.tenantId !== undefined) r.tenant_id = data.tenantId || null;
      if (data.rentAmount !== undefined) r.rent_amount = Number(data.rentAmount) || 0;
      if (data.roomName !== undefined) r.room_name = data.roomName || r.room_name;
      return { ...r };
    });
  }

  static async addRoom(propertyId, roomNumber, roomName = null, rentAmount = null, userId = null) {
    return Drive.mutate((d) => {
      const p = userId ? ownProperty(d, propertyId, userId) : d.properties.find((x) => x.id === propertyId);
      if (d.rooms.some((r) => r.property_id === propertyId && Number(r.room_number) === Number(roomNumber))) throw httpError('Room number already exists');
      const r = {
        id: roomId(propertyId, roomNumber), property_id: propertyId, room_number: Number(roomNumber),
        room_name: roomName || `Room ${roomNumber}`, status: 'available', tenant_id: null, rent_amount: Number(rentAmount ?? p?.base_rent ?? 0) || 0
      };
      d.rooms.push(r);
      if (p && Number(roomNumber) > p.total_rooms) p.total_rooms = Number(roomNumber);
      return r;
    });
  }

  static async removeRoom(propertyId, roomNumber, userId = null) {
    return Drive.mutate((d) => {
      if (userId) ownProperty(d, propertyId, userId);
      const i = d.rooms.findIndex((r) => r.property_id === propertyId && Number(r.room_number) === Number(roomNumber));
      if (i < 0) throw httpError('Room not found');
      if (d.rooms[i].status === 'occupied') throw httpError(`Cannot remove Room ${roomNumber} because it is occupied`);
      const [r] = d.rooms.splice(i, 1);
      return r;
    });
  }

}
module.exports = Property;
