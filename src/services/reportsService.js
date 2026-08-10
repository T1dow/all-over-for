/**
 * src/services/reportsService.js
 * ------------------------------------------------------------------
 * Report data aggregation (FR-44..FR-48):
 *   - periodSummary(runId)      per-employee rows for a payroll run
 *   - departmentalReport(runId) totals grouped by department
 *   - remittanceReport(runId)   SSNIT + PAYE + custom deduction totals
 *                               (supports GRA/SSNIT filing)
 *   - employeeHistory(empId)    all payslips for one employee
 *   - dashboardStats()          totals by month + department cost
 *
 * Everything is read from STORED payslip values (NFR-INTEG-02) —
 * reports always match the payslips.
 * ------------------------------------------------------------------
 */
const { Op } = require('sequelize');
const {
  Payslip, PayrollRun, Employee, Department, PayslipLine, EmailNotification,
} = require('../models');

const money = (n) => Number(n);

/** Per-employee rows for a run (join department via employee). */
async function periodSummary(runId) {
  const run = await PayrollRun.findByPk(runId);
  if (!run) return null;
  const payslips = await Payslip.findAll({
    where: { run_id: runId },
    include: [
      { model: Employee, as: 'employee', attributes: ['employee_no', 'first_name', 'last_name', 'position', 'department_id'] },
    ],
    order: [['reference', 'ASC']],
  });
  // Batch-load departments to avoid N+1
  const deptIds = [...new Set(payslips.map((p) => p.employee.department_id).filter(Boolean))];
  const depts = await Department.findAll({ where: { id: { [Op.in]: deptIds } } });
  const deptMap = Object.fromEntries(depts.map((d) => [d.id, d.name]));

  const rows = payslips.map((p) => ({
    reference: p.reference,
    employeeNo: p.employee.employee_no,
    name: `${p.employee.first_name} ${p.employee.last_name}`,
    department: deptMap[p.employee.department_id] || '—',
    position: p.employee.position,
    basic: money(p.basic_salary),
    gross: money(p.gross),
    ssnit: money(p.ssnit_amount),
    paye: money(p.paye_amount),
    totalDeductions: money(p.total_deductions),
    net: money(p.net),
  }));
  return { run, rows };
}

/** Totals grouped by department. */
async function departmentalReport(runId) {
  const summary = await periodSummary(runId);
  if (!summary) return null;
  const byDept = {};
  for (const r of summary.rows) {
    if (!byDept[r.department]) {
      byDept[r.department] = { department: r.department, employees: 0, gross: 0, ssnit: 0, paye: 0, deductions: 0, net: 0 };
    }
    const d = byDept[r.department];
    d.employees += 1;
    d.gross += r.gross; d.ssnit += r.ssnit; d.paye += r.paye;
    d.deductions += r.totalDeductions; d.net += r.net;
  }
  const rows = Object.values(byDept).sort((a, b) => b.net - a.net);
  const totals = rows.reduce((acc, d) => {
    acc.employees += d.employees; acc.gross += d.gross; acc.ssnit += d.ssnit;
    acc.paye += d.paye; acc.deductions += d.deductions; acc.net += d.net;
    return acc;
  }, { employees: 0, gross: 0, ssnit: 0, paye: 0, deductions: 0, net: 0 });
  return { run: summary.run, rows, totals };
}

/** Remittance (statutory) totals: SSNIT + PAYE + custom deduction groups. */
async function remittanceReport(runId) {
  const summary = await periodSummary(runId);
  if (!summary) return null;
  const ssnit = summary.rows.reduce((s, r) => s + r.ssnit, 0);
  const paye = summary.rows.reduce((s, r) => s + r.paye, 0);

  // Group custom deductions by line name (from payslip_lines of this run)
  const payslipIds = (await Payslip.findAll({ where: { run_id: runId }, attributes: ['id'] })).map((p) => p.id);
  const lines = await PayslipLine.findAll({
    where: { payslip_id: { [Op.in]: payslipIds }, line_type: 'DEDUCTION' },
    attributes: ['name', 'amount'],
  });
  const custom = {};
  for (const l of lines) {
    if (l.name.startsWith('SSNIT') || l.name.startsWith('PAYE')) continue;
    custom[l.name] = (custom[l.name] || 0) + Number(l.amount);
  }

  return {
    run: summary.run,
    ssnit,
    paye,
    custom: Object.entries(custom).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
    totalStatutory: ssnit + paye,
    grandTotal: ssnit + paye + Object.values(custom).reduce((a, b) => a + b, 0),
  };
}

/** All payslips for one employee (with run info). */
async function employeeHistory(employeeId) {
  const employee = await Employee.findByPk(employeeId, {
    include: [{ model: Department, as: 'department', attributes: ['name'] }],
  });
  if (!employee) return null;
  const payslips = await Payslip.findAll({
    where: { employee_id: employeeId },
    include: [{ model: PayrollRun, as: 'run', attributes: ['period_year', 'period_month', 'pay_date', 'status'] }],
    order: [['run_id', 'DESC']],
  });
  const rows = payslips.map((p) => ({
    reference: p.reference,
    period: `${p.run.period_year}-${String(p.run.period_month).padStart(2, '0')}`,
    payDate: p.run.pay_date,
    gross: money(p.gross),
    ssnit: money(p.ssnit_amount),
    paye: money(p.paye_amount),
    totalDeductions: money(p.total_deductions),
    net: money(p.net),
    status: p.run.status,
  }));
  return { employee, rows };
}

/** Dashboard stats: last 12 months totals + department cost + counts. */
async function dashboardStats() {
  const runs = await PayrollRun.findAll({ order: [['period_year', 'ASC'], ['period_month', 'ASC']] });
  const byMonth = runs.reduce((acc, r) => {
    const key = `${r.period_year}-${String(r.period_month).padStart(2, '0')}`;
    acc[key] = { gross: Number(r.gross_total), net: Number(r.net_total), employees: r.employee_count, runs: (acc[key]?.runs || 0) + 1 };
    return acc;
  }, {});

  const deptRows = await departmentalReportOfLatestRun();
  const latestRun = runs[runs.length - 1] || null;

  const [employeeCount, activeCount, notificationSummary] = await Promise.all([
    Employee.count(),
    Employee.count({ where: { employment_status: 'ACTIVE' } }),
    EmailNotification.findAll({
      attributes: ['status', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
      group: ['status'], raw: true,
    }),
  ]);
  const notif = { PENDING: 0, SENT: 0, FAILED: 0, RETRYING: 0 };
  for (const n of notificationSummary) notif[n.status] = Number(n.count);

  return { byMonth, deptRows, latestRun, employeeCount, activeCount, notif, runCount: runs.length };
}

async function departmentalReportOfLatestRun() {
  const latest = await PayrollRun.findOne({ order: [['period_year', 'DESC'], ['period_month', 'DESC'], ['run_number', 'DESC']] });
  if (!latest) return [];
  const report = await departmentalReport(latest.id);
  return report ? report.rows : [];
}

module.exports = {
  periodSummary, departmentalReport, remittanceReport, employeeHistory, dashboardStats,
};
