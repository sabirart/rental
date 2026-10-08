const UserSettings = require('../models/UserSettings');
const { AppError } = require('../middleware/errorHandler');

const settingsController = {
    async get(req, res, next) {
        try {
            const settings = await UserSettings.get(req.userId);
            res.json({
                success: true,
                data: {
                    notificationsEnabled: settings.notifications_enabled === 1,
                    monthlyResetDay: settings.monthly_reset_day,
                    lastResetMonth: settings.last_reset_month,
                    lastResetYear: settings.last_reset_year
                }
            });
        } catch (error) {
            next(error);
        }
    },

    async update(req, res, next) {
        try {
            const { notificationsEnabled, monthlyResetDay } = req.body;

            if (monthlyResetDay !== undefined) {
                const day = parseInt(monthlyResetDay);
                if (isNaN(day) || day < 1 || day > 31) {
                    throw new AppError('Monthly reset day must be between 1 and 31', 400);
                }
            }

            const settings = await UserSettings.update(req.userId, { notificationsEnabled, monthlyResetDay });

            res.json({
                success: true,
                data: {
                    notificationsEnabled: settings.notifications_enabled === 1,
                    monthlyResetDay: settings.monthly_reset_day
                },
                message: 'Settings updated successfully'
            });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = settingsController;
