const { query, get, run } = require('../config/database');

class RecycleBin {
    static async addTenant(tenantData, userId) {
        try {
            const { id, name, father_name, cnic, location, description, property_id, room_number, status, profile_pic, documents, mobile_number, advance_payment, lease_end_date } = tenantData;
            
            await run(
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

    static async addProperty(propertyData, userId) {
        try {
            const { id, name, address, total_rooms, base_rent, status, description } = propertyData;
            
            await run(
                `INSERT INTO recycle_bin (id, user_id, original_id, type, data, deleted_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [Date.now().toString(36) + Math.random().toString(36).substr(2, 5), userId, id, 'property',
                 JSON.stringify({ name, address, total_rooms, base_rent, status, description }),
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

    static async getById(id, userId) {
        try {
            const params = userId ? [id, userId] : [id];
            const userClause = userId ? 'AND user_id = ?' : '';
            const result = await get(`SELECT * FROM recycle_bin WHERE id = ? ${userClause}`, params);
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

    static async recover(id, userId) {
        try {
            const item = await this.getById(id, userId);
            if (!item) {
                throw new Error('Item not found in recycle bin');
            }

            if (item.type === 'tenant') {
                const tenantData = item.data;
                await run(
                    `INSERT INTO tenants (id, user_id, name, father_name, cnic, location, description, property_id, room_number, status, profile_pic, documents, mobile_number, advance_payment, lease_end_date)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [item.original_id, userId, tenantData.name, tenantData.father_name, tenantData.cnic, 
                     tenantData.location, tenantData.description, tenantData.property_id, 
                     tenantData.room_number, tenantData.status, tenantData.profile_pic, 
                     JSON.stringify(tenantData.documents || []), tenantData.mobile_number || null, tenantData.advance_payment || 0, tenantData.lease_end_date || null]
                );
            } else if (item.type === 'property') {
                const propertyData = item.data;
                await run(
                    `INSERT INTO properties (id, user_id, name, address, total_rooms, base_rent, status, description)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [item.original_id, userId, propertyData.name, propertyData.address, 
                     propertyData.total_rooms, propertyData.base_rent, 
                     propertyData.status, propertyData.description]
                );
            }

            await run('DELETE FROM recycle_bin WHERE id = ? AND user_id = ?', [id, userId]);
            return item;
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
