const database = require('../config/database');
const { query, get, run, transaction } = database;

class RecycleBin {
    static async addTenant(tenantData, userId, db = database) {
        try {
            const { id, name, father_name, cnic, location, description, property_id, room_number, status, profile_pic, documents, mobile_number, advance_payment, lease_end_date } = tenantData;
            
            await db.run(
                `INSERT INTO recycle_bin (id, user_id, original_id, type, data, deleted_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [Date.now().toString(36) + Math.random().toString(36).substr(2, 5), userId, id, 'tenant', 
                 JSON.stringify({ name, father_name, cnic, location, description, property_id, room_number, status, profile_pic, documents, mobile_number, advance_payment, lease_end_date }),
                 new Date().toISOString()]
            );
        } catch (error) {
            console.error('Error in RecycleBin.addTenant:', error.message);
            throw error;
        }
    }

    // `rooms` is an optional snapshot of the property's rooms at the moment
    // of deletion (each { room_number, room_name, status, rent_amount };
    // tenant_id is deliberately NOT carried over - a recovered property's
    // rooms always come back "available", since the tenant(s) that once
    // occupied them are recovered/reassigned independently). Without this,
    // recovering a deleted property brought the property row back but not
    // its rooms (they're cascade-deleted with the property), silently
    // losing all room data.
    static async addProperty(propertyData, userId, rooms = []) {
        try {
            const { id, name, address, total_rooms, base_rent, status, description } = propertyData;
            const roomsSnapshot = (rooms || []).map(r => ({
                room_number: r.room_number,
                room_name: r.room_name,
                status: r.status === 'occupied' ? 'available' : r.status, // never restore as pre-occupied; occupancy is re-derived from tenant recovery
                rent_amount: r.rent_amount
            }));
            
            await run(
                `INSERT INTO recycle_bin (id, user_id, original_id, type, data, deleted_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [Date.now().toString(36) + Math.random().toString(36).substr(2, 5), userId, id, 'property',
                 JSON.stringify({ name, address, total_rooms, base_rent, status, description, rooms: roomsSnapshot }),
                 new Date().toISOString()]
            );
        } catch (error) {
            console.error('Error in RecycleBin.addProperty:', error.message);
            throw error;
        }
    }

    static async getAll(userId, type = null) {
        try {
            let sql = 'SELECT * FROM recycle_bin WHERE user_id = ?';
            const params = [userId];
            
            if (type) {
                sql += ' AND type = ?';
                params.push(type);
            }
            
            sql += ' ORDER BY deleted_at DESC';
            
            const results = await query(sql, params);
            return results.map(item => {
                try {
                    item.data = JSON.parse(item.data);
                } catch (e) {
                    item.data = {};
                }
                return item;
            });
        } catch (error) {
            console.error('Error in RecycleBin.getAll:', error.message);
            throw error;
        }
    }

    static async getById(id, userId, db = database) {
        try {
            const params = userId ? [id, userId] : [id];
            const userClause = userId ? 'AND user_id = ?' : '';
            const result = await db.get(`SELECT * FROM recycle_bin WHERE id = ? ${userClause}`, params);
            if (result && result.data) {
                try {
                    result.data = JSON.parse(result.data);
                } catch (e) {
                    result.data = {};
                }
            }
            return result;
        } catch (error) {
            console.error('Error in RecycleBin.getById:', error.message);
            throw error;
        }
    }

    // Recovers a soft-deleted tenant or property. Everything below runs in a
    // single transaction so the recycle_bin row is only removed once the
    // recovered row (and, for tenants, the matching room state) has actually
    // been written - a failure partway through leaves the original
    // recycle_bin entry intact instead of losing the data.
    //
    // Returns { item, warnings } - `warnings` is a list of human-readable
    // strings describing anything that couldn't be fully restored (e.g. the
    // original room was reassigned to someone else in the meantime), so the
    // caller can surface that to the landlord instead of silently
    // reassigning/overwriting another tenant's room.
    static async recover(id, userId) {
        try {
            return await transaction(async (db) => {
                const item = await this.getById(id, userId, db);
                if (!item) {
                    throw new Error('Item not found in recycle bin');
                }

                const warnings = [];

                if (item.type === 'tenant') {
                    const tenantData = item.data;

                    // CNIC must still be unique for this landlord. Unlike a
                    // room conflict, a CNIC conflict is identity data we
                    // cannot safely alter or drop - so recovery is blocked
                    // outright rather than silently changing it.
                    const cnicConflict = await db.get(
                        'SELECT id, name FROM tenants WHERE cnic = ? AND user_id = ?',
                        [tenantData.cnic, userId]
                    );
                    if (cnicConflict) {
                        throw new Error(`Cannot recover: a tenant named "${cnicConflict.name}" already has this CNIC. Resolve that conflict before recovering.`);
                    }

                    let propertyId = tenantData.property_id;
                    let roomNumber = tenantData.room_number;
                    let room = null;

                    if (propertyId) {
                        const property = await db.get(
                            'SELECT * FROM properties WHERE id = ? AND user_id = ?',
                            [propertyId, userId]
                        );
                        if (!property) {
                            warnings.push('The property this tenant was assigned to no longer exists, so the room assignment was cleared.');
                            propertyId = null;
                            roomNumber = null;
                        } else {
                            room = await db.get(
                                'SELECT * FROM rooms WHERE property_id = ? AND room_number = ?',
                                [propertyId, roomNumber]
                            );
                            if (!room) {
                                warnings.push('The original room no longer exists, so the room assignment was cleared.');
                                propertyId = null;
                                roomNumber = null;
                            } else if (room.status === 'occupied' && room.tenant_id && room.tenant_id !== item.original_id) {
                                warnings.push('The original room is now occupied by another tenant, so this tenant was recovered without a room assignment. Reassign them to a room manually.');
                                propertyId = null;
                                roomNumber = null;
                                room = null;
                            }
                        }
                    }

                    await db.run(
                        `INSERT INTO tenants (id, user_id, name, father_name, cnic, location, description, property_id, room_number, status, profile_pic, documents, mobile_number, advance_payment, lease_end_date)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [item.original_id, userId, tenantData.name, tenantData.father_name, tenantData.cnic,
                         tenantData.location, tenantData.description, propertyId, roomNumber,
                         tenantData.status, tenantData.profile_pic,
                         JSON.stringify(tenantData.documents || []), tenantData.mobile_number || null, tenantData.advance_payment || 0, tenantData.lease_end_date || null]
                    );

                    // Keep the rooms table in sync with the recovered tenant
                    // - this is the step the old recovery path skipped
                    // entirely, which is what let a room look "available"
                    // while an active tenant was actually assigned to it.
                    if (propertyId && roomNumber && room) {
                        await db.run(
                            `UPDATE rooms SET status = 'occupied', tenant_id = ? WHERE property_id = ? AND room_number = ?`,
                            [item.original_id, propertyId, roomNumber]
                        );
                    }
                } else if (item.type === 'property') {
                    const propertyData = item.data;
                    await db.run(
                        `INSERT INTO properties (id, user_id, name, address, total_rooms, base_rent, status, description)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [item.original_id, userId, propertyData.name, propertyData.address,
                         propertyData.total_rooms, propertyData.base_rent,
                         propertyData.status, propertyData.description]
                    );

                    const rooms = Array.isArray(propertyData.rooms) ? propertyData.rooms : [];
                    for (const r of rooms) {
                        await db.run(
                            `INSERT INTO rooms (property_id, room_number, room_name, status, rent_amount) VALUES (?, ?, ?, ?, ?)`,
                            [item.original_id, r.room_number, r.room_name, r.status || 'available', r.rent_amount]
                        );
                    }
                    if (rooms.length === 0 && propertyData.total_rooms) {
                        // Very old recycle_bin entries (deleted before rooms
                        // were snapshotted) won't have a rooms array - fall
                        // back to regenerating plain available rooms so the
                        // property isn't recovered with zero rooms.
                        for (let i = 1; i <= propertyData.total_rooms; i++) {
                            await db.run(
                                `INSERT INTO rooms (property_id, room_number, room_name, status, rent_amount) VALUES (?, ?, ?, ?, ?)`,
                                [item.original_id, i, `Room ${i}`, 'available', propertyData.base_rent]
                            );
                        }
                        warnings.push('This property was deleted before room details were saved, so its rooms were recreated as available.');
                    }
                }

                await db.run('DELETE FROM recycle_bin WHERE id = ? AND user_id = ?', [id, userId]);
                return { item, warnings };
            });
        } catch (error) {
            console.error('Error in RecycleBin.recover:', error.message);
            throw error;
        }
    }

    static async deletePermanently(id, userId) {
        try {
            const item = await this.getById(id, userId);
            await run('DELETE FROM recycle_bin WHERE id = ? AND user_id = ?', [id, userId]);
            return item;
        } catch (error) {
            console.error('Error in RecycleBin.deletePermanently:', error.message);
            throw error;
        }
    }

    static async clearAll(userId) {
        try {
            await run('DELETE FROM recycle_bin WHERE user_id = ?', [userId]);
        } catch (error) {
            console.error('Error in RecycleBin.clearAll:', error.message);
            throw error;
        }
    }

    static async clearAllByType(type, userId) {
        try {
            await run('DELETE FROM recycle_bin WHERE type = ? AND user_id = ?', [type, userId]);
        } catch (error) {
            console.error('Error in RecycleBin.clearAllByType:', error.message);
            throw error;
        }
    }

    static async deleteOldItems(userId, days = 15) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            await run(
                'DELETE FROM recycle_bin WHERE deleted_at < ? AND user_id = ?',
                [cutoffDate.toISOString(), userId]
            );
        } catch (error) {
            console.error('Error in RecycleBin.deleteOldItems:', error.message);
            throw error;
        }
    }

    static async getCount(userId) {
        try {
            const result = await get('SELECT COUNT(*) as count FROM recycle_bin WHERE user_id = ?', [userId]);
            return result ? result.count : 0;
        } catch (error) {
            console.error('Error in RecycleBin.getCount:', error.message);
            throw error;
        }
    }

    static async getCountByType(type, userId) {
        try {
            const result = await get('SELECT COUNT(*) as count FROM recycle_bin WHERE type = ? AND user_id = ?', [type, userId]);
            return result ? result.count : 0;
        } catch (error) {
            console.error('Error in RecycleBin.getCountByType:', error.message);
            throw error;
        }
    }
}

module.exports = RecycleBin;
