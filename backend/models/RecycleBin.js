'use strict';
const Drive = require('../services/driveStore');
const { httpError } = require('../middleware/errorHandler');
const { newId } = require('../utils/id');

const now = () => new Date().toISOString();
const clone = (v) => JSON.parse(JSON.stringify(v));

class RecycleBin {
  static async addTenant(tenantData, userId) {
    return Drive.mutate((d) => {
      const item = { id: `rb-${newId()}`, user_id: userId, type: 'tenant', original_id: tenantData.id, data: clone(tenantData), deleted_at: now() };
      d.recycleBin.push(item);
      return item;
    });
  }

  static async addProperty(propertyData, userId, rooms = []) {
    return Drive.mutate((d) => {
      const item = { id: `rb-${newId()}`, user_id: userId, type: 'property', original_id: propertyData.id, data: { ...clone(propertyData), rooms: clone(rooms) }, deleted_at: now() };
      d.recycleBin.push(item);
      return item;
    });
  }

  static async getAll(userId, type = null) {
    const d = await Drive.getData();
    return d.recycleBin.filter((x) => x.user_id === userId && (!type || x.type === type)).sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)));
  }

  static async getById(id, userId) {
    const d = await Drive.getData();
    return d.recycleBin.find((x) => x.id === id && x.user_id === userId) || null;
  }

  static async recover(id, userId) {
    return Drive.mutate((d) => {
      const item = d.recycleBin.find((x) => x.id === id && x.user_id === userId);
      if (!item) throw httpError('Recycle bin item not found');
      const warnings = [];
      if (item.type === 'tenant') {
        const archived = Array.isArray(item.data.archivedPayments) ? item.data.archivedPayments : [];
        const t = { ...item.data, id: item.original_id, user_id: userId, documents: Array.isArray(item.data.documents) ? item.data.documents : [] };
        delete t.archivedPayments;
        if (d.tenants.some((x) => x.id === t.id)) throw httpError('A tenant with this ID already exists');
        if (t.cnic && d.tenants.some((x) => x.user_id === userId && x.cnic === t.cnic)) throw httpError('A tenant with this CNIC already exists');
        if (t.property_id && t.room_number) {
          const propertyExists = d.properties.some((p) => p.id === t.property_id && p.user_id === userId);
          const r = d.rooms.find((x) => x.property_id === t.property_id && Number(x.room_number) === Number(t.room_number));
          if (!propertyExists || !r) {
            warnings.push('The original property or room no longer exists, so the tenant was recovered without a room assignment.');
            t.property_id = null; t.room_number = null;
          } else if (t.status === 'active' && r.status === 'occupied' && r.tenant_id !== t.id) {
            warnings.push('The original room is occupied, so the tenant was recovered without a room assignment.');
            t.property_id = null; t.room_number = null;
          } else if (t.status === 'active') { r.status = 'occupied'; r.tenant_id = t.id; }
        }
        d.tenants.push(t);
        const existing = new Set(d.payments.map((p) => p.id));
        const taken = new Set(d.payments.map((p) => `${p.tenant_id}#${p.year}#${p.month}`));
        for (const payment of archived) {
          const key = `${t.id}#${payment.year}#${payment.month}`;
          if (existing.has(payment.id) || taken.has(key)) continue;
          d.payments.push({ ...payment, tenant_id: t.id, user_id: userId });
        }
      } else if (item.type === 'property') {
        const p = { ...item.data, id: item.original_id, user_id: userId };
        if (d.properties.some((x) => x.id === p.id)) throw httpError('A property with this ID already exists');
        const rooms = Array.isArray(p.rooms) ? p.rooms : [];
        delete p.rooms;
        d.properties.push(p);
        for (const r of rooms) d.rooms.push({ ...r, id: r.id || `${p.id}-room-${r.room_number}`, property_id: p.id });
        if (!rooms.length && p.total_rooms) {
          for (let i = 1; i <= p.total_rooms; i += 1) d.rooms.push({ id: `${p.id}-room-${i}`, property_id: p.id, room_number: i, room_name: `Room ${i}`, status: 'available', tenant_id: null, rent_amount: p.base_rent });
          warnings.push('Rooms were recreated as available.');
        }
      }
      d.recycleBin = d.recycleBin.filter((x) => x.id !== id);
      return { item, warnings };
    });
  }

  static async deletePermanently(id, userId) {
    return Drive.mutate((d) => {
      const item = d.recycleBin.find((x) => x.id === id && x.user_id === userId);
      if (!item) throw httpError('Recycle bin item not found');
      d.recycleBin = d.recycleBin.filter((x) => x.id !== id);
      return item;
    });
  }

  static async clearAll(userId) { return Drive.mutate((d) => { d.recycleBin = d.recycleBin.filter((x) => x.user_id !== userId); }); }
  static async clearAllByType(type, userId) { return Drive.mutate((d) => { d.recycleBin = d.recycleBin.filter((x) => !(x.user_id === userId && x.type === type)); }); }

  /** Removes items deleted more than `days` days ago. `days` must be a positive whole number. */
  static async deleteOldItems(userId, days = 15) {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1) throw httpError('days must be a whole number of at least 1');
    return Drive.mutate((d) => {
      const cutoff = Date.now() - n * 86400000;
      const before = d.recycleBin.length;
      d.recycleBin = d.recycleBin.filter((x) => !(x.user_id === userId && new Date(x.deleted_at).getTime() < cutoff));
      return before - d.recycleBin.length;
    });
  }

  static async getCount(userId) { return (await this.getAll(userId)).length; }
  static async getCountByType(type, userId) { return (await this.getAll(userId, type)).length; }
}
module.exports = RecycleBin;
