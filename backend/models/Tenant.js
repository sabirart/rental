// backend/models/Tenant.js

const database = require('../config/database');
const { query, get, run } = database;
const RecycleBin = require('./RecycleBin');

class Tenant {
    // Every method below that participates in a multi-table write (create,
    // update, findByCNIC used as a pre-insert check) accepts an optional
    // trailing `db` executor ({query,get,run}). When called from inside
    // config/database.js's transaction(), the caller passes the
    // transaction-scoped executor so these statements run on the same
    // connection/BEGIN block as the related Property/Payment writes
    // (see tenantController.create/update). When omitted, it defaults to
    // the normal pooled query/get/run - existing call sites are unaffected.
    static async findAll(userId) {
        try {
            const results = await query(`
                SELECT t.*, p.name as property_name, p.address as property_address
                FROM tenants t
                LEFT JOIN properties p ON t.property_id = p.id
                WHERE t.user_id = ?
                ORDER BY t.created_at DESC
            `, [userId]);
            
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

    static async findById(id, userId, db = database) {
        try {
            const params = userId ? [id, userId] : [id];
            const userClause = userId ? 'AND t.user_id = ?' : '';
            const result = await db.get(`
                SELECT t.*, p.name as property_name, p.address as property_address
                FROM tenants t
                LEFT JOIN properties p ON t.property_id = p.id
                WHERE t.id = ? ${userClause}
            `, params);
            
            if (result) {
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

    static async create(data, userId, db = database) {
        try {
            const { id, name, fatherName, cnic, location, description, propertyId, roomNumber, status, profile_pic, documents, mobileNumber, advancePayment, leaseEndDate } = data;
            
            if (!name || !fatherName || !cnic || !location) {
                throw new Error('Required fields missing: name, fatherName, cnic, location');
            }
            
            // CNIC only needs to be unique within this landlord's own tenant list.
            // Re-checked here (not just by the caller) so it's authoritative
            // against whichever connection/transaction is actually doing the insert.
            const duplicate = await db.get('SELECT id FROM tenants WHERE cnic = ? AND user_id = ?', [cnic, userId]);
            if (duplicate) {
                throw new Error('A tenant with this CNIC already exists');
            }
            
            const documentsJson = Array.isArray(documents) ? JSON.stringify(documents) : '[]';
            
            await db.run(
                `INSERT INTO tenants (id, user_id, name, father_name, cnic, location, description, property_id, room_number, status, profile_pic, documents, mobile_number, advance_payment, lease_end_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, userId, name, fatherName, cnic, location, description || null, propertyId || null, roomNumber || null, status || 'active', profile_pic || null, documentsJson, mobileNumber || null, advancePayment || 0, leaseEndDate || null]
            );
            
            return await this.findById(id, userId, db);
        } catch (error) {
            console.error('Error in Tenant.create:', error.message);
            throw error;
        }
    }

    static async update(id, data, userId, db = database) {
        try {
            const { name, fatherName, cnic, location, description, propertyId, roomNumber, status, profile_pic, documents, mobileNumber, advancePayment, leaseEndDate } = data;
            
            if (!name || !fatherName || !cnic || !location) {
                throw new Error('Required fields missing: name, fatherName, cnic, location');
            }
            
            const duplicate = await db.get('SELECT id FROM tenants WHERE cnic = ? AND user_id = ? AND id != ?', [cnic, userId, id]);
            if (duplicate) {
                throw new Error('A tenant with this CNIC already exists');
            }
            
            const documentsJson = Array.isArray(documents) ? JSON.stringify(documents) : '[]';
            
            // Preserve mobile number / advance payment when a caller (e.g. document
            // removal) sends an update payload that doesn't include these fields.
            const existing = await this.findById(id, userId, db);
            const finalMobileNumber = mobileNumber !== undefined ? (mobileNumber || null) : (existing ? existing.mobile_number : null);
            const finalAdvancePayment = advancePayment !== undefined ? (advancePayment || 0) : (existing ? existing.advance_payment : 0);
            const finalLeaseEndDate = leaseEndDate !== undefined ? (leaseEndDate || null) : (existing ? existing.lease_end_date : null);
            
            await db.run(
                `UPDATE tenants 
                 SET name = ?, father_name = ?, cnic = ?, location = ?, 
                     description = ?, property_id = ?, room_number = ?, status = ?,
                     profile_pic = ?, documents = ?, mobile_number = ?, advance_payment = ?, lease_end_date = ?
                 WHERE id = ? AND user_id = ?`,
                [name, fatherName, cnic, location, description || null, propertyId || null, roomNumber || null, status || 'active', profile_pic || null, documentsJson, finalMobileNumber, finalAdvancePayment, finalLeaseEndDate, id, userId]
            );
            
            return await this.findById(id, userId, db);
        } catch (error) {
            console.error('Error in Tenant.update:', error.message);
            throw error;
        }
    }

    static async delete(id, userId, db = database) {
        try {
            const tenant = await this.findById(id, userId, db);
            if (!tenant) {
                throw new Error('Tenant not found');
            }
            
            await RecycleBin.addTenant(tenant, userId, db);
            
            await db.run('DELETE FROM tenants WHERE id = ? AND user_id = ?', [id, userId]);
            return tenant;
        } catch (error) {
            console.error('Error in Tenant.delete:', error.message);
            throw error;
        }
    }

    static async findByProperty(propertyId, userId) {
        try {
            const results = await query(
                'SELECT * FROM tenants WHERE property_id = ? AND user_id = ? ORDER BY room_number',
                [propertyId, userId]
            );
            
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

    static async clearAll(userId) {
        try {
            await run('DELETE FROM tenants WHERE user_id = ?', [userId]);
        } catch (error) {
            console.error('Error in Tenant.clearAll:', error.message);
            throw error;
        }
    }

    static async findByCNIC(cnic, userId) {
        try {
            const result = await get('SELECT * FROM tenants WHERE cnic = ? AND user_id = ?', [cnic, userId]);
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

    static async findWithPayments(id, userId) {
        try {
            const tenant = await this.findById(id, userId);
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

    static async getCountByStatus(userId) {
        try {
            const results = await query(`
                SELECT status, COUNT(*) as count
                FROM tenants
                WHERE user_id = ?
                GROUP BY status
            `, [userId]);
            return results;
        } catch (error) {
            console.error('Error in Tenant.getCountByStatus:', error.message);
            throw error;
        }
    }
}

module.exports = Tenant;
