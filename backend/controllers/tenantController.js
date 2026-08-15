const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const Payment = require('../models/Payment');
const { AppError } = require('../middleware/errorHandler');

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

const tenantController = {
    async getAll(req, res, next) {
        try {
            const tenants = await Tenant.findAll();
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
            const tenant = await Tenant.findById(id);
            
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
            const tenants = await Tenant.findAll();
            
            for (const tenant of tenants) {
                if (tenant.property_id && tenant.room_number) {
                    await Property.updateRoom(tenant.property_id, tenant.room_number, {
                        status: 'available',
                        tenantId: null
                    });
                }
            }
            
            await Tenant.clearAll();
            
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
            
            // Check CNIC uniqueness
            const existing = await Tenant.findByCNIC(data.cnic);
            if (existing) {
                throw new AppError('CNIC already registered', 400);
            }
            
            let baseRent = 0;
            let roomExists = false;
            
            // Validate property and room
            if (data.propertyId && data.roomNumber) {
                const property = await Property.findById(data.propertyId);
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
                baseRent = property.base_rent || 0;
            }
            
            // Create tenant
            const tenant = await Tenant.create({
                id: generateId(),
                ...data,
                documents: data.documents || []
            });
            
            // Update room status
            if (data.propertyId && data.roomNumber && roomExists) {
                await Property.updateRoom(data.propertyId, data.roomNumber, {
                    status: 'occupied',
                    tenantId: tenant.id
                });
            }
            
            // Create initial payment for current month
            const currentMonth = new Date().getMonth() + 1;
            const currentYear = new Date().getFullYear();
            
            await Payment.create({
                id: generateId(),
                tenantId: tenant.id,
                month: currentMonth,
                year: currentYear,
                monthlyRent: baseRent,
                electricity: 0,
                gas: 0,
                previousDues: 0,
                totalPayment: baseRent,
                customCharges: [],
                status: 'unpaid',
                notes: 'Initial payment for new tenant'
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
            
            const existing = await Tenant.findById(id);
            if (!existing) {
                throw new AppError('Tenant not found', 404);
            }
            
            const cnicCheck = await Tenant.findByCNIC(data.cnic);
            if (cnicCheck && cnicCheck.id !== id) {
                throw new AppError('CNIC already registered to another tenant', 400);
            }
            
            if (data.propertyId && data.roomNumber) {
                const property = await Property.findById(data.propertyId);
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
                
                if (existing.property_id && existing.room_number !== data.roomNumber) {
                    await Property.updateRoom(existing.property_id, existing.room_number, {
                        status: 'available',
                        tenantId: null
                    });
                }
                
                await Property.updateRoom(data.propertyId, data.roomNumber, {
                    status: 'occupied',
                    tenantId: id
                });
            } else {
                if (existing.property_id && existing.room_number) {
                    await Property.updateRoom(existing.property_id, existing.room_number, {
                        status: 'available',
                        tenantId: null
                    });
                }
            }
            
            const tenant = await Tenant.update(id, data);
            
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
            
            const existing = await Tenant.findById(id);
            if (!existing) {
                throw new AppError('Tenant not found', 404);
            }
            
            if (existing.property_id && existing.room_number) {
                await Property.updateRoom(existing.property_id, existing.room_number, {
                    status: 'available',
                    tenantId: null
                });
            }
            
            await Tenant.delete(id);
            
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
            const tenants = await Tenant.findByProperty(propertyId);
            
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