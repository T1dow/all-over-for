/**
 * src/routes/payroll.js
 * ------------------------------------------------------------------
 * Payroll processing UI (FR-24..FR-29):
 *   GET  /payroll              history list
 *   GET  /payroll/process      process form (period + pay date)
 *   POST /payroll/process      run the engine (BR-01 duplicate-safe)
 *   GET  /payroll/:id          run detail (payslips)
 *   POST /payroll/:id/finalise lock the run (BR-07)
 *   POST /payroll/:id/rerun    ADMIN override, new numbered run + reason
 *
 * Permissions: payroll.process (list/process/view),
 *              payroll.finalise, payroll.override (ADMIN only).
 * ------------------------------------------------------------------
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const payrollService = require('../services/payrollService');
const { Employee } = require('../models');

const router = express.Router();
router.use(requireAuth);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/* --------------------------- GET /payroll ---------------------- */
router.get('/', requirePermission('payroll.process'), asyncHandler(async (req, res) => {
  const runs = await payrollService.listRuns();
  res.render('payroll/index', { title: 'Payroll', runs, MONTHS });
}));

/* ----------------------- GET /payroll/process ------------------ */
router.get('/process', requirePermission('payroll.process'), asyncHandler(async (req, res) => {
  const now = new Date();
  res.render('payroll/process', {
    title: 'Process Payroll',
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    payDate: '',
    MONTHS,
  });
}));

/* ---------------------- POST /payroll/process ------------------ */
router.post('/process', requirePermission('payroll.process'), asyncHandler(async (req, res) => {
  const year = parseInt(req.body.year, 10);
  const month = parseInt(req.body.month, 10);
  try {
    const { run, count, skipped } = await payrollService.processPeriod({
      year, month, payDate: req.body.pay_date || undefined,
      actor: { ...req.session.user, ip: req.ip },
    });
    req.flash('success',
      `Payroll for ${year}-${String(month).padStart(2, '0')} processed: ${count} employee(s), run #${run.run_number}.` +
      (skipped.length ? ` Skipped (no salary record): ${skipped.join(', ')}.` : ''));
    return res.redirect(`/payroll/${run.id}`);
  } catch (err) {
    if (err instanceof payrollService.PayrollError) {
      req.flash('error', err.message);
      return res.redirect('/payroll/process');
    }
    throw err;
  }
}));

/* --------------------------- GET /payroll/:id ------------------ */
router.get('/:id', requirePermission('payroll.process'), asyncHandler(async (req, res) => {
  const detail = await payrollService.getRunDetail(req.params.id);
  if (!detail) {
    req.flash('error', 'Payroll run not found.');
    return res.redirect('/payroll');
  }
  const activeEmployees = await Employee.count({ where: { employment_status: 'ACTIVE' } });
  res.render('payroll/show', {
    title: `Payroll ${detail.run.period_year}-${String(detail.run.period_month).padStart(2, '0')}`,
    run: detail.run, payslips: detail.payslips, activeEmployees, MONTHS,
  });
}));

/* ---------------------- POST /payroll/:id/finalise ------------- */
router.post('/:id/finalise', requirePermission('payroll.finalise'), asyncHandler(async (req, res) => {
  try {
    const run = await payrollService.finalise(req.params.id, { ...req.session.user, ip: req.ip });
    req.flash('success', `Run #${run.run_number} finalised and locked.`);
  } catch (err) {
    if (err instanceof payrollService.PayrollError) req.flash('error', err.message);
    else throw err;
  }
  res.redirect(`/payroll/${req.params.id}`);
}));

/* ------------------------- POST /payroll/:id/rerun ------------- */
router.post('/:id/rerun', requirePermission('payroll.override'), asyncHandler(async (req, res) => {
  try {
    const { run } = await payrollService.rerun(req.params.id, req.body.reason, { ...req.session.user, ip: req.ip });
    req.flash('success', `Re-run created: run #${run.run_number} for the same period (reason recorded).`);
    return res.redirect(`/payroll/${run.id}`);
  } catch (err) {
    if (err instanceof payrollService.PayrollError) {
      req.flash('error', err.message);
      return res.redirect(`/payroll/${req.params.id}`);
    }
    throw err;
  }
}));

module.exports = router;
