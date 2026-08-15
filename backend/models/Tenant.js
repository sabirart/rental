// backend/models/Tenant.js (FIXED - Safe JSON parsing, error handling)

const { query, get, run } = require('../config/database');
const RecycleBin = require('./RecycleBin');

class Tenant {
    static async findAll() {
        try {
            const results = await query(`
                SELECT t.*, p.name as property_name, p.address as property_address
                FROM tenants t
                LEFT JOIN properties p ON t.property_id = p.id
                ORDER BY t.created_at DESC
            `);
            
            // FIXED: Safe JSON parsing with error handling
            return results.map(result => {
                if (result.documents) {
                    try {
                        result.documents = JSON.parse(result.documents);
                    } catch (e) {
                        console.error('Error parsing documents for tenant:', result.id, e.message);
                        result.documents = [];
                    }
                } else {
                    result.documents = [];
                }
                return result;
            });
        } catch (error) {
            console.error('Error in Tenant.findAll:', error.message);
            throw error;
        }
    }

    static async findById(id) {
        try {
            const result = await get(`
                SELECT t.*, p.name as property_name, p.address as property_address
                FROM tenants t
                LEFT JOIN properties p ON t.property_id = p.id
                WHERE t.id = ?
            `, [id]);
            
            if (result) {
                // FIXED: Safe JSON parsing with error handling
                if (result.documents) {
                    try {
                        result.documents = JSON.parse(result.documents);
                    } catch (e) {
                        console.error('Error parsing documents for tenant:', result.id, e.message);
                        result.documents = [];
                    }
                } else {
                    result.documents = [];
                }
            }
            return result;
        } catch (error) {
            console.error('Error in Tenant.findById:', error.message);
            throw error;
        }
    }

    static async create(data) {
        try {
            const { id, name, fatherName, cnic, location, description, propertyId, roomNumber, status, profile_pic, documents } = data;
            
            // FIXED: Validate required fields
            if (!name || !fatherName || !cnic || !location) {
                throw new Error('Required fields missing: name, fatherName, cnic, location');
            }
            
            // FIXED: Ensure documents is an array and stringify safely
            const documentsJson = Array.isArray(documents) ? JSON.stringify(documents) : '[]';
            
            await run(
                `INSERT INTO tenants (id, name, father_name, cnic, location, description, property_id, room_number, status, profile_pic, documents)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, name, fatherName, cnic, location, description || null, propertyId || null, roomNumber || null, status || 'active', profile_pic || null, documentsJson]
            );
            
            return await this.findById(id);
        } catch (error) {
            console.error('Error in Tenant.create:', error.message);
            throw error;
        }
    }

    static async update(id, data) {
        try {
            const { name, fatherName, cnic, location, description, propertyId, roomNumber, status, profile_pic, documents } = data;
            
            // FIXED: Validate required fields
            if (!name || !fatherName || !cnic || !location) {
                throw new Error('Required fields missing: name, fatherName, cnic, location');
            }
            
            // FIXED: Ensure documents is an array and stringify safely
            const documentsJson = Array.isArray(documents) ? JSON.stringify(documents) : '[]';
            
            await run(
                `UPDATE tenants 
                 SET name = ?, father_name = ?, cnic = ?, location = ?, 
                     description = ?, property_id = ?, room_number = ?, status = ?,
                     profile_pic = ?, documents = ?
                 WHERE id = ?`,
                [name, fatherName, cnic, location, description || null, propertyId || null, roomNumber || null, status || 'active', profile_pic || null, documentsJson, id]
            );
            
            return await this.findById(id);
        } catch (error) {
            console.error('Error in Tenant.update:', error.message);
            throw error;
        }
    }

    // FIXED: SINGLE delete method with recycle bin
    static async delete(id) {
        try {
            const tenant = await this.findById(id);
            if (!tenant) {
                throw new Error('Tenant not found');
            }
            
            // Add to recycle bin before deleting
            await RecycleBin.addTenant(tenant);
            
            await run('DELETE FROM tenants WHERE id = ?', [id]);
            return tenant;
        } catch (error) {
            console.error('Error in Tenant.delete:', error.message);
            throw error;
        }
    }

    static async findByProperty(propertyId) {
        try {
            const results = await query(
                'SELECT * FROM tenants WHERE property_id = ? ORDER BY room_number',
                [propertyId]
            );
            
            // FIXED: Safe JSON parsing
            return results.map(result => {
                if (result.documents) {
                    try {
                        result.documents = JSON.parse(result.documents);
                    } catch (e) {
                        result.documents = [];
                    }
                } else {
                    result.documents = [];
                }
                return result;
            });
        } catch (error) {
            console.error('Error in Tenant.findByProperty:', error.message);
            throw error;
        }
    }

    static async clearAll() {
        try {
            await run('DELETE FROM tenants');
        } catch (error) {
            console.error('Error in Tenant.clearAll:', error.message);
            throw error;
        }
    }

    static async findByCNIC(cnic) {
        try {
            const result = await get('SELECT * FROM tenants WHERE cnic = ?', [cnic]);
            if (result && result.documents) {
                try {
                    result.documents = JSON.parse(result.documents);
                } catch (e) {
                    result.documents = [];
                }
            }
            return result;
        } catch (error) {
            console.error('Error in Tenant.findByCNIC:', error.message);
            throw error;
        }
    }

    // FIXED: New method to get tenant with payments
    static async findWithPayments(id) {
        try {
            const tenant = await this.findById(id);
            if (!tenant) return null;
            
            const payments = await query(
                'SELECT * FROM payments WHERE tenant_id = ? ORDER BY year DESC, month DESC',
                [id]
            );
            
            tenant.payments = payments;
            return tenant;
        } catch (error) {
            console.error('Error in Tenant.findWithPayments:', error.message);
            throw error;
        }
    }

    // FIXED: New method to get tenant count by status
    static async getCountByStatus() {
        try {
            const results = await query(`
                SELECT status, COUNT(*) as count
                FROM tenants
                GROUP BY status
            `);
            return results;
        } catch (error) {
            console.error('Error in Tenant.getCountByStatus:', error.message);
            throw error;
        }
    }
}

module.exports = Tenant;