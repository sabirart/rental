'use strict';
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const Payment = require('../models/Payment');
const UserSettings = require('../models/UserSettings');
const Drive = require('../services/driveStore');
const { AppError } = require('../middleware/errorHandler');
const { newId } = require('../utils/id');

/** Resolves a property + room that really exist (room NUMBERS, not a count). */
async function resolveRoom(propertyId, roomNumber, userId) {
  const property = await Property.findById(propertyId, userId);
  if (!property) throw new AppError('Property not found', 404);
  const room = (await Property.getRooms(propertyId, userId)).find((r) => Number(r.room_number) === Number(roomNumber));
  if (!room) throw new AppError(`Room ${roomNumber} does not exist in this property`, 404);
  return { property, room };
}

const tenantController = {
  async getAll(req, res, next) {
    try { res.json({ success: true, data: await Tenant.findAll(req.userId) }); } catch (e) { next(e); }
  },
  async getById(req, res, next) {
    try {
      const tenant = await Tenant.findById(req.params.id, req.userId);
      if (!tenant) throw new AppError('Tenant not found', 404);
      res.json({ success: true, data: tenant });
    } catch (e) { next(e); }
  },

  /** Archives every tenant (and their payments) into the recycle bin in one atomic write. */
  async clearAll(req, res, next) {
    try {
      await Drive.transaction(async () => {
        for (const tenant of await Tenant.findAll(req.userId)) await Tenant.delete(tenant.id, req.userId);
      });
      res.json({ success: true, message: 'All tenants deleted successfully' });
    } catch (e) { next(e); }
  },

  async create(req, res, next) {
    try {
      const data = req.body;
      // Tenant, room assignment and first payment commit together or not at all.
      const tenant = await Drive.transaction(async () => {
        if (await Tenant.findByCNIC(data.cnic, req.userId)) throw new AppError('CNIC already registered', 400);
        const status = data.status || 'active';
        const { property, room } = await resolveRoom(data.propertyId, data.roomNumber, req.userId);
        if (status === 'active' && room.status === 'occupied' && room.tenant_id) throw new AppError('Room is already occupied', 400);

        const created = await Tenant.create({ ...data, status, roomNumber: Number(data.roomNumber), id: newId() }, req.userId);
        if (status === 'active') {
          const d = await Drive.getData();
          const { month, year } = UserSettings.periodFor(d);
          const rent = Number(room.rent_amount || property.base_rent || 0);
          await Payment.create({
            tenantId: created.id, month, year, monthlyRent: rent, electricity: 0, gas: 0, previousDues: 0,
            amountPaid: 0, customCharges: [], notes: 'Initial payment for new tenant'
          }, req.userId);
        }
        return created;
      });
      res.status(201).json({ success: true, data: tenant, message: 'Tenant created successfully with initial payment record' });
    } catch (e) { next(e); }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.body;
      const tenant = await Drive.transaction(async () => {
        const existing = await Tenant.findById(id, req.userId);
        if (!existing) throw new AppError('Tenant not found', 404);
        const cnicOwner = await Tenant.findByCNIC(data.cnic, req.userId);
        if (cnicOwner && cnicOwner.id !== id) throw new AppError('CNIC already registered to another tenant', 400);

        const finalStatus = data.status || existing.status || 'active';
        const { room } = await resolveRoom(data.propertyId, data.roomNumber, req.userId);
        // Only an ACTIVE tenant needs the room to be free; an inactive tenant just keeps a historical reference.
        if (finalStatus === 'active' && room.status === 'occupied' && room.tenant_id && room.tenant_id !== id) {
          throw new AppError('Room is already occupied by another tenant', 400);
        }
        return Tenant.update(id, { ...data, status: finalStatus, roomNumber: Number(data.roomNumber) }, req.userId);
      });
      res.json({ success: true, data: tenant, message: 'Tenant updated successfully' });
    } catch (e) { next(e); }
  },

  async delete(req, res, next) {
    try {
      await Tenant.delete(req.params.id, req.userId);
      res.json({ success: true, message: 'Tenant deleted successfully' });
    } catch (e) { next(e); }
  },

  async getByProperty(req, res, next) {
    try { res.json({ success: true, data: await Tenant.findByProperty(req.params.propertyId, req.userId) }); } catch (e) { next(e); }
  }
};
module.exports = tenantController;
