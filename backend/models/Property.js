const { query, get, run } = require('../config/database');
const RecycleBin = require('./RecycleBin');

class Property {
    static async findAll() {
        try {
            return await query(`
                SELECT p.*, 
                       COUNT(t.id) as tenant_count,
                       COALESCE(SUM(CASE WHEN t.status = 'active' THEN 1 ELSE 0 END), 0) as occupied_rooms,
                       (SELECT COUNT(*) FROM rooms WHERE property_id = p.id) as total_rooms
                FROM properties p
                LEFT JOIN tenants t ON p.id = t.property_id AND t.status = 'active'
                GROUP BY p.id
                ORDER BY p.created_at DESC
            `);
        } catch (error) {
            console.error('Error in Property.findAll:', error.message);
            throw error;
        }
    }

    static async findById(id) {
        try {
            return await get(`
                SELECT p.*,
                       (SELECT COUNT(*) FROM tenants WHERE property_id = p.id AND status = 'active') as tenant_count,
                       (SELECT COUNT(*) FROM rooms WHERE property_id = p.id) as total_rooms
                FROM properties p
                WHERE p.id = ?
            `, [id]);
        } catch (error) {
            console.error('Error in Property.findById:', error.message);
            throw error;
        }
    }

    static async create(data) {
        try {
            const { id, name, address, totalRooms, baseRent, status, description } = data;
            
            if (!name || !address || !totalRooms || totalRooms < 1) {
                throw new Error('Name, address, and totalRooms (minimum 1) are required');
            }
            
            if (baseRent === undefined || baseRent < 0) {
                throw new Error('Base rent must be a positive number');
            }
            
            await run(
                `INSERT INTO properties (id, name, address, total_rooms, base_rent, status, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, name, address, totalRooms, baseRent, status || 'active', description || null]
            );
            
            for (let i = 1; i <= totalRooms; i++) {
                await run(
                    'INSERT INTO rooms (property_id, room_number, room_name, status, rent_amount) VALUES (?, ?, ?, ?, ?)',
                    [id, i, `Room ${i}`, 'available', baseRent]
                );
            }
            
            return await this.findById(id);
        } catch (error) {
            console.error('Error in Property.create:', error.message);
            throw error;
        }
    }

    static async update(id, data) {
        try {
            const { name, address, totalRooms, baseRent, status, description } = data;
            
            if (!name || !address || !totalRooms || totalRooms < 1) {
                throw new Error('Name, address, and totalRooms (minimum 1) are required');
            }
            
            if (baseRent === undefined || baseRent < 0) {
                throw new Error('Base rent must be a positive number');
            }
            
            const existing = await this.findById(id);
            if (!existing) {
                throw new Error('Property not found');
            }
            
            // Get current rooms
            const currentRooms = await this.getRooms(id);
            const existingRoomNumbers = currentRooms.map(r => r.room_number);
            
            // Add new rooms if totalRooms increased
            if (totalRooms > existing.total_rooms) {
                for (let i = existing.total_rooms + 1; i <= totalRooms; i++) {
                    if (!existingRoomNumbers.includes(i)) {
                        await run(
                            'INSERT INTO rooms (property_id, room_number, room_name, status, rent_amount) VALUES (?, ?, ?, ?, ?)',
                            [id, i, `Room ${i}`, 'available', baseRent]
                        );
                    }
                }
            }
            
            // If totalRooms decreased, remove extra rooms (only if not occupied)
            if (totalRooms < existing.total_rooms) {
                for (let i = totalRooms + 1; i <= existing.total_rooms; i++) {
                    const room = currentRooms.find(r => r.room_number === i);
                    if (room && room.status === 'occupied') {
                        throw new Error(`Cannot remove Room ${i} because it is occupied`);
                    }
                    await run(
                        'DELETE FROM rooms WHERE property_id = ? AND room_number = ?',
                        [id, i]
                    );
                }
            }
            
            await run(
                `UPDATE properties 
                SET name = ?, address = ?, total_rooms = ?, base_rent = ?, 
                    status = ?, description = ?
                WHERE id = ?`,
                [name, address, totalRooms, baseRent, status || 'active', description || null, id]
            );
            
            return await this.findById(id);
        } catch (error) {
            console.error('Error in Property.update:', error.message);
            throw error;
        }
    }

    static async delete(id) {
        try {
            const property = await this.findById(id);
            if (!property) {
                throw new Error('Property not found');
            }
            
            const tenants = await query(
                'SELECT COUNT(*) as count FROM tenants WHERE property_id = ? AND status = ?',
                [id, 'active']
            );
            
            if (tenants[0].count > 0) {
                throw new Error(`Cannot delete property with ${tenants[0].count} active tenants`);
            }
            
            await RecycleBin.addProperty(property);
            await run('DELETE FROM properties WHERE id = ?', [id]);
            return property;
        } catch (error) {
            console.error('Error in Property.delete:', error.message);
            throw error;
        }
    }

    static async getRooms(propertyId) {
        try {
            return await query(
                'SELECT * FROM rooms WHERE property_id = ? ORDER BY room_number',
                [propertyId]
            );
        } catch (error) {
            console.error('Error in Property.getRooms:', error.message);
            throw error;
        }
    }

    static async updateRoom(propertyId, roomNumber, data) {
        try {
            const { status, tenantId, rentAmount, roomName } = data;
            
            const validStatuses = ['available', 'occupied', 'maintenance'];
            if (status && !validStatuses.includes(status)) {
                throw new Error('Invalid status. Must be: available, occupied, or maintenance');
            }
            
            const room = await get(
                'SELECT * FROM rooms WHERE property_id = ? AND room_number = ?',
                [propertyId, roomNumber]
            );
            
            if (!room) {
                throw new Error('Room not found');
            }
            
            await run(
                `UPDATE rooms 
                 SET status = COALESCE(?, status), 
                     tenant_id = ?,
                     rent_amount = COALESCE(?, rent_amount),
                     room_name = COALESCE(?, room_name)
                 WHERE property_id = ? AND room_number = ?`,
                [status, tenantId || null, rentAmount, roomName, propertyId, roomNumber]
            );
            
            return await get(
                'SELECT * FROM rooms WHERE property_id = ? AND room_number = ?',
                [propertyId, roomNumber]
            );
        } catch (error) {
            console.error('Error in Property.updateRoom:', error.message);
            throw error;
        }
    }

    static async addRoom(propertyId, roomNumber, roomName = null, rentAmount = null) {
        try {
            const existing = await get(
                'SELECT * FROM rooms WHERE property_id = ? AND room_number = ?',
                [propertyId, roomNumber]
            );
            
            if (existing) {
                throw new Error('Room number already exists');
            }
            
            const property = await this.findById(propertyId);
            const rent = rentAmount !== null ? rentAmount : property.base_rent;
            
            await run(
                `INSERT INTO rooms (property_id, room_number, room_name, status, rent_amount)
                VALUES (?, ?, ?, ?, ?)`,
                [propertyId, roomNumber, roomName || `Room ${roomNumber}`, 'available', rent]
            );
            
            await run(
                'UPDATE properties SET total_rooms = total_rooms + 1 WHERE id = ?',
                [propertyId]
            );
            
            return await get(
                'SELECT * FROM rooms WHERE property_id = ? AND room_number = ?',
                [propertyId, roomNumber]
            );
        } catch (error) {
            console.error('Error in Property.addRoom:', error.message);
            throw error;
        }
    }

    static async removeRoom(propertyId, roomNumber) {
        try {
            const room = await get(
                'SELECT * FROM rooms WHERE property_id = ? AND room_number = ?',
                [propertyId, roomNumber]
            );
            
            if (!room) {
                throw new Error('Room not found');
            }
            
            if (room.status === 'occupied') {
                throw new Error('Cannot remove occupied room');
            }
            
            await run(
                'DELETE FROM rooms WHERE property_id = ? AND room_number = ?',
                [propertyId, roomNumber]
            );
            
            await run(
                'UPDATE properties SET total_rooms = total_rooms - 1 WHERE id = ?',
                [propertyId]
            );
            
            return room;
        } catch (error) {
            console.error('Error in Property.removeRoom:', error.message);
            throw error;
        }
    }
}

module.exports = Property;