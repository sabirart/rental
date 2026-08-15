const { query, get, run } = require('../config/database');

class Payment {
    static async findAll(filters = {}) {
        try {
            let sql = `
                SELECT p.*, t.name as tenant_name, t.cnic as tenant_cnic,
                       pr.name as property_name
                FROM payments p
                LEFT JOIN tenants t ON p.tenant_id = t.id
                LEFT JOIN properties pr ON t.property_id = pr.id
                WHERE 1=1
            `;
            const params = [];

            if (filters.month) { sql += ` AND p.month = ?`; params.push(filters.month); }
            if (filters.year) { sql += ` AND p.year = ?`; params.push(filters.year); }
            if (filters.tenantId) { sql += ` AND p.tenant_id = ?`; params.push(filters.tenantId); }

            sql += ` ORDER BY p.created_at DESC`;
            const results = await query(sql, params);
            return results.map(row => {
                try { row.custom_charges = JSON.parse(row.custom_charges || '[]'); } catch (e) { row.custom_charges = []; }
                return row;
            });
        } catch (error) {
            console.error('Error in Payment.findAll:', error.message);
            throw error;
        }
    }

    static async findById(id) {
        try {
            const result = await get(`
                SELECT p.*, t.name as tenant_name, t.cnic as tenant_cnic
                FROM payments p
                LEFT JOIN tenants t ON p.tenant_id = t.id
                WHERE p.id = ?
            `, [id]);
            if (result) {
                try { result.custom_charges = JSON.parse(result.custom_charges || '[]'); } catch (e) { result.custom_charges = []; }
            }
            return result;
        } catch (error) {
            console.error('Error in Payment.findById:', error.message);
            throw error;
        }
    }

    static async create(data) {
        try {
            const { 
                id, tenantId, month, year, monthlyRent, 
                electricity, gas, previousDues, totalPayment, 
                customCharges, status, notes 
            } = data;
            
            if (!tenantId) throw new Error('Tenant ID is required');
            if (!month || month < 1 || month > 12) throw new Error('Month must be between 1 and 12');
            if (!year || year < 2000 || year > 2100) throw new Error('Year must be between 2000 and 2100');
            if (monthlyRent === undefined || monthlyRent < 0) throw new Error('Monthly rent must be a positive number');
            
            const customChargesJson = JSON.stringify(customCharges || []);
            
            const result = await run(
                `INSERT INTO payments (
                    id, tenant_id, month, year, monthly_rent, 
                    electricity, gas, previous_dues, total_payment, 
                    custom_charges, status, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, tenantId, month, year, monthlyRent, 
                    electricity || 0, gas || 0, previousDues || 0, totalPayment, 
                    customChargesJson, status || 'unpaid', notes || null
                ]
            );
            
            return await this.findById(id);
        } catch (error) {
            console.error('Error in Payment.create:', error.message);
            throw error;
        }
    }

    static async update(id, data) {
        try {
            const { tenantId, month, year, monthlyRent, electricity, gas, previousDues, totalPayment, customCharges, status, notes } = data;
            
            if (!tenantId) throw new Error('Tenant ID is required');
            if (!month || month < 1 || month > 12) throw new Error('Month must be between 1 and 12');
            if (!year || year < 2000 || year > 2100) throw new Error('Year must be between 2000 and 2100');
            if (monthlyRent === undefined || monthlyRent < 0) throw new Error('Monthly rent must be a positive number');
            
            const customChargesJson = JSON.stringify(customCharges || []);
            
            await run(
                `UPDATE payments 
                 SET tenant_id = ?, month = ?, year = ?, monthly_rent = ?, 
                     electricity = ?, gas = ?, previous_dues = ?, total_payment = ?,
                     custom_charges = ?, status = ?, notes = ?
                 WHERE id = ?`,
                [tenantId, month, year, monthlyRent, electricity || 0, gas || 0, previousDues || 0, totalPayment, customChargesJson, status || 'unpaid', notes || null, id]
            );
            
            return await this.findById(id);
        } catch (error) {
            console.error('Error in Payment.update:', error.message);
            throw error;
        }
    }

    static async delete(id) {
        try {
            const payment = await this.findById(id);
            if (!payment) throw new Error('Payment not found');
            await run('DELETE FROM payments WHERE id = ?', [id]);
            return payment;
        } catch (error) {
            console.error('Error in Payment.delete:', error.message);
            throw error;
        }
    }

    static async findByTenant(tenantId) {
        try {
            const results = await query(`SELECT * FROM payments WHERE tenant_id = ? ORDER BY year DESC, month DESC`, [tenantId]);
            return results.map(row => {
                try { row.custom_charges = JSON.parse(row.custom_charges || '[]'); } catch (e) { row.custom_charges = []; }
                return row;
            });
        } catch (error) {
            console.error('Error in Payment.findByTenant:', error.message);
            throw error;
        }
    }

    static async getMonthlySummary(year, month) {
        try {
            if (!year || !month) throw new Error('Year and month are required');
            const result = await get(`
                SELECT 
                    COUNT(*) as total_records,
                    COALESCE(SUM(CASE WHEN status = 'paid' THEN total_payment ELSE 0 END), 0) as total_collected,
                    COALESCE(SUM(CASE WHEN status IN ('unpaid', 'partial') THEN total_payment ELSE 0 END), 0) as total_pending,
                    COALESCE(AVG(total_payment), 0) as average_payment
                FROM payments
                WHERE year = ? AND month = ?
            `, [year, month]);
            return result || { total_records: 0, total_collected: 0, total_pending: 0, average_payment: 0 };
        } catch (error) {
            console.error('Error in Payment.getMonthlySummary:', error.message);
            throw error;
        }
    }

    static async getDashboardStats() {
        try {
            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth() + 1;
            const result = await get(`
                SELECT 
                    (SELECT COUNT(*) FROM properties) as total_properties,
                    (SELECT COUNT(*) FROM tenants WHERE status = 'active') as total_tenants,
                    (SELECT COUNT(*) FROM tenants WHERE status = 'active' AND property_id IS NOT NULL) as occupied_rooms,
                    COALESCE((SELECT SUM(total_payment) FROM payments WHERE year = ? AND month = ? AND status = 'paid'), 0) as monthly_revenue
            `, [currentYear, currentMonth]);
            return result || { total_properties: 0, total_tenants: 0, occupied_rooms: 0, monthly_revenue: 0 };
        } catch (error) {
            console.error('Error in Payment.getDashboardStats:', error.message);
            throw error;
        }
    }
}

module.exports = Payment;