const { get, run } = require('../config/database');

const DEFAULTS = {
    notifications_enabled: 1,
    monthly_reset_day: 31 // sentinel: "last day of the month"
};

class UserSettings {
    static async get(userId) {
        try {
            let row = await get('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
            if (!row) {
                await run(
                    'INSERT INTO user_settings (user_id, notifications_enabled, monthly_reset_day) VALUES (?, ?, ?)',
                    [userId, DEFAULTS.notifications_enabled, DEFAULTS.monthly_reset_day]
                );
                row = await get('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
            }
            return row;
        } catch (error) {
            console.error('Error in UserSettings.get:', error.message);
            // Never let settings lookup break the rest of the app - fall back to defaults.
            return { user_id: userId, ...DEFAULTS, last_reset_month: null, last_reset_year: null };
        }
    }

    static async update(userId, data) {
        try {
            await this.get(userId); // ensure a row exists
            const fields = [];
            const params = [];

            if (data.notificationsEnabled !== undefined) {
                fields.push('notifications_enabled = ?');
                params.push(data.notificationsEnabled ? 1 : 0);
            }
            if (data.monthlyResetDay !== undefined) {
                const day = parseInt(data.monthlyResetDay);
                if (isNaN(day) || day < 1 || day > 31) {
                    throw new Error('Monthly reset day must be between 1 and 31');
                }
                fields.push('monthly_reset_day = ?');
                params.push(day);
            }

            if (fields.length === 0) return await this.get(userId);

            fields.push('updated_at = CURRENT_TIMESTAMP');
            params.push(userId);

            await run(`UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = ?`, params);
            return await this.get(userId);
        } catch (error) {
            console.error('Error in UserSettings.update:', error.message);
            throw error;
        }
    }

    static async markRolloverDone(userId, month, year) {
        try {
            await run(
                'UPDATE user_settings SET last_reset_month = ?, last_reset_year = ? WHERE user_id = ?',
                [month, year, userId]
            );
        } catch (error) {
            console.error('Error in UserSettings.markRolloverDone:', error.message);
        }
    }

    // Given "today" and the user's configured reset day, works out which
    // billing period (month/year) we're currently in. A reset day of 31
    // (or anything >= the number of days in the month) behaves as "reset on
    // the last day of the month" - i.e. matches plain calendar months.
    static getEffectivePeriod(date, resetDay) {
        const day = date.getDate();
        const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        const effectiveResetDay = Math.min(resetDay || 31, daysInMonth);

        let month = date.getMonth() + 1;
        let year = date.getFullYear();

        if (day > effectiveResetDay) {
            month += 1;
            if (month > 12) {
                month = 1;
                year += 1;
            }
        }
        return { month, year };
    }
}

module.exports = UserSettings;
