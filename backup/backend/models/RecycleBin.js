const { query, get, run } = require('../config/database');

class RecycleBin {
    static async addTenant(tenantData) {
        try {
            const { id, name, father_name, cnic, location, description, property_id, room_number, status, profile_pic, documents } = tenantData;
            
            await run(
                `INSERT INTO recycle_bin (id, original_id, type, data, deleted_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [Date.now().toString(36) + Math.random().toString(36).substr(2, 5), id, 'tenant', 
                 JSON.stringify({ name, father_name, cnic, location, description, property_id, room_number, status, profile_pic, documents }),
                 new Date().toISOString()]
            );
        } catch (error) {
            console.error('Error in RecycleBin.addTenant:', error.message);
            throw error;
        }
    }

    static async addProperty(propertyData) {
        try {
            const { id, name, address, total_rooms, base_rent, status, description } = propertyData;
            
            await run(
                `INSERT INTO recycle_bin (id, original_id, type, data, deleted_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [Date.now().toString(36) + Math.random().toString(36).substr(2, 5), id, 'property',
                 JSON.stringify({ name, address, total_rooms, base_rent, status, description }),
                 new Date().toISOString()]
            );
        } catch (error) {
            console.error('Error in RecycleBin.addProperty:', error.message);
            throw error;
        }
    }

    static async getAll(type = null) {
        try {
            let sql = 'SELECT * FROM recycle_bin WHERE 1=1';
            const params = [];
            
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

    static async getById(id) {
        try {
            const result = await get('SELECT * FROM recycle_bin WHERE id = ?', [id]);
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

    static async recover(id) {
        try {
            const item = await this.getById(id);
            if (!item) {
                throw new Error('Item not found in recycle bin');
            }

            if (item.type === 'tenant') {
                // Recover tenant
                const tenantData = item.data;
                await run(
                    `INSERT INTO tenants (id, name, father_name, cnic, location, description, property_id, room_number, status, profile_pic, documents)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [item.original_id, tenantData.name, tenantData.father_name, tenantData.cnic, 
                     tenantData.location, tenantData.description, tenantData.property_id, 
                     tenantData.room_number, tenantData.status, tenantData.profile_pic, 
                     JSON.stringify(tenantData.documents || [])]
                );
            } else if (item.type === 'property') {
                // Recover property
                const propertyData = item.data;
                await run(
                    `INSERT INTO properties (id, name, address, total_rooms, base_rent, status, description)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [item.original_id, propertyData.name, propertyData.address, 
                     propertyData.total_rooms, propertyData.base_rent, 
                     propertyData.status, propertyData.description]
                );
            }

            // Remove from recycle bin
            await run('DELETE FROM recycle_bin WHERE id = ?', [id]);
            return item;
        } catch (error) {
            console.error('Error in RecycleBin.recover:', error.message);
            throw error;
        }
    }

    static async deletePermanently(id) {
        try {
            const item = await this.getById(id);
            await run('DELETE FROM recycle_bin WHERE id = ?', [id]);
            return item;
        } catch (error) {
            console.error('Error in RecycleBin.deletePermanently:', error.message);
            throw error;
        }
    }

    static async clearAll() {
        try {
            await run('DELETE FROM recycle_bin');
        } catch (error) {
            console.error('Error in RecycleBin.clearAll:', error.message);
            throw error;
        }
    }

    static async clearAllByType(type) {
        try {
            await run('DELETE FROM recycle_bin WHERE type = ?', [type]);
        } catch (error) {
            console.error('Error in RecycleBin.clearAllByType:', error.message);
            throw error;
        }
    }

    static async deleteOldItems(days = 15) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            await run(
                'DELETE FROM recycle_bin WHERE deleted_at < ?',
                [cutoffDate.toISOString()]
            );
        } catch (error) {
            console.error('Error in RecycleBin.deleteOldItems:', error.message);
            throw error;
        }
    }

    static async getCount() {
        try {
            const result = await get('SELECT COUNT(*) as count FROM recycle_bin');
            return result ? result.count : 0;
        } catch (error) {
            console.error('Error in RecycleBin.getCount:', error.message);
            throw error;
        }
    }

    static async getCountByType(type) {
        try {
            const result = await get('SELECT COUNT(*) as count FROM recycle_bin WHERE type = ?', [type]);
            return result ? result.count : 0;
        } catch (error) {
            console.error('Error in RecycleBin.getCountByType:', error.message);
            throw error;
        }
    }
}

module.exports = RecycleBin;