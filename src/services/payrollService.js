/**
 * src/services/payrollService.js
 * ------------------------------------------------------------------
 * Payroll PROCESSING (Stage 9) — the transactional core.
 *
 * Business rules enforced here:
 *   BR-01  DUPLICATE PREVENTION — a period can only be processed once.
 *          Any second attempt is blocked with "Payroll for {period}
 *          already exists" and audit-logged. Re-processing requires an
 *          ADMINISTRATOR OVERRIDE (payroll.override) which creates a
 *          NEW run with run_number+1 and a recorded reason — original
 *          records are never overwritten.
 *   BR-03  Negative net pay aborts the whole run (transaction rollback)
 *          with the offending employee(s) named — nothing is saved.
 *   BR-06  Every payslip gets a unique reference PS-YYYYMM-XXXXX,
 *          never reused, even across reruns.
 *   NFR-REL-01  The entire run is ONE database transaction: either the
 *          whole period is recorded, or nothing is.
 *   FR-13  Only ACTIVE employees are included; employees without a
 *          salary record are skipped and reported (not silently paid).
 * ------------------------------------------------------------------
 */
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const {
  PayrollRun, Payslip, PayslipLine, Employee, Salary, EmployeeAllowance,
  EmployeeDeduction, Allowance, Deduction,
} = require('../models');
const { computeEmployeePay } = require('./payrollEngine');
const { getSetting, getSettingNumber, getSettingJson } = require('../utils/settings');
const { dec } = require('../utils/money');
const audit = require('./auditService');

class PayrollError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const pad = (n) => String(n).padStart(2, '0');

/** Load statutory/school payroll settings (rates are DATA, not code). */
async function loadPayrollSettings() {
  return {
    ssnitRate: (await getSettingNumber('ssnit.rate')) ?? 5.5,
    ssnitCeilingAnnual: (await getSettingNumber('ssnit.ceiling_annual')) ?? 61000,
    payeBrackets: (await getSettingJson('tax.paye_brackets')) || [],
    taxMethod: (await getSetting('tax.method')) || 'ANNUALISED',
  };
}

