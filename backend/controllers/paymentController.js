const Payment = require('../models/Payment');
const Tenant = require('../models/Tenant');
const { AppError } = require('../middleware/errorHandler');

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

const paymentController = {
    async getAll(req, res, next) {
        try {
            const { month, year, tenantId } = req.query;
            const payments = await Payment.findAll({ month, year, tenantId });
            res.json({ success: true, data: payments });
        } catch (error) {
            next(error);
        }
    },

    async getById(req, res, next) {
        try {
            const { id } = req.params;
            const payment = await Payment.findById(id);
            if (!payment) throw new AppError('Payment not found', 404);
            res.json({ success: true, data: payment });
        } catch (error) {
            next(error);
        }
    },

    async create(req, res, next) {
        try {
            const data = req.body;
            
            const tenant = await Tenant.findById(data.tenantId);
            if (!tenant) throw new AppError('Tenant not found', 404);
            if (!data.month || data.month < 1 || data.month > 12) throw new AppError('Month must be between 1 and 12', 400);
            if (!data.year || data.year < 2000 || data.year > 2100) throw new AppError('Year must be between 2000 and 2100', 400);
            if (!data.monthlyRent || data.monthlyRent < 0) throw new AppError('Monthly rent must be a positive number', 400);
            
            const existing = await Payment.findAll({ tenantId: data.tenantId, month: data.month, year: data.year });
            if (existing.length > 0) throw new AppError('Payment already exists for this tenant for this month/year', 400);
            
            const totalPayment = (data.monthlyRent || 0) + (data.electricity || 0) + (data.gas || 0) + (data.previousDues || 0);
            
            const payment = await Payment.create({
                id: generateId(),
                ...data,
                totalPayment
            });
            
            res.status(201).json({ success: true, data: payment, message: 'Payment recorded successfully' });
        } catch (error) {
            next(error);
        }
    },

    async update(req, res, next) {
        try {
            const { id } = req.params;
            const data = req.body;
            
            const existing = await Payment.findById(id);
            if (!existing) throw new AppError('Payment not found', 404);
            
            const tenant = await Tenant.findById(data.tenantId);
            if (!tenant) throw new AppError('Tenant not found', 404);
            if (!data.month || data.month < 1 || data.month > 12) throw new AppError('Month must be between 1 and 12', 400);
            if (!data.year || data.year < 2000 || data.year > 2100) throw new AppError('Year must be between 2000 and 2100', 400);
            if (!data.monthlyRent || data.monthlyRent < 0) throw new AppError('Monthly rent must be a positive number', 400);
            
            const duplicates = await Payment.findAll({ tenantId: data.tenantId, month: data.month, year: data.year });
            if (duplicates.some(p => p.id !== id)) throw new AppError('Payment already exists for this tenant for this month/year', 400);
            
            const totalPayment = (data.monthlyRent || 0) + (data.electricity || 0) + (data.gas || 0) + (data.previousDues || 0);
            
            const payment = await Payment.update(id, { ...data, totalPayment });
            
            res.json({ success: true, data: payment, message: 'Payment updated successfully' });
        } catch (error) {
            next(error);
        }
    },

    async delete(req, res, next) {
        try {
            const { id } = req.params;
            const existing = await Payment.findById(id);
            if (!existing) throw new AppError('Payment not found', 404);
            await Payment.delete(id);
            res.json({ success: true, message: 'Payment deleted successfully' });
        } catch (error) {
            next(error);
        }
    },

    async getByTenant(req, res, next) {
        try {
            const { tenantId } = req.params;
            const tenant = await Tenant.findById(tenantId);
            if (!tenant) throw new AppError('Tenant not found', 404);
            const payments = await Payment.findByTenant(tenantId);
            res.json({ success: true, data: payments });
        } catch (error) {
            next(error);
        }
    },

    async getDashboardStats(req, res, next) {
        try {
            const stats = await Payment.getDashboardStats();
            res.json({ success: true, data: stats });
        } catch (error) {
            next(error);
        }
    },

    async getMonthlySummary(req, res, next) {
        try {
            const { year, month } = req.query;
            if (!year || !month) throw new AppError('Year and month are required', 400);
            
            const yearNum = parseInt(year);
            const monthNum = parseInt(month);
            if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) throw new AppError('Year must be between 2000 and 2100', 400);
            if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) throw new AppError('Month must be between 1 and 12', 400);
            
            const summary = await Payment.getMonthlySummary(yearNum, monthNum);
            res.json({ success: true, data: summary });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = paymentController;