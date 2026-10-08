const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const Payment = require('../models/Payment');
const { AppError } = require('../middleware/errorHandler');
const { transaction } = require('../config/database');

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

const tenantController = {
    async getAll(req, res, next) {
        try {
            const tenants = await Tenant.findAll(req.userId);
            res.json({
                success: true,
                data: tenants
            });
        } catch (error) {
            next(error);
        }
    },

    async getById(req, res, next) {
        try {
            const { id } = req.params;
            const tenant = await Tenant.findById(id, req.userId);
            
            if (!tenant) {
                throw new AppError('Tenant not found', 404);
            }
            
            res.json({
                success: true,
                data: tenant
            });
        } catch (error) {
            next(error);
        }
    },

    async clearAll(req, res, next) {
        try {
            await transaction(async (db) => {
                const tenants = await Tenant.findAll(req.userId, db);
                for (const tenant of tenants) {
                    if (tenant.property_id && tenant.room_number) {
                        await Property.updateRoom(tenant.property_id, tenant.room_number, { status: 'available', tenantId: null }, db);
                    }
                    await Tenant.delete(tenant.id, req.userId, db);
                }
            });
            res.json({ success: true, message: 'All tenants deleted successfully' });
        } catch (error) {
            next(error);
        }
    },

    async create(req, res, next) {
        try {
            const data = req.body;

            // Keep the tenant insert, room assignment, and initial payment in
            // one transaction. All reads used to validate the room are made
            // through the same transaction connection as the writes.
            const tenant = await transaction(async (db) => {
                const existing = await Tenant.findByCNIC(data.cnic, req.userId, db);
                if (existing) {
                    throw new AppError('CNIC already registered', 400);
                }

                if (!data.propertyId || !data.roomNumber) {
                    throw new AppError('Property and room are required', 400);
                }

                const property = await Property.findById(data.propertyId, req.userId, db);
                if (!property) {
                    throw new AppError('Property not found', 404);
                }

                const roomNumber = parseInt(data.roomNumber, 10);
                if (roomNumber < 1 || roomNumber > property.total_rooms) {
                    throw new AppError(`Room number must be between 1 and ${property.total_rooms}`, 400);
                }

                const rooms = await Property.getRooms(data.propertyId, db);
                const room = rooms.find(r => r.room_number === roomNumber);
                if (!room) {
                    throw new AppError('Room not found in this property', 404);
                }
                if (room.status === 'occupied' && room.tenant_id) {
                    throw new AppError('Room is already occupied', 400);
                }

                const baseRent = Number(room.rent_amount || property.base_rent || 0);
                const created = await Tenant.create({
                    id: generateId(),
                    ...data,
                    roomNumber,
                    documents: data.documents || []
                }, req.userId, db);

                await Property.updateRoom(data.propertyId, roomNumber, {
                    status: 'occupied',
                    tenantId: created.id
                }, db);

                const currentMonth = new Date().getMonth() + 1;
                const currentYear = new Date().getFullYear();
                await Payment.create({
                    id: generateId(),
                    tenantId: created.id,
                    month: currentMonth,
                    year: currentYear,
                    monthlyRent: baseRent,
                    electricity: 0,
                    gas: 0,
                    previousDues: 0,
                    totalPayment: baseRent,
                    amountPaid: 0,
                    customCharges: [],
                    status: 'unpaid',
                    notes: 'Initial payment for new tenant'
                }, req.userId, db);

                return created;
            });

            res.status(201).json({
                success: true,
                data: tenant,
                message: 'Tenant created successfully with initial payment record'
            });
        } catch (error) {
            next(error);
        }
    },

    async update(req, res, next) {
        try {
            const { id } = req.params;
            const data = req.body;

            const tenant = await transaction(async (db) => {
                const existing = await Tenant.findById(id, req.userId, db);
                if (!existing) {
                    throw new AppError('Tenant not found', 404);
                }

                const cnicCheck = await Tenant.findByCNIC(data.cnic, req.userId, db);
                if (cnicCheck && cnicCheck.id !== id) {
                    throw new AppError('CNIC already registered to another tenant', 400);
                }

                const targetPropertyId = data.propertyId || null;
                const targetRoomNumber = data.roomNumber ? parseInt(data.roomNumber, 10) : null;

                if (!targetPropertyId || !targetRoomNumber) {
                    throw new AppError('Property and room are required', 400);
                }

                const property = await Property.findById(targetPropertyId, req.userId, db);
                if (!property) {
                    throw new AppError('Property not found', 404);
                }
                if (targetRoomNumber < 1 || targetRoomNumber > property.total_rooms) {
                    throw new AppError(`Room number must be between 1 and ${property.total_rooms}`, 400);
                }

                const rooms = await Property.getRooms(targetPropertyId, db);
                const targetRoom = rooms.find(r => r.room_number === targetRoomNumber);
                if (!targetRoom) {
                    throw new AppError('Room not found in this property', 404);
                }
                if (targetRoom.status === 'occupied' && targetRoom.tenant_id && targetRoom.tenant_id !== id) {
                    throw new AppError('Room is already occupied by another tenant', 400);
                }

                const sameRoom = existing.property_id === targetPropertyId && Number(existing.room_number) === targetRoomNumber;
                const finalStatus = data.status || existing.status || 'active';

                if (!sameRoom && existing.property_id && existing.room_number) {
                    await Property.updateRoom(existing.property_id, existing.room_number, {
                        status: 'available',
                        tenantId: null
                    }, db);
                }

                if (finalStatus === 'active') {
                    await Property.updateRoom(targetPropertyId, targetRoomNumber, {
                        status: 'occupied',
                        tenantId: id
                    }, db);
                } else {
                    await Property.updateRoom(targetPropertyId, targetRoomNumber, {
                        status: 'available',
                        tenantId: null
                    }, db);
                }

                return await Tenant.update(id, { ...data, status: finalStatus, roomNumber: targetRoomNumber }, req.userId, db);
            });

            res.json({
                success: true,
                data: tenant,
                message: 'Tenant updated successfully'
            });
        } catch (error) {
            next(error);
        }
    },

    async delete(req, res, next) {
        try {
            const { id } = req.params;
            
            const existing = await Tenant.findById(id, req.userId);
            if (!existing) {
                throw new AppError('Tenant not found', 404);
            }
            
            const tenant = await transaction(async (db) => {
                if (existing.property_id && existing.room_number) {
                    await Property.updateRoom(existing.property_id, existing.room_number, {
                        status: 'available',
                        tenantId: null
                    }, db);
                }
                
                return await Tenant.delete(id, req.userId, db);
            });
            
            res.json({
                success: true,
                message: 'Tenant deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    },

    async getByProperty(req, res, next) {
        try {
            const { propertyId } = req.params;
            const tenants = await Tenant.findByProperty(propertyId, req.userId);
            
            res.json({
                success: true,
                data: tenants
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = tenantController;
