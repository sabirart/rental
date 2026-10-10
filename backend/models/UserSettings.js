'use strict';
const Drive = require('../services/driveStore');
const { DEFAULT_SETTINGS } = require('../services/schema');
const { httpError } = require('../middleware/errorHandler');

/** Which billing period "now" belongs to, given the configured reset day (31 = calendar month). */
function getEffectivePeriod(date, resetDay) {
  const day = date.getDate();
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const reset = Math.min(resetDay || 31, daysInMonth);
  let month = date.getMonth() + 1;
  let year = date.getFullYear();
  if (day > reset) { month += 1; if (month > 12) { month = 1; year += 1; } }
  return { month, year };
}

class UserSettings {
  static async get(userId) {
    const d = await Drive.getData();
    return { ...DEFAULT_SETTINGS, ...(d.settings || {}), user_id: userId };
  }

  static async update(userId, data) {
    return Drive.mutate((d) => {
      d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}), user_id: userId };
      if (data.notificationsEnabled !== undefined) d.settings.notifications_enabled = data.notificationsEnabled ? 1 : 0;
      if (data.monthlyResetDay !== undefined) {
        const day = parseInt(data.monthlyResetDay, 10);
        if (Number.isNaN(day) || day < 1 || day > 31) throw httpError('Monthly reset day must be between 1 and 31');
        d.settings.monthly_reset_day = day;
      }
      return d.settings;
    });
  }

  static async markRolloverDone(userId, month, year) {
    return Drive.mutate((d) => {
      d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}), user_id: userId };
      d.settings.last_reset_month = month;
      d.settings.last_reset_year = year;
    });
  }

  static periodFor(data, date = new Date()) {
    return getEffectivePeriod(date, Number(data?.settings?.monthly_reset_day) || 31);
  }

  static getEffectivePeriod(date, resetDay) { return getEffectivePeriod(date, resetDay); }
}
module.exports = UserSettings;
