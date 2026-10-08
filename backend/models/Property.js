const database = require('../config/database');
const { query, get, run } = database;
const RecycleBin = require('./RecycleBin');

class Property {
    // findById/getRooms/updateRoom/addRoom/removeRoom accept an optional
    // trailing `db` executor so they can participate in a caller's
    // transaction (see Tenant create/update in tenantController.js and the
    // room-resize path in Property.update below). Defaults to the normal
    // pooled connection when omitted, so every existing call site keeps
    // working unchanged.
    static async findAll(userId) {
        try {
            return await query(`
                SELECT p.*, 
                       COUNT(t.id) as tenant_count,
                       (SELECT COUNT(*) FROM rooms r WHERE r.property_id = p.id AND r.status = 'occupied') as occupied_rooms,
                       (SELECT COUNT(*) FROM rooms WHERE property_id = p.id) as total_rooms
                FROM properties p
                LEFT JOIN tenants t ON p.id = t.property_id AND t.status = 'active'
                WHERE p.user_id = ?
                GROUP BY p.id
                ORDER BY p.created_at DESC
            `, [userId]);
        } catch (error) {
            console.error('Error in Property.findAll:', error.message);
            throw error;
        }
    }

    static async findById(id, userId, db = database) {
        try {
            const params = userId ? [id, userId] : [id];
            const userClause = userId ? 'AND p.user_id = ?' : '';
            return await db.get(`
                SELECT p.*,
                       (SELECT COUNT(*) FROM tenants WHERE property_id = p.id AND status = 'active') as tenant_count,
                       (SELECT COUNT(*) FROM rooms WHERE property_id = p.id) as total_rooms
                FROM properties p
                WHERE p.id = ? ${userClause}
            `, params);
        } catch (error) {
            console.error('Error in Property.findById:', error.message);
            throw error;
        }
    }

    static async create(data, userId) {
        try {
            const { id, name, address, totalRooms, baseRent, status, description } = data;
            
            if (!name || !address || !totalRooms || totalRooms < 1) {
                throw new Error('Name, address, and totalRooms (minimum 1) are required');
            }
            
            if (baseRent === undefined || baseRent < 0) {
                throw new Error('Base rent must be a positive number');
            }
            
            await run(
                `INSERT INTO properties (id, user_id, name, address, total_rooms, base_rent, status, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, userId, name, address, totalRooms, baseRent, status || 'active', description || null]
            );
            
            for (let i = 1; i <= totalRooms; i++) {
                await run(
                    'INSERT INTO rooms (property_id, room_number, room_name, status, rent_amount) VALUES (?, ?, ?, ?, ?)',
                    [id, i, `Room ${i}`, 'available', baseRent]
                );
            }
            
            return await this.findById(id, userId);
        } catch (error) {
            console.error('Error in Property.create:', error.message);
            throw error;
        }
    }

    static async update(id, data, userId) {
        try {
            const { name, address, totalRooms, baseRent, status, description } = data;
            
            if (!name || !address || !totalRooms || totalRooms < 1) {
                throw new Error('Name, address, and totalRooms (minimum 1) are required');
            }
            
            if (baseRent === undefined || baseRent < 0) {
                throw new Error('Base rent must be a positive number');
            }
            
            // The room-resize (add/remove rows in `rooms`) and the
            // `properties` row update below must succeed or fail together -
            // otherwise a mid-loop failure (e.g. hitting an occupied room
            // while shrinking) could leave some rooms deleted/added and the
            // property's own total_rooms out of sync with the rooms table.
            return await database.transaction(async (db) => {
                const existing = await this.findById(id, userId, db);
                if (!existing) {
                    throw new Error('Property not found');
                }

                // Get current rooms
                const currentRooms = await this.getRooms(id, db);
                const existingRoomNumbers = currentRooms.map(r => r.room_number);

                // Add new rooms if totalRooms increased
                if (totalRooms > existing.total_rooms) {
                    for (let i = existing.total_rooms + 1; i <= totalRooms; i++) {
                        if (!existingRoomNumbers.includes(i)) {
                            await db.run(
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
                        await db.run(
                            'DELETE FROM rooms WHERE property_id = ? AND room_number = ?',
                            [id, i]
                        );
                    }
                }

                await db.run(
                    `UPDATE properties 
                    SET name = ?, address = ?, total_rooms = ?, base_rent = ?, 
                        status = ?, description = ?
                    WHERE id = ? AND user_id = ?`,
                    [name, address, totalRooms, baseRent, status || 'active', description || null, id, userId]
                );

                return await this.findById(id, userId, db);
            });
        } catch (error) {
            console.error('Error in Property.update:', error.message);
            throw error;
        }
    }

    static async delete(id, userId) {
        try {
            const property = await this.findById(id, userId);
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
            
            const rooms = await this.getRooms(id);
            await RecycleBin.addProperty(property, userId, rooms);
            await run('DELETE FROM properties WHERE id = ? AND user_id = ?', [id, userId]);
            return property;
        } catch (error) {
            console.error('Error in Property.delete:', error.message);
            throw error;
        }
    }

    static async getRooms(propertyId, db = database) {
        try {
            return await db.query(
                'SELECT * FROM rooms WHERE property_id = ? ORDER BY room_number',
                [propertyId]
            );
        } catch (error) {
            console.error('Error in Property.getRooms:', error.message);
            throw error;
        }
    }

    static async updateRoom(propertyId, roomNumber, data, db = database) {
        try {
            const { status, tenantId, rentAmount, roomName } = data;
            
            const validStatuses = ['available', 'occupied', 'maintenance'];
            if (status && !validStatuses.includes(status)) {
                throw new Error('Invalid status. Must be: available, occupied, or maintenance');
            }
            
            const room = await db.get(
                'SELECT * FROM rooms WHERE property_id = ? AND room_number = ?',
                [propertyId, roomNumber]
            );
            
            if (!room) {
                throw new Error('Room not found');
            }
            
            await db.run(
                `UPDATE rooms 
                 SET status = COALESCE(?, status), 
                     tenant_id = ?,
                     rent_amount = COALESCE(?, rent_amount),
                     room_name = COALESCE(?, room_name)
                 WHERE property_id = ? AND room_number = ?`,
                [status, tenantId || null, rentAmount, roomName, propertyId, roomNumber]
            );
            
            return await db.get(
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
            
            const property = await get('SELECT * FROM properties WHERE id = ?', [propertyId]);
            const rent = rentAmount !== null ? rentAmount : (property ? property.base_rent : 0);
            
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
