'use strict';
const RecycleBin = require('../models/RecycleBin');
const { AppError } = require('../middleware/errorHandler');

const TYPES = ['tenant', 'property'];
const typeOf = (value) => {
  if (value === undefined || value === '') return null;
  if (!TYPES.includes(value)) throw new AppError('type must be tenant or property', 400);
  return value;
};

const recycleController = {
  async getAll(req, res, next) {
    try { res.json({ success: true, data: await RecycleBin.getAll(req.userId, typeOf(req.query.type)) }); } catch (e) { next(e); }
  },
  async getCount(req, res, next) {
    try {
      const [total, tenants, properties] = await Promise.all([
        RecycleBin.getCount(req.userId), RecycleBin.getCountByType('tenant', req.userId), RecycleBin.getCountByType('property', req.userId)
      ]);
      res.json({ success: true, data: { total, tenants, properties } });
    } catch (e) { next(e); }
  },
  async recover(req, res, next) {
    try {
      const { item, warnings } = await RecycleBin.recover(req.params.id, req.userId);
      const message = warnings.length ? `${item.type} recovered with changes: ${warnings.join(' ')}` : `${item.type} recovered successfully`;
      res.json({ success: true, data: item, warnings, message });
    } catch (e) { next(e); }
  },
  async deletePermanently(req, res, next) {
    try {
      const item = await RecycleBin.deletePermanently(req.params.id, req.userId);
      res.json({ success: true, data: item, message: `${item.type} permanently deleted` });
    } catch (e) { next(e); }
  },
  async clearAll(req, res, next) {
    try {
      const type = typeOf(req.query.type);
      if (type) await RecycleBin.clearAllByType(type, req.userId); else await RecycleBin.clearAll(req.userId);
      res.json({ success: true, message: type ? `All ${type}s cleared from recycle bin` : 'Recycle bin cleared successfully' });
    } catch (e) { next(e); }
  },
  async deleteOldItems(req, res, next) {
    try {
      const days = req.query.days === undefined ? 15 : req.query.days; // validated as 1..3650 by the route
      const removed = await RecycleBin.deleteOldItems(req.userId, days);
      res.json({ success: true, data: { removed }, message: `Items older than ${days} days deleted from recycle bin` });
    } catch (e) { next(e); }
  }
};
module.exports = recycleController;
