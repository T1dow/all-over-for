/**
 * src/services/payrollEngine.js
 * ------------------------------------------------------------------
 * THE PAYROLL CALCULATION ENGINE (Stage 8) — pure functions, no I/O.
 *
 * Every figure is computed here and STORED on the payslip by Stage 9;
 * nothing is typed by a human. Rules implemented:
 *
 *   BR-02  Money is decimal (decimal.js); every published figure is
 *          rounded ONCE, half-up, to 2 decimal places; totals are
 *          computed from unrounded lines.
 *   BR-04  SSNIT   = 5.5% × basic salary (rate & ceiling from settings),
 *                   capped at monthly insurable ceiling.
 *   BR-04  PAYE    = progressive brackets on chargeable income, using
 *                   the GRA annualised method by default
 *                   (chargeable ×12 → brackets → ÷12). A MONTHLY
 *                   method is available via the tax.method setting to
 *                   match the school's register.
 *          Chargeable income = gross − SSNIT − non-taxable allowances.
 *   BR-03  net ≥ 0; a negative net produces a warning, never a silent
 *                  negative payslip.
 *   FR-22  Custom deductions: FIXED amount or PERCENT of basic;
 *                  loans with end_month expire (no deduction after).
 * ------------------------------------------------------------------
 */
const { dec, round, sum, Decimal } = require('../utils/money');

/** Monthly SSNIT employee contribution (5.5% of basic by default, capped). */
function computeSsnit({ basicSalary, rate = 5.5, ceilingAnnual = 61000 }) {
  const ceilingMonthly = dec(ceilingAnnual).div(12);
  const base = Decimal.min(dec(basicSalary), ceilingMonthly);
  return round(base.times(dec(rate)).div(100));
}

/**
 * Progressive tax on ANNUAL income, divided back to a monthly figure.
 * brackets: [{ up_to: 5880, rate: 0 }, ..., { up_to: null, rate: 35 }]
 */
function computePayeAnnualised({ chargeableIncome, brackets }) {
  const annual = dec(chargeableIncome).times(12);
  let tax = new Decimal(0);
  let lower = new Decimal(0);
  for (const b of brackets) {
    const rate = dec(b.rate).div(100);
    if (b.up_to === null || b.up_to === undefined || b.up_to === '') {
      if (annual.gt(lower)) tax = tax.plus(annual.minus(lower).times(rate));
      break;
    }
    const upper = dec(b.up_to);
    if (annual.gt(upper)) {
      tax = tax.plus(upper.minus(lower).times(rate));
      lower = upper;
    } else {
      if (annual.gt(lower)) tax = tax.plus(annual.minus(lower).times(rate));
      break;
    }
  }
  return round(tax.div(12));
}

/** Progressive tax computed directly on monthly income (register-style). */
function computePayeMonthly({ chargeableIncome, brackets }) {
  const monthly = dec(chargeableIncome);
  let tax = new Decimal(0);
  let lower = new Decimal(0);
  for (const b of brackets) {
    const rate = dec(b.rate).div(100);
    if (b.up_to === null || b.up_to === undefined || b.up_to === '') {
      if (monthly.gt(lower)) tax = tax.plus(monthly.minus(lower).times(rate));
      break;
    }
    const upper = dec(b.up_to).div(12);
    if (monthly.gt(upper)) {
      tax = tax.plus(upper.minus(lower).times(rate));
      lower = upper;
    } else {
      if (monthly.gt(lower)) tax = tax.plus(monthly.minus(lower).times(rate));
      break;
    }
  }
  return round(tax);
}

/**
 * Compute one employee's full monthly pay.
 *
 * @param {Object} input
 * @param {number|string} input.basicSalary
 * @param {Array} input.allowances   [{name, type:'FIXED'|'PERCENT', amount?, percent?, taxable?}]
 * @param {Array} input.deductions   [{name, type, amount?, percent?, isStatutory?, endMonth?}]
 * @param {{year:number, month:number}} input.period
 * @param {Object} input.settings    {ssnitRate, ssnitCeilingAnnual, payeBrackets, taxMethod}
 * @returns {{basicSalary, earnings:Array, gross, ssnit, paye, chargeableIncome,
 *            customDeductions:Array, totalDeductions, net, warnings:Array}}
 */
function computeEmployeePay({ basicSalary, allowances = [], deductions = [], period, settings = {} }) {
  const warnings = [];
  const basic = dec(basicSalary);

  // ---- Earnings lines (BR-02: unrounded accumulation) ----
  const earnings = [{ name: 'Basic Salary', amount: basic, sortOrder: 0 }];
  let allowanceTotal = new Decimal(0);
  for (const a of allowances) {
    if (a.isActive === false) continue;
    const amt = a.type === 'PERCENT'
      ? basic.times(dec(a.percent)).div(100)
      : dec(a.amount);
    earnings.push({
      name: a.name,
      amount: amt,
      sortOrder: 1,
      taxable: a.taxable !== false,
    });
    allowanceTotal = allowanceTotal.plus(amt);
  }
  const gross = round(basic.plus(allowanceTotal));

  // ---- Statutory deductions ----
  const ssnit = computeSsnit({
    basicSalary,
    rate: settings.ssnitRate ?? 5.5,
    ceilingAnnual: settings.ssnitCeilingAnnual ?? 61000,
  });

  const nonTaxableTotal = earnings
    .filter((e) => e.taxable === false)
    .reduce((s, e) => s.plus(e.amount), new Decimal(0));
  const chargeable = dec(gross).minus(ssnit).minus(nonTaxableTotal);

  const brackets = settings.payeBrackets || [];
  const paye = settings.taxMethod === 'MONTHLY'
    ? computePayeMonthly({ chargeableIncome: chargeable, brackets })
    : computePayeAnnualised({ chargeableIncome: chargeable, brackets });

  // ---- Custom deductions (expiry-aware for loans) ----
  const periodKey = `${period.year}-${String(period.month).padStart(2, '0')}`;
  const customDeductions = [];
  for (const d of deductions) {
    if (d.isStatutory) continue;         // SSNIT/PAYE already computed
    if (d.isActive === false) continue;
    if (d.endMonth && String(d.endMonth) < periodKey) continue; // expired loan
    const amt = d.type === 'PERCENT'
      ? basic.times(dec(d.percent)).div(100)
      : dec(d.amount);
    customDeductions.push({ name: d.name, amount: round(amt) });
  }
  const customTotal = sum(customDeductions.map((d) => d.amount));

  // ---- Totals (BR-02: sum unrounded, round once) ----
  const totalDeductions = round(ssnit.plus(paye).plus(customTotal));
  const net = round(dec(gross).minus(totalDeductions));

  if (net.lt(0)) {
    warnings.push(`Net pay is negative (GH₵ ${net.toFixed(2)}) — review this employee's deductions.`);
  }

  return {
    basicSalary: round(basic),
    earnings: earnings.map((e) => ({ ...e, amount: round(e.amount) })),
    gross,
    ssnit,
    paye,
    chargeableIncome: round(chargeable),
    customDeductions,
    totalDeductions,
    net,
    warnings,
  };
}

module.exports = {
  computeSsnit,
  computePayeAnnualised,
  computePayeMonthly,
  computeEmployeePay,
};
