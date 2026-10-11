'use strict';
/** Pure payment arithmetic shared by the model, the importer and the tests. */

const MAX_MONEY = 1e9; // 1 billion: far above any real rent, far below float precision loss
const CENT = 100;

const toMoney = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * CENT) / CENT;
};

function computeTotal({ rent = 0, electricity = 0, gas = 0, previousDues = 0 } = {}) {
  return Math.round((toMoney(rent) + toMoney(electricity) + toMoney(gas) + toMoney(previousDues)) * CENT) / CENT;
}

/** Status derives from how much of the total was actually received. */
function statusFor(total, paid) {
  const t = toMoney(total);
  const p = toMoney(paid);
  if (t <= 0) return 'unbilled';
  if (p >= t) return 'paid';
  if (p > 0) return 'partial';
  return 'unpaid';
}

/**
 * Legacy checkbox semantics (used only when a client sends per-charge
 * "received" flags without an explicit amount): a charge counts as received
 * when its flag is exactly true. Missing flags are NOT treated as received
 * (fail-closed), unlike the previous implementation.
 */
function receivedFromFlags(charges) {
  return Math.round(
    charges.reduce((sum, c) => sum + (toMoney(c.value) > 0 && c.enabled === true ? toMoney(c.value) : 0), 0) * CENT
  ) / CENT;
}


function outstandingBalance(payment) {
  if (!payment) return 0;
  const total = toMoney(payment.total_payment ?? computeTotal({
    rent: payment.monthly_rent, electricity: payment.electricity, gas: payment.gas, previousDues: payment.previous_dues
  }));
  const paid = payment.amount_paid != null
    ? toMoney(payment.amount_paid)
    : (payment.status === 'paid' ? total : 0);
  return toMoney(Math.max(0, total - Math.min(total, paid)));
}

/** Carries the latest earlier period's unpaid balance into the new period. */
function previousPeriodDues(data, tenantId, month, year) {
  const period = Number(year) * 12 + Number(month);
  const previous = (Array.isArray(data?.payments) ? data.payments : [])
    .filter((p) => p.tenant_id === tenantId && (Number(p.year) * 12 + Number(p.month)) < period)
    .sort((a, b) => Number(b.year) - Number(a.year) || Number(b.month) - Number(a.month))[0];
  return outstandingBalance(previous);
}

module.exports = { MAX_MONEY, toMoney, computeTotal, statusFor, receivedFromFlags, outstandingBalance, previousPeriodDues };
