const Property = require('../models/Property');
const Tenant = require('../models/Tenant');
const { AppError } = require('../middleware/errorHandler');

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

const propertyController = {
    async getAll(req, res, next) {
        try {
            const properties = await Property.findAll();
            res.json({ success: true, data: properties });
        } catch (error) {
            next(error);
        }
    },

    async getById(req, res, next) {
        try {
            const { id } = req.params;
            const property = await Property.findById(id);
            if (!property) throw new AppError('Property not found', 404);
            res.json({ success: true, data: property });
        } catch (error) {
            next(error);
        }
    },

    async create(req, res, next) {
        try {
            const data = req.body;
            if (!data.name || !data.address) throw new AppError('Name and address are required', 400);
            if (!data.totalRooms || data.totalRooms < 1) throw new AppError('Total rooms must be at least 1', 400);
            if (data.baseRent === undefined || data.baseRent < 0) throw new AppError('Base rent must be a positive number', 400);
            
            const property = await Property.create({ id: generateId(), ...data });
            res.status(201).json({ success: true, data: property, message: 'Property created successfully' });
        } catch (error) {
            next(error);
        }
    },

    async update(req, res, next) {
        try {
            const { id } = req.params;
            const data = req.body;
            
            const existing = await Property.findById(id);
            if (!existing) throw new AppError('Property not found', 404);
            if (!data.name || !data.address) throw new AppError('Name and address are required', 400);
            if (!data.totalRooms || data.totalRooms < 1) throw new AppError('Total rooms must be at least 1', 400);
            if (data.baseRent === undefined || data.baseRent < 0) throw new AppError('Base rent must be a positive number', 400);
            
            const property = await Property.update(id, data);
            res.json({ success: true, data: property, message: 'Property updated successfully' });
        } catch (error) {
            next(error);
        }
    },

    async delete(req, res, next) {
        try {
            const { id } = req.params;
            const existing = await Property.findById(id);
            if (!existing) throw new AppError('Property not found', 404);
            
            const tenants = await Tenant.findByProperty(id);
            const activeTenants = tenants.filter(t => t.status === 'active');
            if (activeTenants.length > 0) {
                throw new AppError(`Cannot delete property with ${activeTenants.length} active tenants`, 400);
            }
            
            await Property.delete(id);
            res.json({ success: true, message: 'Property deleted successfully' });
        } catch (error) {
            next(error);
        }
    },

    async getRooms(req, res, next) {
        try {
            const { id } = req.params;
            const property = await Property.findById(id);
            if (!property) throw new AppError('Property not found', 404);
            
            const rooms = await Property.getRooms(id);
            res.json({ success: true, data: rooms });
        } catch (error) {
            next(error);
        }
    },

    async updateRoom(req, res, next) {
        try {
            const { id, roomNumber } = req.params;
            const { status, tenantId, rentAmount, roomName } = req.body;
            
            const property = await Property.findById(id);
            if (!property) throw new AppError('Property not found', 404);
            
            const roomNum = parseInt(roomNumber);
            if (isNaN(roomNum) || roomNum < 1) throw new AppError('Invalid room number', 400);
            
            const rooms = await Property.getRooms(id);
            const room = rooms.find(r => r.room_number === roomNum);
            if (!room) throw new AppError('Room not found', 404);
            
            const validStatuses = ['available', 'occupied', 'maintenance'];
            if (status && !validStatuses.includes(status)) {
                throw new AppError('Invalid status. Must be: available, occupied, or maintenance', 400);
            }
            
            if (tenantId && status === 'occupied') {
                const tenant = await Tenant.findById(tenantId);
                if (!tenant) throw new AppError('Tenant not found', 404);
                if (tenant.status !== 'active') throw new AppError('Tenant must be active to assign to room', 400);
            }
            
            if (rentAmount !== undefined && rentAmount < 0) {
                throw new AppError('Rent amount must be a positive number', 400);
            }
            
            const updatedRoom = await Property.updateRoom(id, roomNum, {
                status: status || room.status,
                tenantId: tenantId || null,
                rentAmount: rentAmount,
                roomName: roomName
            });
            
            res.json({ success: true, data: updatedRoom, message: 'Room updated successfully' });
        } catch (error) {
            next(error);
        }
    },

    async addRoom(req, res, next) {
        try {
            const { id } = req.params;
            const { roomNumber, roomName, rentAmount } = req.body;
            
            const property = await Property.findById(id);
            if (!property) throw new AppError('Property not found', 404);
            
            const roomNum = parseInt(roomNumber);
            if (isNaN(roomNum) || roomNum < 1) throw new AppError('Invalid room number. Must be a positive integer.', 400);
            
            const rooms = await Property.getRooms(id);
            if (rooms.some(r => r.room_number === roomNum)) {
                throw new AppError(`Room ${roomNum} already exists`, 400);
            }
            
            const room = await Property.addRoom(id, roomNum, roomName, rentAmount);
            res.status(201).json({ success: true, data: room, message: 'Room added successfully' });
        } catch (error) {
            next(error);
        }
    },

    async removeRoom(req, res, next) {
        try {
            const { id, roomNumber } = req.params;
            
            const property = await Property.findById(id);
            if (!property) throw new AppError('Property not found', 404);
            
            const roomNum = parseInt(roomNumber);
            if (isNaN(roomNum) || roomNum < 1) throw new AppError('Invalid room number', 400);
            
            const room = await Property.removeRoom(id, roomNum);
            res.json({ success: true, data: room, message: 'Room removed successfully' });
        } catch (error) {
            next(error);
        }
    },

    async clearAll(req, res, next) {
        try {
            const properties = await Property.findAll();
            for (const property of properties) {
                await Property.delete(property.id);
            }
            res.json({ success: true, message: 'All properties cleared successfully' });
        } catch (error) {
            next(error);
        }
    },
};

module.exports = propertyController;