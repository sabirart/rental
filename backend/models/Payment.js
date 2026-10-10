'use strict';
const Drive = require('../services/driveStore');
const UserSettings = require('./UserSettings');
const { httpError } = require('../middleware/errorHandler');
const { newId } = require('../utils/id');
const { toMoney, computeTotal, statusFor, receivedFromFlags } = require('../services/paymentMath');

const now = () => new Date().toISOString();
const samePeriod = (p, tenantId, month, year) => p.tenant_id === tenantId && Number(p.month) === Number(month) && Number(p.year) === Number(year);

function enrich(p, d) {
  if (!p) return null;
  const tenant = d.tenants.find((x) => x.id === p.tenant_id);
  const property = tenant && d.properties.find((x) => x.id === tenant.property_id);
  return {
    ...p,
    tenant_name: tenant?.name || null,
    tenant_cnic: tenant?.cnic || null,
    property_name: property?.name || null,
    custom_charges: Array.isArray(p.custom_charges) ? p.custom_charges : []
  };
}

/**
 * The server is the single source of truth for what was received:
 *  1. an explicit amountPaid wins (0 <= amount <= total)
 *  2. else status "paid" => total, "unpaid" => 0, "partial" without an amount is rejected
 *  3. else explicit per-charge received flags (legacy clients) - missing flag = NOT received
 *  4. else nothing was received (fail-closed)
 * The stored status is always derived from the resulting amounts.
 */
function resolveAmounts(data, total, charges) {
  let paid;
  const explicit = data.amountPaid;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    paid = toMoney(explicit);
    if (Number(explicit) < 0) throw httpError('Amount paid cannot be negative');
    if (paid > total) throw httpError('Amount paid cannot be greater than the total amount due');
  } else if (data.status === 'paid') paid = total;
  else if (data.status === 'unpaid') paid = 0;
  else if (data.status === 'partial') throw httpError('Enter the amount received for a partial payment');
  else if (charges.some((c) => c.enabled !== undefined)) paid = receivedFromFlags(charges);
  else paid = 0;
  return { paid, status: statusFor(total, paid) };
}

function applyCharges(p, data) {
  const rent = toMoney(data.monthlyRent);
  const electricity = toMoney(data.electricity);
  const gas = toMoney(data.gas);
  const dues = toMoney(data.previousDues);
  const total = computeTotal({ rent, electricity, gas, previousDues: dues });
  const charges = [
    { value: rent, enabled: data.rentEnabled }, { value: electricity, enabled: data.electricityEnabled },
    { value: gas, enabled: data.gasEnabled }, { value: dues, enabled: data.previousDuesEnabled }
  ];
  const { paid, status } = resolveAmounts(data, total, charges);
  Object.assign(p, {
    monthly_rent: rent, electricity, gas, previous_dues: dues,
    total_payment: total, amount_paid: paid, status,
    custom_charges: Array.isArray(data.customCharges) ? data.customCharges.slice(0, 20) : (p.custom_charges || []),
    notes: data.notes || null,
    rent_enabled: data.rentEnabled !== false,
    electricity_enabled: data.electricityEnabled !== false,
    gas_enabled: data.gasEnabled !== false,
    previous_dues_enabled: data.previousDuesEnabled !== false,
    updated_at: now()
  });
  delete p.placeholder;
}

/** Monthly rent to pre-fill for a tenant: last recorded rent, else the room rent, else the property base rent. */
function defaultRent(d, tenant) {
  const last = d.payments
    .filter((p) => p.tenant_id === tenant.id && Number(p.monthly_rent) > 0)
    .sort((a, b) => Number(b.year) - Number(a.year) || Number(b.month) - Number(a.month))[0];
  if (last) return Number(last.monthly_rent);
  const room = d.rooms.find((r) => r.property_id === tenant.property_id && Number(r.room_number) === Number(tenant.room_number));
  const property = d.properties.find((x) => x.id === tenant.property_id);
  return toMoney(room?.rent_amount ?? property?.base_rent ?? 0);
}

class Payment {
  static enrich(p, d) { return enrich(p, d); }

  static async findAll(userId, filters = {}) {
    const d = await Drive.getData();
    return d.payments
      .filter((p) => p.user_id === userId
        && (!filters.month || Number(p.month) === Number(filters.month))
        && (!filters.year || Number(p.year) === Number(filters.year))
        && (!filters.tenantId || p.tenant_id === filters.tenantId))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((p) => enrich(p, d));
  }

  static async findById(id, userId) {
    const d = await Drive.getData();
    return enrich(d.payments.find((p) => p.id === id && p.user_id === userId), d);
  }

  static async create(data, userId) {
    if (!data.tenantId) throw httpError('Tenant ID is required');
    if (!data.month || data.month < 1 || data.month > 12) throw httpError('Month must be between 1 and 12');
    if (!data.year || data.year < 2000 || data.year > 2100) throw httpError('Year must be between 2000 and 2100');
    if (data.monthlyRent === undefined || Number(data.monthlyRent) < 0) throw httpError('Monthly rent must be a non-negative number');
    return Drive.mutate((d) => {
      if (d.payments.some((p) => p.user_id === userId && samePeriod(p, data.tenantId, data.month, data.year))) {
        throw httpError('Payment already exists for this tenant for this month/year');
      }
      const p = { id: data.id || newId(), user_id: userId, tenant_id: data.tenantId, month: Number(data.month), year: Number(data.year), created_at: now() };
      applyCharges(p, data);
      d.payments.push(p);
      return enrich(p, d);
    });
  }

