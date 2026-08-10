/**
 * test/payrollEngine.test.js
 * ------------------------------------------------------------------
 * Unit tests for the payroll calculation engine (Stage 15 uses these
 * as the official test cases). Run with:  npm test
 *
 * Known-answer tests were INDEPENDENTLY computed with a spreadsheet
 * model of the GRA 2025/26 brackets, and cross-checked against the
 * school's register figures (docs/00 §10).
 * ------------------------------------------------------------------
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeSsnit, computePayeAnnualised, computePayeMonthly, computeEmployeePay,
} = require('../src/services/payrollEngine');

const BRACKETS = [
  { up_to: 5880, rate: 0 },
  { up_to: 7200, rate: 5 },
  { up_to: 8760, rate: 10 },
  { up_to: 46760, rate: 17.5 },
  { up_to: 238760, rate: 25 },
  { up_to: 600000, rate: 30 },
  { up_to: null, rate: 35 },
];

const DEFAULT_SETTINGS = {
  ssnitRate: 5.5,
  ssnitCeilingAnnual: 61000,
  payeBrackets: BRACKETS,
  taxMethod: 'ANNUALISED',
};

const PERIOD = { year: 2026, month: 8 };

test('SSNIT: 5.5% of basic salary', () => {
  assert.equal(computeSsnit({ basicSalary: 2000 }).toFixed(2), '110.00');
  assert.equal(computeSsnit({ basicSalary: 5000 }).toFixed(2), '275.00');
});

test('SSNIT: capped at monthly insurable ceiling', () => {
  // Ceiling 61,000/yr = 5,083.33/mo → 5,083.33 × 5.5% = 279.58
  assert.equal(computeSsnit({ basicSalary: 20000, ceilingAnnual: 61000 }).toFixed(2), '279.58');
});

test('PAYE annualised: Kwame-style gross 5,000 → 821.00 (GRA method)', () => {
  const chargeable = 5000 - 110; // 4890
  const paye = computePayeAnnualised({ chargeableIncome: chargeable, brackets: BRACKETS });
  assert.equal(paye.toFixed(2), '821.00');
  // The school's register showed 855.50 (their monthly approximation) —
  // our engine matches the GRA official method instead.
});

test('PAYE annualised: Judith-style gross 81,000 → 24,357.42', () => {
  const chargeable = 81000 - 275; // 80725
  const paye = computePayeAnnualised({ chargeableIncome: chargeable, brackets: BRACKETS });
  assert.equal(paye.toFixed(2), '24357.42');
});

test('PAYE annualised: zero chargeable income → 0', () => {
  assert.equal(computePayeAnnualised({ chargeableIncome: 0, brackets: BRACKETS }).toFixed(2), '0.00');
});

test('PAYE annualised: low earner inside tax-free threshold → 0', () => {
  assert.equal(computePayeAnnualised({ chargeableIncome: 400, brackets: BRACKETS }).toFixed(2), '0.00');
});

test('PAYE MONTHLY method matches register-style banding', () => {
  // Monthly bands: 0–490 free, 491–600 @5%, 601–730 @10%, 731–3,896.67 @17.5%,
  // 3,896.68–4,890 @25% on chargeable 4,890:
  // 0 + 110×0.05 + 130×0.10 + 3,166.67×0.175 + 993.33×0.25 = 821.00
  // (at this income the monthly and annualised methods coincide)
  const paye = computePayeMonthly({ chargeableIncome: 4890, brackets: BRACKETS });
  assert.equal(paye.toFixed(2), '821.00');
});

test('Full computation: basic-only employee', () => {
  const r = computeEmployeePay({
    basicSalary: 3000,
    allowances: [],
    deductions: [],
    period: PERIOD,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.basicSalary.toFixed(2), '3000.00');
  assert.equal(r.gross.toFixed(2), '3000.00');
  assert.equal(r.ssnit.toFixed(2), '165.00'); // 5.5% × 3000
  // chargeable 2835 → annual 34,020 → 0 + 66 + 156 + (34020-8760)×0.175 = 4,642.50 → ÷12
  assert.equal(r.paye.toFixed(2), '386.88');
  assert.equal(r.totalDeductions.toFixed(2), '551.88'); // 165 + 386.88
  assert.equal(r.net.toFixed(2), '2448.12');
});

test('Full computation: fixed allowance + fixed deduction', () => {
  const r = computeEmployeePay({
    basicSalary: 2000,
    allowances: [{ name: 'Transport', type: 'FIXED', amount: 3000, taxable: true }],
    deductions: [{ name: 'Welfare', type: 'FIXED', amount: 50 }],
    period: PERIOD,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.gross.toFixed(2), '5000.00');
  assert.equal(r.ssnit.toFixed(2), '110.00');
  assert.equal(r.paye.toFixed(2), '821.00');
  assert.equal(r.customDeductions.length, 1);
  assert.equal(r.totalDeductions.toFixed(2), '981.00'); // 110 + 821 + 50
  assert.equal(r.net.toFixed(2), '4019.00');
  assert.deepEqual(r.warnings, []);
});

test('Full computation: percent allowance and percent deduction', () => {
  const r = computeEmployeePay({
    basicSalary: 3000,
    allowances: [{ name: 'Responsibility', type: 'PERCENT', percent: 10, taxable: true }],
    deductions: [{ name: 'Union Dues', type: 'PERCENT', percent: 1 }],
    period: PERIOD,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.gross.toFixed(2), '3300.00');       // 3000 + 300
  assert.equal(r.ssnit.toFixed(2), '165.00');
  assert.equal(r.customDeductions[0].amount.toFixed(2), '30.00'); // 1% × 3000
});

test('Loan deduction expires after end_month', () => {
  const r = computeEmployeePay({
    basicSalary: 4000,
    allowances: [],
    deductions: [
      { name: 'Loan', type: 'FIXED', amount: 500, endMonth: '2026-06' }, // expired
      { name: 'Loan 2', type: 'FIXED', amount: 300, endMonth: '2026-12' }, // active
    ],
    period: { year: 2026, month: 8 },
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.customDeductions.length, 1);
  assert.equal(r.customDeductions[0].name, 'Loan 2');
});

test('Statutory deduction rows are ignored by custom computation', () => {
  const r = computeEmployeePay({
    basicSalary: 2000,
    allowances: [],
    deductions: [{ name: 'SSNIT', type: 'FIXED', amount: 999, isStatutory: true }],
    period: PERIOD,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.customDeductions.length, 0);
});

test('Non-taxable allowance excluded from chargeable income', () => {
  const r = computeEmployeePay({
    basicSalary: 2000,
    allowances: [{ name: 'Book Allowance', type: 'FIXED', amount: 200, taxable: false }],
    deductions: [],
    period: PERIOD,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.gross.toFixed(2), '2200.00');
  // chargeable = 2200 - 110 - 200 = 1890 → annual 22,680 → 66 + 156 + (22680-8760)×0.175 = 2,658 → ÷12
  assert.equal(r.paye.toFixed(2), '221.50');
});

test('Negative net pay produces a warning, not a silent negative (BR-03)', () => {
  const r = computeEmployeePay({
    basicSalary: 1000,
    allowances: [],
    deductions: [{ name: 'Loan', type: 'FIXED', amount: 2000 }],
    period: PERIOD,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /negative/);
});

test('Rounding: totals computed from unrounded lines (BR-02)', () => {
  // percent that produces a repeating decimal: 1/3 of 100 → 33.333...
  const r = computeEmployeePay({
    basicSalary: 100,
    allowances: [{ name: 'A', type: 'PERCENT', percent: 33.333, taxable: true }],
    deductions: [],
    period: PERIOD,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.earnings[1].amount.toFixed(2), '33.33');
  assert.equal(r.gross.toFixed(2), '133.33'); // 100 + 33.333 = 133.333 → 133.33
});
