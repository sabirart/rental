const RecycleBin = require('../models/RecycleBin');
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const { AppError } = require('../middleware/errorHandler');

const recycleController = {
    async getAll(req, res, next) {
        try {
            const { type } = req.query;
            const items = await RecycleBin.getAll(type || null);
            
            res.json({
                success: true,
                data: items
            });
        } catch (error) {
            next(error);
        }
    },

    async getCount(req, res, next) {
        try {
            const total = await RecycleBin.getCount();
            const tenants = await RecycleBin.getCountByType('tenant');
            const properties = await RecycleBin.getCountByType('property');
            
            res.json({
                success: true,
                data: {
                    total,
                    tenants,
                    properties
                }
            });
        } catch (error) {
            next(error);
        }
    },

    async recover(req, res, next) {
        try {
            const { id } = req.params;
            const item = await RecycleBin.recover(id);
            
            res.json({
                success: true,
                data: item,
                message: `${item.type} recovered successfully`
            });
        } catch (error) {
            next(error);
        }
    },

    async deletePermanently(req, res, next) {
        try {
            const { id } = req.params;
            const item = await RecycleBin.deletePermanently(id);
            
            res.json({
                success: true,
                data: item,
                message: `${item.type} permanently deleted`
            });
        } catch (error) {
            next(error);
        }
    },

    async clearAll(req, res, next) {
        try {
            const { type } = req.query;
            if (type) {
                await RecycleBin.clearAllByType(type);
            } else {
                await RecycleBin.clearAll();
            }
            
            res.json({
                success: true,
                message: type ? `All ${type}s cleared from recycle bin` : 'Recycle bin cleared successfully'
            });
        } catch (error) {
            next(error);
        }
    },

    async deleteOldItems(req, res, next) {
        try {
            const { days = 15 } = req.query;
            await RecycleBin.deleteOldItems(parseInt(days));
            
            res.json({
                success: true,
                message: `Items older than ${days} days deleted from recycle bin`
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = recycleController;