  static async update(id, data, userId) {
    if (!data.tenantId) throw httpError('Tenant ID is required');
    if (!data.month || data.month < 1 || data.month > 12) throw httpError('Month must be between 1 and 12');
    if (!data.year || data.year < 2000 || data.year > 2100) throw httpError('Year must be between 2000 and 2100');
    if (data.monthlyRent === undefined || Number(data.monthlyRent) < 0) throw httpError('Monthly rent must be a non-negative number');
    return Drive.mutate((d) => {
      const p = d.payments.find((x) => x.id === id && x.user_id === userId);
      if (!p) throw httpError('Payment not found');
      if (d.payments.some((x) => x.id !== id && x.user_id === userId && samePeriod(x, data.tenantId, data.month, data.year))) {
        throw httpError('Payment already exists for this tenant for this month/year');
      }
      Object.assign(p, { tenant_id: data.tenantId, month: Number(data.month), year: Number(data.year) });
      applyCharges(p, data);
      return enrich(p, d);
    });
  }

  static async delete(id, userId) {
    return Drive.mutate((d) => {
      const p = d.payments.find((x) => x.id === id && x.user_id === userId);
      if (!p) throw httpError('Payment not found');
      d.payments = d.payments.filter((x) => x.id !== id);
      return p;
    });
  }

  static async clearAll(userId) {
    return Drive.mutate((d) => { d.payments = d.payments.filter((x) => x.user_id !== userId); });
  }

  static async findByTenant(tenantId, userId) {
    const d = await Drive.getData();
    return d.payments
      .filter((p) => p.tenant_id === tenantId && p.user_id === userId)
      .sort((a, b) => Number(b.year) - Number(a.year) || Number(b.month) - Number(a.month))
      .map((p) => enrich(p, d));
  }

  static async getMonthlySummary(year, month, userId) {
    const list = await this.findAll(userId, { year, month });
    const total = list.reduce((s, p) => s + (Number(p.total_payment) || 0), 0);
    const received = list.reduce((s, p) => s + (Number(p.amount_paid) || 0), 0);
    return {
      year, month, totalPayments: total, amountReceived: received, remainingBalance: Math.max(0, total - received),
      paymentCount: list.length,
      paidCount: list.filter((p) => p.status === 'paid').length,
      partialCount: list.filter((p) => p.status === 'partial').length,
      unpaidCount: list.filter((p) => p.status === 'unpaid').length,
      unbilledCount: list.filter((p) => p.status === 'unbilled').length
    };
  }

  static async getDashboardStats(userId) {
    const d = await Drive.getData();
    const list = d.payments.filter((p) => p.user_id === userId);
    const tenants = d.tenants.filter((t) => t.user_id === userId);
    const properties = d.properties.filter((p) => p.user_id === userId);
    const propertyIds = new Set(properties.map((p) => p.id));
    const occupiedRooms = d.rooms.filter((r) => propertyIds.has(r.property_id) && r.status === 'occupied').length;
    const { month, year } = UserSettings.periodFor(d);
    const current = list.filter((p) => Number(p.month) === month && Number(p.year) === year);
    const monthlyRevenue = current.reduce((s, p) => s + (p.amount_paid != null ? Number(p.amount_paid) : (p.status === 'paid' ? Number(p.total_payment || 0) : 0)), 0);
    const total = list.reduce((s, p) => s + (Number(p.total_payment) || 0), 0);
    const received = list.reduce((s, p) => s + (Number(p.amount_paid) || 0), 0);
    return {
      totalProperties: properties.length, totalTenants: tenants.length, occupiedRooms, monthlyRevenue,
      total_properties: properties.length, total_tenants: tenants.length, occupied_rooms: occupiedRooms, monthly_revenue: monthlyRevenue,
      totalPayments: total, amountReceived: received, remainingBalance: Math.max(0, total - received),
      paidPayments: list.filter((p) => p.status === 'paid').length,
      partialPayments: list.filter((p) => p.status === 'partial').length,
      unpaidPayments: list.filter((p) => p.status === 'unpaid').length,
      unbilledPayments: list.filter((p) => p.status === 'unbilled').length,
      period: { month, year }
    };
  }

  /**
   * Creates the current period's placeholder row for every active tenant that has
   * none. One read, at most one write, idempotent - safe to call repeatedly and
   * concurrently. (Previously this ran inside GET handlers, one write per tenant.)
   */
  static async rollover(userId, date = new Date()) {
    const missing = (d, month, year) => d.tenants.filter((t) => t.user_id === userId && t.status === 'active'
      && !d.payments.some((p) => p.user_id === userId && samePeriod(p, t.id, month, year)));
    const snapshot = await Drive.getData();
    const { month, year } = UserSettings.periodFor(snapshot, date);
    const markerCurrent = Number(snapshot.settings?.last_reset_month) === month && Number(snapshot.settings?.last_reset_year) === year;
    if (!missing(snapshot, month, year).length && markerCurrent) return { created: 0, month, year };
    return Drive.mutate((d) => {
      const todo = missing(d, month, year);
      for (const t of todo) {
        const rent = defaultRent(d, t);
        d.payments.push({
          id: `${t.id}-${year}-${month}`, user_id: userId, tenant_id: t.id, month, year,
          monthly_rent: rent, electricity: 0, gas: 0, previous_dues: 0,
          total_payment: rent, amount_paid: 0, status: statusFor(rent, 0), custom_charges: [], notes: null,
          rent_enabled: true, electricity_enabled: true, gas_enabled: true, previous_dues_enabled: true,
          placeholder: true, created_at: now(), updated_at: now()
        });
      }
      d.settings = { ...(d.settings || {}), user_id: userId, last_reset_month: month, last_reset_year: year };
      return { created: todo.length, month, year };
    });
  }
}
module.exports = Payment;