/** Highest reference sequence used so far for a period key (BR-06). */
async function maxReferenceSeq(periodKey, tx) {
  const rows = await Payslip.findAll({
    where: { reference: { [Op.like]: `PS-${periodKey}-%` } },
    attributes: ['reference'],
    transaction: tx,
  });
  let max = 0;
  for (const r of rows) {
    const m = r.reference.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

/**
 * Process a payroll period for all active employees.
 * @param {{year:number, month:number, payDate?:string, actor:Object,
 *          override?: {rerunOfId:number, reason:string, runNumber:number}}} params
 */
async function processPeriod({ year, month, payDate, actor, override = null }) {
  // ---- Basic validation ----
  if (!year || !month || month < 1 || month > 12) throw new PayrollError('Select a valid year and month (1–12).', 'INVALID');
  const now = new Date();
  if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) {
    throw new PayrollError('Cannot process a future period.', 'FUTURE');
  }
  const periodKey = `${year}${pad(month)}`; // e.g. 202607 (for references)
  const periodLabel = `${year}-${pad(month)}`; // e.g. 2026-07 (for messages)

  const result = await sequelize.transaction(async (tx) => {
    // ---- BR-01: duplicate prevention (bypassed ONLY by an authorized
    // administrator override, which creates a NEW numbered run) ----
    if (!override) {
      const existing = await PayrollRun.findOne({
        where: { period_year: year, period_month: month },
        transaction: tx,
      });
      if (existing) {
        await audit.log({
          userId: actor.id, userEmail: actor.email,
          action: 'PAYROLL_DUPLICATE_BLOCKED', entityType: 'PAYROLL_RUN', entityId: existing.id,
          detail: { period: periodLabel, runNumber: existing.run_number, status: existing.status },
          ip: actor.ip,
        });
        throw new PayrollError(
          `Payroll for ${periodLabel} already exists (run #${existing.run_number}, status ${existing.status}). Re-processing requires an administrator override.`,
          'DUPLICATE',
        );
      }
    }

    // ---- Load active employees (FR-13) ----
    const employees = await Employee.findAll({
      where: { employment_status: 'ACTIVE' },
      order: [['employee_no', 'ASC']],
      transaction: tx,
    });
    if (!employees.length) throw new PayrollError('No active employees to process.', 'NO_EMPLOYEES');

    const settings = await loadPayrollSettings();
    const period = { year, month };
    const defaultPayDate = payDate || `${year}-${pad(month)}-${pad(await getSettingNumber('payroll.pay_date') || 25)}`;

    // ---- Create the run (PROCESSED = computed & reviewable) ----
    const run = await PayrollRun.create({
      period_year: year,
      period_month: month,
      run_number: override ? override.runNumber : 1,
      status: 'PROCESSED',
      pay_date: defaultPayDate,
      gross_total: 0,
      deduction_total: 0,
      net_total: 0,
      employee_count: 0,
      processed_by: actor.id,
      processed_at: new Date(),
      rerun_of_id: override ? override.rerunOfId : null,
      rerun_reason: override ? override.reason : null,
    }, { transaction: tx });

    let seq = await maxReferenceSeq(periodKey, tx);
    let grossTotal = dec(0), dedTotal = dec(0), netTotal = dec(0), count = 0;
    const skipped = [];

    for (const emp of employees) {
      // Latest salary effective on or before the last day of the period (FR-21)
      const salary = await Salary.findOne({
        where: { employee_id: emp.id, effective_from: { [Op.lte]: `${year}-${pad(month)}-31` } },
        order: [['effective_from', 'DESC']],
        transaction: tx,
      });
      if (!salary) { skipped.push(emp.employee_no); continue; }

      const [ea, ed] = await Promise.all([
        EmployeeAllowance.findAll({
          where: { employee_id: emp.id },
          include: [{ model: Allowance, as: 'allowance' }],
          transaction: tx,
        }),
        EmployeeDeduction.findAll({
          where: { employee_id: emp.id },
          include: [{ model: Deduction, as: 'deduction' }],
          transaction: tx,
        }),
      ]);

      const computed = computeEmployeePay({
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

      // ---- BR-03: negative net aborts the entire run ----
      if (computed.warnings.length) {
        throw new PayrollError(
          `Employee ${emp.employee_no} (${emp.first_name} ${emp.last_name}): ${computed.warnings[0]}`,
          'NEGATIVE_NET',
        );
      }

      // ---- Store the payslip snapshot (NFR-INTEG-02) ----
      seq += 1;
      const reference = `PS-${periodKey}-${String(seq).padStart(5, "0")}`;
      const payslip = await Payslip.create({
        run_id: run.id,
        employee_id: emp.id,
        reference,
        basic_salary: computed.basicSalary.toFixed(2),
        gross: computed.gross.toFixed(2),
        ssnit_amount: computed.ssnit.toFixed(2),
        paye_amount: computed.paye.toFixed(2),
        total_deductions: computed.totalDeductions.toFixed(2),
        net: computed.net.toFixed(2),
        days_paid: 'FULL',
        status: 'PROCESSED',
      }, { transaction: tx });

      const lines = [
        ...computed.earnings.map((e, i) => ({
          payslip_id: payslip.id, line_type: 'EARNING', name: e.name, amount: e.amount.toFixed(2), sort_order: i,
        })),
        { payslip_id: payslip.id, line_type: 'DEDUCTION', name: 'SSNIT (Employee)', amount: computed.ssnit.toFixed(2), sort_order: 0 },
        { payslip_id: payslip.id, line_type: 'DEDUCTION', name: 'PAYE Income Tax', amount: computed.paye.toFixed(2), sort_order: 1 },
        ...computed.customDeductions.map((d, i) => ({
          payslip_id: payslip.id, line_type: 'DEDUCTION', name: d.name, amount: d.amount.toFixed(2), sort_order: i + 2,
        })),
      ];
      await PayslipLine.bulkCreate(lines, { transaction: tx });

      grossTotal = grossTotal.plus(computed.gross);
      dedTotal = dedTotal.plus(computed.totalDeductions);
      netTotal = netTotal.plus(computed.net);
      count += 1;
    }

    if (count === 0) throw new PayrollError('No active employees have a salary record — nothing to process.', 'NO_SALARIES');

    // ---- Finalise the run's totals from STORED values ----
    run.gross_total = grossTotal.toFixed(2);
    run.deduction_total = dedTotal.toFixed(2);
    run.net_total = netTotal.toFixed(2);
    run.employee_count = count;
    await run.save({ transaction: tx });

    await audit.log({
      userId: actor.id, userEmail: actor.email,
      action: override ? 'PAYROLL_RERUN_PROCESSED' : 'PAYROLL_PROCESSED',
      entityType: 'PAYROLL_RUN', entityId: run.id,
      detail: {
        period: periodLabel, runNumber: run.run_number, employees: count, skipped,
        gross: run.gross_total, net: run.net_total,
        ...(override ? { rerunOf: override.rerunOfId, reason: override.reason } : {}),
      },
      ip: actor.ip,
    });

    return { run, count, skipped };
  });

  return result;
}

/** Finalise (lock) a processed run — one-way door (BR-07). */
async function finalise(runId, actor) {
  const run = await PayrollRun.findByPk(runId);
  if (!run) throw new PayrollError('Payroll run not found.', 'NOT_FOUND');
  if (run.status === 'FINALISED') throw new PayrollError('This run is already finalised.', 'ALREADY');
  run.status = 'FINALISED';
  run.finalised_by = actor.id;
  run.finalised_at = new Date();
  await run.save();
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'PAYROLL_FINALISED', entityType: 'PAYROLL_RUN', entityId: run.id,
    detail: { period: `${run.period_year}-${pad(run.period_month)}`, runNumber: run.run_number },
    ip: actor.ip,
  });

  // FR-34: finalising a run queues one PENDING email notification per
  // payslip (PDFs generated on demand by the dispatcher).
  try {
    const { createNotificationsForRun } = require('./notificationService');
    await createNotificationsForRun(run.id, actor);
  } catch (err) {
    // Notification queueing must never roll back the finalisation.
    console.error('[payroll] failed to queue notifications:', err.message);
  }
  return run;
}

/** Administrator override: rerun a period as a NEW numbered run (BR-01). */
async function rerun(runId, reason, actor) {
  const existing = await PayrollRun.findByPk(runId);
  if (!existing) throw new PayrollError('Payroll run not found.', 'NOT_FOUND');
  if (!reason || !String(reason).trim()) throw new PayrollError('A reason is required for a re-run.', 'REASON');

  const maxRun = await PayrollRun.max('run_number', {
    where: { period_year: existing.period_year, period_month: existing.period_month },
  });

  return processPeriod({
    year: existing.period_year,
    month: existing.period_month,
    payDate: existing.pay_date,
    actor,
    override: { rerunOfId: existing.id, reason: String(reason).trim(), runNumber: maxRun + 1 },
  });
}

/** Payroll history (newest first). */
async function listRuns() {
  return PayrollRun.findAll({
    include: [{ model: require('../models').User, as: 'processor', attributes: ['name'] }],
    order: [['period_year', 'DESC'], ['period_month', 'DESC'], ['run_number', 'DESC']],
  });
}

/** Run detail with its payslips. */
async function getRunDetail(runId) {
  const run = await PayrollRun.findByPk(runId, {
    include: [
      { model: require('../models').User, as: 'processor', attributes: ['name'] },
      { model: require('../models').User, as: 'finaliser', attributes: ['name'] },
    ],
  });
  if (!run) return null;
  const payslips = await Payslip.findAll({
    where: { run_id: run.id },
    include: [{ model: Employee, as: 'employee', attributes: ['employee_no', 'first_name', 'last_name', 'position', 'department_id'] }],
    order: [['reference', 'ASC']],
  });
  return { run, payslips };
}

module.exports = { processPeriod, finalise, rerun, listRuns, getRunDetail, PayrollError };
