/**
 * scripts/preview-payroll.js
 * ------------------------------------------------------------------
 * DRY RUN of the payroll engine against real database data.
 * Loads all active employees with their salaries, allowances and
 * deductions, computes a period, and prints a summary table.
 * Nothing is saved — this is what Stage 9 will persist in a run.
 *
 * Usage:
 *   node scripts/preview-payroll.js 2026 8
 *   (year month — defaults to current month)
 * ------------------------------------------------------------------
 */
const { connectDB, closeDB } = require('../src/config/database');
const { Op } = require('sequelize');
const { Employee, Salary, Allowance, EmployeeAllowance, Deduction, EmployeeDeduction } = require('../src/models');
const { getSetting, getSettingNumber, getSettingJson } = require('../src/utils/settings');
const { computeEmployeePay } = require('../src/services/payrollEngine');

function money(n) {
  return `GH₵ ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function main() {
  const year = parseInt(process.argv[2], 10) || new Date().getFullYear();
  const month = parseInt(process.argv[3], 10) || new Date().getMonth() + 1;
  const period = { year, month };
  const periodLabel = `${year}-${String(month).padStart(2, '0')}`;

  await connectDB();

  const settings = {
    ssnitRate: await getSettingNumber('ssnit.rate') ?? 5.5,
    ssnitCeilingAnnual: await getSettingNumber('ssnit.ceiling_annual') ?? 61000,
    payeBrackets: await getSettingJson('tax.paye_brackets') || [],
    taxMethod: (await getSetting('tax.method')) || 'ANNUALISED',
  };

  const employees = await Employee.findAll({ where: { employment_status: 'ACTIVE' }, order: [['employee_no', 'ASC']] });

  console.log(`\n=== KBK Payroll — DRY RUN for ${periodLabel} (${employees.length} active employees) ===`);
  console.log(`SSNIT rate ${settings.ssnitRate}% (ceiling ${money(settings.ssnitCeilingAnnual)}/yr) · PAYE method: ${settings.taxMethod}\n`);

  let gTot = 0, dTot = 0, nTot = 0;
  const table = [];

  for (const emp of employees) {
    const salary = await Salary.findOne({
      where: { employee_id: emp.id, effective_from: { [Op.lte]: `${year}-${String(month).padStart(2, '0')}-31` } },
      order: [['effective_from', 'DESC']],
    });
    if (!salary) {
      console.log(`  ${emp.employee_no} ${emp.last_name}: NO SALARY RECORD — skipped`);
      continue;
    }

    const [ea, ed] = await Promise.all([
      EmployeeAllowance.findAll({ where: { employee_id: emp.id }, include: [{ model: Allowance, as: 'allowance' }] }),
      EmployeeDeduction.findAll({ where: { employee_id: emp.id }, include: [{ model: Deduction, as: 'deduction' }] }),
    ]);

    const r = computeEmployeePay({
      basicSalary: salary.basic_salary,
      allowances: ea.map((a) => ({
        name: a.allowance.name, type: a.allowance.type,
        amount: a.amount, percent: a.percent,
        taxable: a.allowance.taxable, isActive: a.allowance.is_active,
      })),
      deductions: ed.map((d) => ({
        name: d.deduction.name, type: d.deduction.type,
        amount: d.amount, percent: d.percent,
        isStatutory: d.deduction.is_statutory, isActive: d.deduction.is_active,
        endMonth: d.end_month,
      })),
      period,
      settings,
    });

    gTot += Number(r.gross); dTot += Number(r.totalDeductions); nTot += Number(r.net);
    table.push({
      no: emp.employee_no, name: `${emp.first_name} ${emp.last_name}`.slice(0, 22),
      gross: r.gross, ssnit: r.ssnit, paye: r.paye, totalDed: r.totalDeductions, net: r.net, warn: r.warnings.join('; '),
    });
  }

  console.log('  EMP NO    NAME                   GROSS      SSNIT      PAYE     DEDUCTIONS   NET');
  for (const t of table) {
    console.log(
      `  ${t.no.padEnd(9)} ${t.name.padEnd(22)} ${money(t.gross).padStart(10)} ${money(t.ssnit).padStart(9)} ${money(t.paye).padStart(9)} ${money(t.totalDed).padStart(11)} ${money(t.net).padStart(10)}${t.warn ? '  ⚠ ' + t.warn : ''}`
    );
  }
  console.log(`\n  TOTALS                                ${money(gTot).padStart(10)}                                    ${money(dTot).padStart(11)} ${money(nTot).padStart(10)}`);
  console.log(`  Employees computed: ${table.length} · Warnings: ${table.filter((t) => t.warn).length}\n`);

  await closeDB();
}

main().catch((err) => { console.error(err); process.exit(1); });
