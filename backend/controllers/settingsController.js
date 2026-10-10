'use strict';
const UserSettings = require('../models/UserSettings');
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const Drive = require('../services/driveStore');

const view = (s) => ({
  notificationsEnabled: s.notifications_enabled === 1,
  monthlyResetDay: s.monthly_reset_day,
  lastResetMonth: s.last_reset_month,
  lastResetYear: s.last_reset_year
});

const settingsController = {
  async get(req, res, next) {
    try { res.json({ success: true, data: view(await UserSettings.get(req.userId)) }); } catch (e) { next(e); }
  },
  async update(req, res, next) {
    try {
      const { notificationsEnabled, monthlyResetDay } = req.body;
      const settings = await UserSettings.update(req.userId, { notificationsEnabled, monthlyResetDay });
      res.json({ success: true, data: view(settings), message: 'Settings updated successfully' });
    } catch (e) { next(e); }
  },
  /**
   * "Clear all data" in ONE atomic write: a recovery snapshot is taken first,
   * tenants and properties are archived to the recycle bin (as before) and
   * remaining payments are removed. A failure leaves the account untouched.
   */
  async clearAll(req, res, next) {
    try {
      const counts = await Drive.transaction(async () => {
        const data = await Drive.getData();
        await Drive.snapshotBeforeChange(data, 'pre-clear-all');
        const tenants = await Tenant.findAll(req.userId);
        for (const t of tenants) await Tenant.delete(t.id, req.userId);
        const properties = await Property.findAll(req.userId);
        for (const p of properties) await Property.delete(p.id, req.userId);
        const removedPayments = data.payments.filter((p) => p.user_id === req.userId).length;
        data.payments = data.payments.filter((p) => p.user_id !== req.userId);
        return { tenants: tenants.length, properties: properties.length, payments: removedPayments };
      });
      res.json({ success: true, data: counts, message: 'All data cleared successfully' });
    } catch (e) { next(e); }
  }
};
module.exports = settingsController;
