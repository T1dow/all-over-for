/**
 * src/services/salaryService.js
 * ------------------------------------------------------------------
 * Salary history & employee assignment management (FR-16..FR-21):
 *  - set/update basic salary with effective dating (FR-16, FR-21)
 *  - assign allowances to employees (FR-18)
 *  - assign custom deductions (loans with end months) (FR-20)
 *  - query helpers the payroll engine will reuse (Stage 8)
 *
 * The engine picks, per period, the latest salary with
 * effective_from <= period start — one query, no temporal mess.
 * ------------------------------------------------------------------
 */
const { Op } = require('sequelize');
const {
  Salary, Allowance, Deduction, EmployeeAllowance, EmployeeDeduction,
} = require('../models');
const audit = require('./auditService');

class SalaryValidationError extends Error {
  constructor(message) { super(message); }
}

/* ------------------------- Basic salary ------------------------ */

/** Set a new basic salary (new row = history preserved). */
async function setBasicSalary(employeeId, { basic_salary, effective_from, note }, actor) {
  const amount = Number(basic_salary);
  if (!Number.isFinite(amount) || amount < 0) throw new SalaryValidationError('Basic salary must be a positive amount.');
  if (!effective_from) throw new SalaryValidationError('Effective date is required.');

  // A new salary must not overlap an existing one with the same start date.
  const existing = await Salary.findOne({ where: { employee_id: employeeId, effective_from } });
  if (existing) throw new SalaryValidationError('A salary record already exists for this effective date.');

  const salary = await Salary.create({ employee_id: employeeId, basic_salary: amount, effective_from, note });
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'SALARY_SET', entityType: 'SALARY', entityId: salary.id,
    detail: { employee_id: employeeId, amount, effective_from },
    ip: actor.ip,
  });
  return salary;
}

/** Current salary for an employee (latest effective_from <= date). */
async function currentSalary(employeeId, asOf = new Date()) {
  return Salary.findOne({
    where: { employee_id: employeeId, effective_from: { [Op.lte]: asOf } },
    order: [['effective_from', 'DESC']],
  });
}

/** Full salary history (newest first). */
async function salaryHistory(employeeId) {
  return Salary.findAll({
    where: { employee_id: employeeId },
    order: [['effective_from', 'DESC']],
  });
}

/* -------------------------- Allowances ------------------------- */

/** Assign an allowance to an employee. */
async function assignAllowance(employeeId, { allowance_id, amount, percent }, actor) {
  const allowance = await Allowance.findByPk(allowance_id);
  if (!allowance) throw new SalaryValidationError('Allowance not found.');

  const data = { employee_id: employeeId, allowance_id };
  if (allowance.type === 'FIXED') {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) throw new SalaryValidationError('Enter a valid allowance amount.');
    data.amount = amt;
  } else {
    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new SalaryValidationError('Percent must be between 0 and 100.');
    data.percent = pct;
  }

  const existing = await EmployeeAllowance.findOne({ where: { employee_id: employeeId, allowance_id } });
  if (existing) throw new SalaryValidationError('This allowance is already assigned to the employee.');

  const assignment = await EmployeeAllowance.create(data);
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'ALLOWANCE_ASSIGNED', entityType: 'EMPLOYEE_ALLOWANCE', entityId: assignment.id,
    detail: { employee_id: employeeId, allowance_id, amount: data.amount || null, percent: data.percent || null },
    ip: actor.ip,
  });
  return assignment;
}

async function removeAllowance(assignmentId, actor) {
  const assignment = await EmployeeAllowance.findByPk(assignmentId);
  if (!assignment) throw new SalaryValidationError('Assignment not found.');
  await assignment.destroy();
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'ALLOWANCE_REMOVED', entityType: 'EMPLOYEE_ALLOWANCE', entityId: assignmentId,
    detail: { employee_id: assignment.employee_id, allowance_id: assignment.allowance_id },
    ip: actor.ip,
  });
}

/* -------------------------- Deductions ------------------------- */

/** Assign a custom deduction to an employee (loans with end_month). */
async function assignDeduction(employeeId, { deduction_id, amount, percent, end_month }, actor) {
  const deduction = await Deduction.findByPk(deduction_id);
  if (!deduction) throw new SalaryValidationError('Deduction not found.');
  if (deduction.is_statutory) throw new SalaryValidationError('Statutory deductions (SSNIT/PAYE) are computed automatically by the engine.');

  const data = { employee_id: employeeId, deduction_id, end_month: end_month || null };
  if (deduction.type === 'FIXED') {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) throw new SalaryValidationError('Enter a valid deduction amount.');
    data.amount = amt;
  } else {
    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) throw new SalaryValidationError('Percent must be between 0 and 100.');
    data.percent = pct;
  }
  if (end_month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(end_month)) {
    throw new SalaryValidationError('End month must be in YYYY-MM format.');
  }

  const existing = await EmployeeDeduction.findOne({ where: { employee_id: employeeId, deduction_id } });
  if (existing) throw new SalaryValidationError('This deduction is already assigned to the employee.');

  const assignment = await EmployeeDeduction.create(data);
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'DEDUCTION_ASSIGNED', entityType: 'EMPLOYEE_DEDUCTION', entityId: assignment.id,
    detail: { employee_id: employeeId, deduction_id, amount: data.amount || null, percent: data.percent || null, end_month: data.end_month },
    ip: actor.ip,
  });
  return assignment;
}

async function removeDeduction(assignmentId, actor) {
  const assignment = await EmployeeDeduction.findByPk(assignmentId);
  if (!assignment) throw new SalaryValidationError('Assignment not found.');
  await assignment.destroy();
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'DEDUCTION_REMOVED', entityType: 'EMPLOYEE_DEDUCTION', entityId: assignmentId,
    detail: { employee_id: assignment.employee_id, deduction_id: assignment.deduction_id },
    ip: actor.ip,
  });
}

/* ------------------- Engine helpers (Stage 8) ------------------ */

/** All assignments for one employee (with catalogue rows). */
async function assignmentsForEmployee(employeeId) {
  const [allowances, deductions] = await Promise.all([
    EmployeeAllowance.findAll({
      where: { employee_id: employeeId },
      include: [{ model: Allowance, as: 'allowance' }],
    }),
    EmployeeDeduction.findAll({
      where: { employee_id: employeeId },
      include: [{ model: Deduction, as: 'deduction' }],
    }),
  ]);
  return { allowances, deductions };
}

module.exports = {
  setBasicSalary, currentSalary, salaryHistory,
  assignAllowance, removeAllowance, assignDeduction, removeDeduction,
  assignmentsForEmployee, SalaryValidationError,
};
