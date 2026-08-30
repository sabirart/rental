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
            const tenants = await Tenant.findAll(req.userId);
            
            for (const tenant of tenants) {
                if (tenant.property_id && tenant.room_number) {
                    await Property.updateRoom(tenant.property_id, tenant.room_number, {
                        status: 'available',
                        tenantId: null
                    });
                }
            }
            
            await Tenant.clearAll(req.userId);
            
            res.json({
                success: true,
                message: 'All tenants deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    },

    async create(req, res, next) {
        try {
            const data = req.body;
            
            // Cheap up-front checks (read-only) so obviously-bad requests get a
            // fast, specific error without opening a transaction at all. The
            // authoritative checks that actually gate the writes happen again
            // inside the transaction below, against the same connection that
            // performs the insert, so a race between two concurrent requests
            // can't slip both past this pre-check and then both succeed.
            const existing = await Tenant.findByCNIC(data.cnic, req.userId);
            if (existing) {
                throw new AppError('CNIC already registered', 400);
            }
            
            let baseRent = 0;
            let roomExists = false;
            
            // Validate property and room
            if (data.propertyId && data.roomNumber) {
                const property = await Property.findById(data.propertyId, req.userId);
                if (!property) {
                    throw new AppError('Property not found', 404);
                }
                
                if (data.roomNumber < 1 || data.roomNumber > property.total_rooms) {
                    throw new AppError(`Room number must be between 1 and ${property.total_rooms}`, 400);
                }
                
                const rooms = await Property.getRooms(data.propertyId);
                const room = rooms.find(r => r.room_number === parseInt(data.roomNumber));
                
                if (!room) {
                    throw new AppError('Room not found in this property', 404);
                }
                
                // Check if room is occupied by a DIFFERENT tenant
                if (room.status === 'occupied' && room.tenant_id) {
                    throw new AppError('Room is already occupied', 400);
                }
                
                roomExists = true;
                baseRent = room.rent_amount || property.base_rent || 0;
            }
            
            // Tenant creation + room assignment + the initial payment record
            // must all succeed together - if any step fails, none of them
            // should be left behind (e.g. a tenant without a payment record,
            // or a room marked occupied with no tenant actually saved).
            const tenant = await transaction(async (db) => {
                const created = await Tenant.create({
                    id: generateId(),
                    ...data,
                    documents: data.documents || []
                }, req.userId, db);

                if (data.propertyId && data.roomNumber && roomExists) {
                    await Property.updateRoom(data.propertyId, data.roomNumber, {
                        status: 'occupied',
                        tenantId: created.id
                    }, db);
                }

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
            
            const existing = await Tenant.findById(id, req.userId);
            if (!existing) {
                throw new AppError('Tenant not found', 404);
            }
            
            const cnicCheck = await Tenant.findByCNIC(data.cnic, req.userId);
            if (cnicCheck && cnicCheck.id !== id) {
                throw new AppError('CNIC already registered to another tenant', 400);
            }
            
            let targetPropertyId = null;
            let targetRoomNumber = null;
            let releaseOldRoom = false;
            
            if (data.propertyId && data.roomNumber) {
                const property = await Property.findById(data.propertyId, req.userId);
                if (!property) {
                    throw new AppError('Property not found', 404);
                }
                
                if (data.roomNumber < 1 || data.roomNumber > property.total_rooms) {
                    throw new AppError(`Room number must be between 1 and ${property.total_rooms}`, 400);
                }
                
                const rooms = await Property.getRooms(data.propertyId);
                const room = rooms.find(r => r.room_number === parseInt(data.roomNumber));
                
                if (!room) {
                    throw new AppError('Room not found in this property', 404);
                }
                
                if (room.status === 'occupied' && room.tenant_id && room.tenant_id !== id) {
                    throw new AppError('Room is already occupied by another tenant', 400);
                }
                
                targetPropertyId = data.propertyId;
                targetRoomNumber = data.roomNumber;
                releaseOldRoom = existing.property_id && existing.room_number !== data.roomNumber;
            } else {
                releaseOldRoom = !!(existing.property_id && existing.room_number);
            }
            
            // Releasing the old room, assigning the new one, and saving the
            // tenant row all need to succeed together - otherwise a failure
            // partway through could leave a room marked available/occupied
            // in a way that no longer matches what's actually saved on the
            // tenant record.
            const tenant = await transaction(async (db) => {
                if (releaseOldRoom) {
                    await Property.updateRoom(existing.property_id, existing.room_number, {
                        status: 'available',
                        tenantId: null
                    }, db);
                }
                
                if (targetPropertyId && targetRoomNumber) {
                    await Property.updateRoom(targetPropertyId, targetRoomNumber, {
                        status: 'occupied',
                        tenantId: id
                    }, db);
                }
                
                return await Tenant.update(id, data, req.userId, db);
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
