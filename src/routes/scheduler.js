/**
 * src/routes/scheduler.js
 * Scheduled payroll processing UI (FR-41..FR-43).
 *   GET  /scheduler              status (jobs, schedules, last runs)
 *   POST /scheduler/toggle       enable/disable payroll or email job
 *   POST /scheduler/run-now      run a job immediately (for testing)
 *
 * Permission: scheduler.manage (ADMIN, PAYROLL_OFFICER).
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const schedulerService = require('../services/schedulerService');
const { setSetting } = require('../utils/settings');

const router = express.Router();
router.use(requireAuth, requirePermission('scheduler.manage'));

/* ------------------------ GET /scheduler ----------------------- */
router.get('/', asyncHandler(async (req, res) => {
  res.render('scheduler/index', {
    title: 'Scheduler',
    status: await schedulerService.status(),
  });
}));

/* ---------------------- POST /scheduler/toggle ----------------- */
router.post('/toggle', asyncHandler(async (req, res) => {
  const { job, enabled } = req.body;
  const key = job === 'email' ? 'scheduler.email_enabled' : 'scheduler.payroll_enabled';
  await setSetting(key, enabled === 'on' ? 'true' : 'false');
  await schedulerService.restartScheduler();
  req.flash('success', `${job === 'email' ? 'Email dispatcher' : 'Monthly payroll job'} ${enabled === 'on' ? 'enabled' : 'disabled'}.`);
  res.redirect('/scheduler');
}));

/* ---------------------- POST /scheduler/run-now ---------------- */
router.post('/run-now', asyncHandler(async (req, res) => {
  const type = req.body.type === 'email' ? 'email' : 'payroll';
  try {
    const result = await schedulerService.runNow(type);
    if (type === 'payroll') {
      if (result.status === 'processed') req.flash('success', `Scheduled payroll ran: ${result.count} employee(s), run #${result.runId}.`);
      else if (result.status === 'skipped_duplicate') req.flash('error', 'Skipped — the current period is already processed (duplicate prevention).');
      else req.flash('error', `Scheduled payroll error: ${result.error}`);
    } else {
      if (result.disabled) req.flash('error', 'Email dispatch is disabled (email.enabled).');
      else req.flash('success', `Dispatch: ${result.sent} sent, ${result.retrying} retrying, ${result.failed} failed.`);
    }
  } catch (err) {
    req.flash('error', err.message);
  }
  res.redirect('/scheduler');
}));

module.exports = router;
