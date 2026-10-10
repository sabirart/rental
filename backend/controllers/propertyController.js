'use strict';
const Property = require('../models/Property');
const Tenant = require('../models/Tenant');
const { AppError } = require('../middleware/errorHandler');
const { newId } = require('../utils/id');
const Drive = require('../services/driveStore');

const roomParam = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw new AppError('Invalid room number', 400);
  return n;
};

const propertyController = {
  async getAll(req, res, next) {
    try { res.json({ success: true, data: await Property.findAll(req.userId) }); } catch (e) { next(e); }
  },
  async getById(req, res, next) {
    try {
      const property = await Property.findById(req.params.id, req.userId);
      if (!property) throw new AppError('Property not found', 404);
      res.json({ success: true, data: property });
    } catch (e) { next(e); }
  },
  async create(req, res, next) {
    try {
      // The id is always generated here; a client-supplied id is ignored.
      const property = await Property.create({ ...req.body, id: newId() }, req.userId);
      res.status(201).json({ success: true, data: property, message: 'Property created successfully' });
    } catch (e) { next(e); }
  },
  async update(req, res, next) {
    try {
      const property = await Property.update(req.params.id, req.body, req.userId);
      res.json({ success: true, data: property, message: 'Property updated successfully' });
    } catch (e) { next(e); }
  },
  async delete(req, res, next) {
    try {
      await Property.delete(req.params.id, req.userId);
      res.json({ success: true, message: 'Property deleted successfully' });
    } catch (e) { next(e); }
  },
  async getRooms(req, res, next) {
    try {
      const property = await Property.findById(req.params.id, req.userId);
      if (!property) throw new AppError('Property not found', 404);
      res.json({ success: true, data: await Property.getRooms(req.params.id, req.userId) });
    } catch (e) { next(e); }
  },
  async updateRoom(req, res, next) {
    try {
      const { id } = req.params;
      const roomNum = roomParam(req.params.roomNumber);
      const { status, tenantId, rentAmount, roomName } = req.body;
      if (!(await Property.findById(id, req.userId))) throw new AppError('Property not found', 404);
      if (tenantId && status === 'occupied') {
        const tenant = await Tenant.findById(tenantId, req.userId);
        if (!tenant) throw new AppError('Tenant not found', 404);
        if (tenant.status !== 'active') throw new AppError('Tenant must be active to assign to room', 400);
      }
      // Only forward what the client actually sent so a name/rent edit never unlinks the tenant.
      const patch = {};
      if (status !== undefined) patch.status = status;
      if (tenantId !== undefined) patch.tenantId = tenantId;
      if (rentAmount !== undefined) patch.rentAmount = rentAmount;
      if (roomName !== undefined) patch.roomName = roomName;
      const room = await Property.updateRoom(id, roomNum, patch, req.userId);
      res.json({ success: true, data: room, message: 'Room updated successfully' });
    } catch (e) { next(e); }
  },
  async addRoom(req, res, next) {
    try {
      const { roomNumber, roomName, rentAmount } = req.body;
      if (!(await Property.findById(req.params.id, req.userId))) throw new AppError('Property not found', 404);
      const room = await Property.addRoom(req.params.id, roomParam(roomNumber), roomName, rentAmount, req.userId);
      res.status(201).json({ success: true, data: room, message: 'Room added successfully' });
    } catch (e) { next(e); }
  },
  async removeRoom(req, res, next) {
    try {
      const room = await Property.removeRoom(req.params.id, roomParam(req.params.roomNumber), req.userId);
      res.json({ success: true, data: room, message: 'Room removed successfully' });
    } catch (e) { next(e); }
  },
  /** Archives every property (recoverable from the recycle bin). */
  async clearAll(req, res, next) {
    try {
      await Drive.transaction(async () => {
        for (const property of await Property.findAll(req.userId)) await Property.delete(property.id, req.userId);
      });
      res.json({ success: true, message: 'All properties cleared successfully' });
    } catch (e) { next(e); }
  }
};
module.exports = propertyController;
