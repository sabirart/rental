'use strict';
const Payment = require('../models/Payment');
const Tenant = require('../models/Tenant');
const Drive = require('../services/driveStore');
const { AppError } = require('../middleware/errorHandler');
const { newId } = require('../utils/id');

const isPlaceholder = (p) => p.placeholder === true;

const paymentController = {
  // Reads never write. The month's rows are created by POST /rollover.
  async getAll(req, res, next) {
    try {
      const { month, year, tenantId } = req.query;
      res.json({ success: true, data: await Payment.findAll(req.userId, { month, year, tenantId }) });
    } catch (e) { next(e); }
  },
  async getById(req, res, next) {
    try {
      const payment = await Payment.findById(req.params.id, req.userId);
      if (!payment) throw new AppError('Payment not found', 404);
      res.json({ success: true, data: payment });
    } catch (e) { next(e); }
  },

  async rollover(req, res, next) {
    try { res.json({ success: true, data: await Payment.rollover(req.userId) }); } catch (e) { next(e); }
  },

  async create(req, res, next) {
    try {
      const data = req.body;
      const result = await Drive.transaction(async () => {
        if (!(await Tenant.findById(data.tenantId, req.userId))) throw new AppError('Tenant not found', 404);
        const existing = await Payment.findAll(req.userId, { tenantId: data.tenantId, month: data.month, year: data.year });
        // The auto-created row for the current period is a placeholder to fill in, not a duplicate.
        const placeholder = existing.find(isPlaceholder);
        if (existing.length && !placeholder) {
          throw new AppError('A payment record already exists for this tenant for the selected month and year. Open it from Payment History to update it.', 400);
        }
        const payment = placeholder
          ? await Payment.update(placeholder.id, data, req.userId)
          : await Payment.create({ ...data, id: newId() }, req.userId);
        return { payment, filled: !!placeholder };
      });
      res.status(result.filled ? 200 : 201).json({ success: true, data: result.payment, message: 'Payment recorded successfully' });
    } catch (e) { next(e); }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      if (!(await Payment.findById(id, req.userId))) throw new AppError('Payment not found', 404);
      if (!(await Tenant.findById(req.body.tenantId, req.userId))) throw new AppError('Tenant not found', 404);
      res.json({ success: true, data: await Payment.update(id, req.body, req.userId), message: 'Payment updated successfully' });
    } catch (e) { next(e); }
  },

  async delete(req, res, next) {
    try {
      await Payment.delete(req.params.id, req.userId);
      res.json({ success: true, message: 'Payment deleted successfully' });
    } catch (e) { next(e); }
  },

  /** Destructive: needs ?confirm=yes and always takes a recovery snapshot first. */
  async clearAll(req, res, next) {
    try {
      if (req.query.confirm !== 'yes') throw new AppError('Confirmation required: this permanently removes every payment record. Resend with confirm=yes.', 400, 'CONFIRMATION_REQUIRED');
      await Drive.mutate(async (data) => {
        await Drive.snapshotBeforeChange(data, 'pre-clear-payments');
        data.payments = data.payments.filter((p) => p.user_id !== req.userId);
      });
      res.json({ success: true, message: 'All payments cleared successfully' });
    } catch (e) { next(e); }
  },

  async getByTenant(req, res, next) {
    try {
      if (!(await Tenant.findById(req.params.tenantId, req.userId))) throw new AppError('Tenant not found', 404);
      res.json({ success: true, data: await Payment.findByTenant(req.params.tenantId, req.userId) });
    } catch (e) { next(e); }
  },
  async getDashboardStats(req, res, next) {
    try { res.json({ success: true, data: await Payment.getDashboardStats(req.userId) }); } catch (e) { next(e); }
  },
  async getMonthlySummary(req, res, next) {
    try {
      const year = parseInt(req.query.year, 10);
      const month = parseInt(req.query.month, 10);
      if (!req.query.year || !req.query.month) throw new AppError('Year and month are required', 400);
      if (Number.isNaN(year) || year < 2000 || year > 2100) throw new AppError('Year must be between 2000 and 2100', 400);
      if (Number.isNaN(month) || month < 1 || month > 12) throw new AppError('Month must be between 1 and 12', 400);
      res.json({ success: true, data: await Payment.getMonthlySummary(year, month, req.userId) });
    } catch (e) { next(e); }
  }
};
module.exports = paymentController;
