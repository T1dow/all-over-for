/**
 * src/routes/salaries.js
 * ------------------------------------------------------------------
 * Salary management for one employee (FR-16..FR-21):
 *   GET  /employees/:id/salary        salary page (history + assignments)
 *   POST /employees/:id/salary        set new basic salary
 *   POST /employees/:id/allowances    assign allowance
 *   POST /employees/:id/allowances/:assignmentId/delete
 *   POST /employees/:id/deductions    assign deduction
 *   POST /employees/:id/deductions/:assignmentId/delete
 *
 * Permission: salaries.manage (ADMIN, PAYROLL_OFFICER).
 * ------------------------------------------------------------------
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const salaryService = require('../services/salaryService');
const employeeService = require('../services/employeeService');
const { Allowance, Deduction } = require('../models');

const router = express.Router();
// NOTE: guards are applied per-route below. A router-level
// requirePermission here would run for EVERY request (this router
// is mounted at '/'), blocking employees from unrelated pages.
const guard = requirePermission('salaries.manage');

/** Load employee + shared page data. */
async function loadPageData(employeeId) {
  const employee = await employeeService.getById(employeeId, true);
  if (!employee) return null;
  const [history, current, assignments, allowances, deductions] = await Promise.all([
    salaryService.salaryHistory(employeeId),
    salaryService.currentSalary(employeeId),
    salaryService.assignmentsForEmployee(employeeId),
    Allowance.findAll({ where: { is_active: true }, order: [['name', 'ASC']] }),
    Deduction.findAll({ where: { is_active: true, is_statutory: false }, order: [['name', 'ASC']] }),
  ]);
  return { employee, history, current, assignments, allowances, deductions };
}

/* -------------------- GET /employees/:id/salary ---------------- */
router.get('/employees/:id/salary', guard, asyncHandler(async (req, res) => {
  const data = await loadPageData(req.params.id);
  if (!data) {
    req.flash('error', 'Employee not found.');
    return res.redirect('/employees');
  }
  res.render('salaries/show', { title: `Salary — ${data.employee.first_name} ${data.employee.last_name}`, ...data, errors: [], values: {} });
}));

/* -------------------- POST /employees/:id/salary --------------- */
router.post('/employees/:id/salary', guard, asyncHandler(async (req, res) => {
  try {
    await salaryService.setBasicSalary(req.params.id, req.body, { ...req.session.user, ip: req.ip });
    req.flash('success', 'Basic salary saved (with history).');
  } catch (err) {
    if (err instanceof salaryService.SalaryValidationError) req.flash('error', err.message);
    else throw err;
  }
  res.redirect(`/employees/${req.params.id}/salary`);
}));

/* ------------------- POST /employees/:id/allowances ------------ */
router.post('/employees/:id/allowances', guard, asyncHandler(async (req, res) => {
  try {
    await salaryService.assignAllowance(req.params.id, req.body, { ...req.session.user, ip: req.ip });
    req.flash('success', 'Allowance assigned.');
  } catch (err) {
    if (err instanceof salaryService.SalaryValidationError) req.flash('error', err.message);
    else throw err;
  }
  res.redirect(`/employees/${req.params.id}/salary`);
}));

/* -------------- POST /employees/:id/allowances/:aid/delete ----- */
router.post('/employees/:id/allowances/:aid/delete', guard, asyncHandler(async (req, res) => {
  try {
    await salaryService.removeAllowance(req.params.aid, { ...req.session.user, ip: req.ip });
    req.flash('success', 'Allowance removed.');
  } catch (err) {
    if (err instanceof salaryService.SalaryValidationError) req.flash('error', err.message);
    else throw err;
  }
  res.redirect(`/employees/${req.params.id}/salary`);
}));

/* ------------------- POST /employees/:id/deductions ------------ */
router.post('/employees/:id/deductions', guard, asyncHandler(async (req, res) => {
  try {
    await salaryService.assignDeduction(req.params.id, req.body, { ...req.session.user, ip: req.ip });
    req.flash('success', 'Deduction assigned.');
  } catch (err) {
    if (err instanceof salaryService.SalaryValidationError) req.flash('error', err.message);
    else throw err;
  }
  res.redirect(`/employees/${req.params.id}/salary`);
}));

/* -------------- POST /employees/:id/deductions/:did/delete ----- */
router.post('/employees/:id/deductions/:did/delete', guard, asyncHandler(async (req, res) => {
  try {
    await salaryService.removeDeduction(req.params.did, { ...req.session.user, ip: req.ip });
    req.flash('success', 'Deduction removed.');
  } catch (err) {
    if (err instanceof salaryService.SalaryValidationError) req.flash('error', err.message);
    else throw err;
  }
  res.redirect(`/employees/${req.params.id}/salary`);
}));

module.exports = router;
