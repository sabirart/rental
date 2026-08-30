const database = require('../config/database');
const { query, get, run } = database;
const UserSettings = require('./UserSettings');

class Payment {
    // Given a status + the amounts on a payment, works out the correct
    // amount_paid: 'paid' always means the full total was received, 'unpaid'
    // always means nothing was received yet, and 'partial' requires an
    // explicit amount strictly between 0 and the total (the caller must say
    // how much actually came in - there's no way to infer it). This is the
    // single choke point that keeps `status` and `amount_paid` from ever
    // disagreeing, instead of trusting whatever combination a caller sends.
    static _resolveAmountPaid(status, totalPayment, amountPaidInput) {
        const total = Number(totalPayment) || 0;
        const resolvedStatus = status || 'unpaid';

        if (resolvedStatus === 'paid') {
            return total;
        }
        if (resolvedStatus === 'unpaid') {
            return 0;
        }
        // partial
        const amount = amountPaidInput === undefined || amountPaidInput === null || amountPaidInput === ''
            ? NaN
            : Number(amountPaidInput);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error('A partial payment requires an amount received greater than 0');
        }
        if (amount >= total) {
            throw new Error('Amount received for a partial payment must be less than the total amount due');
        }
        return amount;
    }


    static async findAll(userId, filters = {}) {
        try {
            let sql = `
                SELECT p.*, t.name as tenant_name, t.cnic as tenant_cnic,
                       pr.name as property_name
                FROM payments p
                LEFT JOIN tenants t ON p.tenant_id = t.id
                LEFT JOIN properties pr ON t.property_id = pr.id
                WHERE p.user_id = ?
            `;
            const params = [userId];

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

    static async findById(id, userId, db = database) {
        try {
            const params = userId ? [id, userId] : [id];
            const userClause = userId ? 'AND p.user_id = ?' : '';
            const result = await db.get(`
                SELECT p.*, t.name as tenant_name, t.cnic as tenant_cnic
                FROM payments p
                LEFT JOIN tenants t ON p.tenant_id = t.id
                WHERE p.id = ? ${userClause}
            `, params);
            if (result) {
                try { result.custom_charges = JSON.parse(result.custom_charges || '[]'); } catch (e) { result.custom_charges = []; }
            }
            return result;
        } catch (error) {
            console.error('Error in Payment.findById:', error.message);
            throw error;
        }
    }

    static async create(data, userId, db = database) {
        try {
            const { 
                id, tenantId, month, year, monthlyRent, 
                electricity, gas, previousDues, totalPayment, amountPaid,
                customCharges, status, notes 
            } = data;
            
            if (!tenantId) throw new Error('Tenant ID is required');
            if (!month || month < 1 || month > 12) throw new Error('Month must be between 1 and 12');
            if (!year || year < 2000 || year > 2100) throw new Error('Year must be between 2000 and 2100');
            if (monthlyRent === undefined || monthlyRent < 0) throw new Error('Monthly rent must be a positive number');
            
            const customChargesJson = JSON.stringify(customCharges || []);
            const resolvedStatus = status || 'unpaid';
            const resolvedAmountPaid = this._resolveAmountPaid(resolvedStatus, totalPayment, amountPaid);
            
            await db.run(
                `INSERT INTO payments (
                    id, user_id, tenant_id, month, year, monthly_rent, 
                    electricity, gas, previous_dues, total_payment, amount_paid,
                    custom_charges, status, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, userId, tenantId, month, year, monthlyRent, 
                    electricity || 0, gas || 0, previousDues || 0, totalPayment, resolvedAmountPaid,
                    customChargesJson, resolvedStatus, notes || null
                ]
            );
            
            return await this.findById(id, userId, db);
        } catch (error) {
            console.error('Error in Payment.create:', error.message);
            throw error;
        }
    }

    static async update(id, data, userId, db = database) {
        try {
            const { tenantId, month, year, monthlyRent, electricity, gas, previousDues, totalPayment, amountPaid, customCharges, status, notes } = data;
            
            if (!tenantId) throw new Error('Tenant ID is required');
            if (!month || month < 1 || month > 12) throw new Error('Month must be between 1 and 12');
            if (!year || year < 2000 || year > 2100) throw new Error('Year must be between 2000 and 2100');
            if (monthlyRent === undefined || monthlyRent < 0) throw new Error('Monthly rent must be a positive number');
            
            const customChargesJson = JSON.stringify(customCharges || []);
            const resolvedStatus = status || 'unpaid';
            const resolvedAmountPaid = this._resolveAmountPaid(resolvedStatus, totalPayment, amountPaid);
            
            await db.run(
                `UPDATE payments 
                 SET tenant_id = ?, month = ?, year = ?, monthly_rent = ?, 
                     electricity = ?, gas = ?, previous_dues = ?, total_payment = ?, amount_paid = ?,
                     custom_charges = ?, status = ?, notes = ?
                 WHERE id = ? AND user_id = ?`,
                [tenantId, month, year, monthlyRent, electricity || 0, gas || 0, previousDues || 0, totalPayment, resolvedAmountPaid, customChargesJson, resolvedStatus, notes || null, id, userId]
            );
            
            return await this.findById(id, userId, db);
        } catch (error) {
            console.error('Error in Payment.update:', error.message);
            throw error;
        }
    }

    static async delete(id, userId) {
        try {
            const payment = await this.findById(id, userId);
            if (!payment) throw new Error('Payment not found');
            await run('DELETE FROM payments WHERE id = ? AND user_id = ?', [id, userId]);
            return payment;
        } catch (error) {
            console.error('Error in Payment.delete:', error.message);
            throw error;
        }
    }

    static async clearAll(userId) {
        try {
            await run('DELETE FROM payments WHERE user_id = ?', [userId]);
        } catch (error) {
            console.error('Error in Payment.clearAll:', error.message);
            throw error;
        }
    }

    static async findByTenant(tenantId, userId) {
        try {
            const results = await query(`SELECT * FROM payments WHERE tenant_id = ? AND user_id = ? ORDER BY year DESC, month DESC`, [tenantId, userId]);
            return results.map(row => {
                try { row.custom_charges = JSON.parse(row.custom_charges || '[]'); } catch (e) { row.custom_charges = []; }
                return row;
            });
        } catch (error) {
            console.error('Error in Payment.findByTenant:', error.message);
            throw error;
        }
    }

    static async getMonthlySummary(year, month, userId) {
        try {
            if (!year || !month) throw new Error('Year and month are required');
            // total_collected/total_pending are now based on amount_paid
            // (actual money received) rather than treating a 'partial'
            // payment as $0 collected - a partially-paid record now
            // correctly contributes its received amount to "collected" and
            // its remaining balance (total - paid) to "pending".
            const result = await get(`
                SELECT 
                    COUNT(*) as total_records,
                    COALESCE(SUM(amount_paid), 0) as total_collected,
                    COALESCE(SUM(total_payment - amount_paid), 0) as total_pending,
                    COALESCE(AVG(total_payment), 0) as average_payment
                FROM payments
                WHERE year = ? AND month = ? AND user_id = ?
            `, [year, month, userId]);
            return result || { total_records: 0, total_collected: 0, total_pending: 0, average_payment: 0 };
        } catch (error) {
            console.error('Error in Payment.getMonthlySummary:', error.message);
            throw error;
        }
    }

    static async getDashboardStats(userId) {
        try {
            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth() + 1;
            // monthly_revenue reflects actual money received this period
            // (SUM of amount_paid, which is 0 for unpaid, the full total for
            // paid, and the real partial amount for partial), instead of
            // only counting fully-paid records and silently excluding any
            // partial payments a tenant has already made.
            const result = await get(`
                SELECT 
                    (SELECT COUNT(*) FROM properties WHERE user_id = ?) as total_properties,
                    (SELECT COUNT(*) FROM tenants WHERE status = 'active' AND user_id = ?) as total_tenants,
                    (SELECT COUNT(*) FROM rooms r JOIN properties p ON r.property_id = p.id WHERE r.status = 'occupied' AND p.user_id = ?) as occupied_rooms,
                    COALESCE((SELECT SUM(amount_paid) FROM payments WHERE year = ? AND month = ? AND user_id = ?), 0) as monthly_revenue
            `, [userId, userId, userId, currentYear, currentMonth, userId]);
            return result || { total_properties: 0, total_tenants: 0, occupied_rooms: 0, monthly_revenue: 0 };
        } catch (error) {
            console.error('Error in Payment.getDashboardStats:', error.message);
            throw error;
        }
    }

    // ===== MONTHLY ROLLOVER =====
    // Called (idempotently) whenever payments are loaded for a logged-in user.
    // Uses the user's configured reset day (Settings > Monthly Reset) to work
    // out which billing period "today" belongs to, then makes sure every
    // active tenant has a payment record for that period. New records start
    // fresh (rent carried over from the tenant's current room/property rate,
    // electricity and gas reset to their default of 0), and if the previous
    // period wasn't fully paid, that unpaid amount is carried forward into
    // "previous_dues" instead of being lost - a partial/unpaid record itself
    // is never modified or zeroed out, only referenced. Existing records for
    // the current period are never touched.
    static async ensureCurrentMonthPayments(userId) {
        try {
            const settings = await UserSettings.get(userId);
            const { month, year } = UserSettings.getEffectivePeriod(new Date(), settings.monthly_reset_day);

            const activeTenants = await query(`SELECT * FROM tenants WHERE status = 'active' AND user_id = ?`, [userId]);
            const created = [];

            for (const tenant of activeTenants) {
                const already = await get(
                    `SELECT id FROM payments WHERE tenant_id = ? AND month = ? AND year = ? AND user_id = ?`,
                    [tenant.id, month, year, userId]
                );
                if (already) continue; // this period already has a record for this tenant

                // Most recent payment record for this tenant (any month/year)
                const lastPayment = await get(
                    `SELECT * FROM payments WHERE tenant_id = ? AND user_id = ? ORDER BY year DESC, month DESC, created_at DESC LIMIT 1`,
                    [tenant.id, userId]
                );

                // Rent stays exactly what it was until the user manually
                // changes it: prefer the room's own rent override, then the
                // tenant's last recorded rent, then the property's base rent.
                let rent = 0;
                if (tenant.property_id && tenant.room_number) {
                    const room = await get(
                        `SELECT rent_amount FROM rooms WHERE property_id = ? AND room_number = ?`,
                        [tenant.property_id, tenant.room_number]
                    );
                    if (room && room.rent_amount) rent = room.rent_amount;
                }
                if (!rent && lastPayment) rent = lastPayment.monthly_rent;
                if (!rent && tenant.property_id) {
                    const property = await get(`SELECT base_rent FROM properties WHERE id = ?`, [tenant.property_id]);
                    if (property) rent = property.base_rent || 0;
                }

                // Carry forward only the actual remaining balance from last
                // period (total due minus whatever was actually received),
                // not the full amount - a partial payment now correctly
                // reduces what's carried forward instead of the tenant being
                // charged for the same rent twice. A fully paid period
                // contributes nothing, and the old record's own status and
                // amounts are left completely untouched either way.
                const lastRemaining = lastPayment
                    ? Math.max(0, (lastPayment.total_payment || 0) - (lastPayment.amount_paid || 0))
                    : 0;
                const previousDues = (lastPayment && lastPayment.status !== 'paid')
                    ? lastRemaining
                    : 0;

                // Electricity and gas reset to their default (0) each period.
                const electricity = 0;
                const gas = 0;
                const totalPayment = rent + electricity + gas + previousDues;

                const payment = await this.create({
                    id: `pay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
                    tenantId: tenant.id,
                    month,
                    year,
                    monthlyRent: rent,
                    electricity,
                    gas,
                    previousDues,
                    totalPayment,
                    customCharges: [],
                    status: 'unpaid',
                    notes: previousDues > 0 ? 'Auto-generated for new period; includes unpaid balance from last period' : 'Auto-generated for new period'
                }, userId);
                created.push(payment);
            }

            await UserSettings.markRolloverDone(userId, month, year);

            return created;
        } catch (error) {
            console.error('Error in Payment.ensureCurrentMonthPayments:', error.message);
            // Never let rollover generation break the normal payments load
            return [];
        }
    }
}

module.exports = Payment;
