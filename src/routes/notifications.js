/**
 * src/routes/notifications.js
 * ------------------------------------------------------------------
 * Email notification management (FR-34..FR-40):
 *   GET  /notifications              list + status summary + filters
 *   POST /notifications/dispatch     dispatch all due now
 *   POST /notifications/:id/resend   resend one (reset + dispatch)
 *
 * Permission: email.manage (ADMIN, PAYROLL_OFFICER).
 * ------------------------------------------------------------------
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const notificationService = require('../services/notificationService');
const { EmailNotification, Payslip, PayrollRun, Employee } = require('../models');
const { getSetting } = require('../utils/settings');

const router = express.Router();
router.use(requireAuth, requirePermission('email.manage'));

/* ---------------------- GET /notifications --------------------- */
router.get('/', asyncHandler(async (req, res) => {
  const { status, run_id } = req.query;
  const where = {};
  if (status) where.status = status;
  if (run_id) where.run_id = run_id;

  const [notifications, runs, summary, emailEnabled] = await Promise.all([
    EmailNotification.findAll({
      where,
      include: [
        { model: Payslip, as: 'payslip', attributes: ['reference'] },
        { model: Employee, as: 'employee', attributes: ['employee_no', 'first_name', 'last_name'] },
        { model: PayrollRun, as: 'run' },
      ],
      order: [['id', 'DESC']],
      limit: 300,
    }),
    PayrollRun.findAll({ attributes: ['id', 'period_year', 'period_month', 'run_number'], order: [['period_year', 'DESC'], ['period_month', 'DESC']] }),
    notificationService.statusSummary(),
    getSetting('email.enabled'),
  ]);

  res.render('notifications/index', {
    title: 'Email Notifications',
    notifications, runs, summary, emailEnabled,
    filters: { status: status || '', run_id: run_id || '' },
  });
}));

/* ------------------- POST /notifications/dispatch -------------- */
router.post('/dispatch', asyncHandler(async (req, res) => {
  const result = await notificationService.dispatchPending({ actor: { ...req.session.user, ip: req.ip } });
  if (result.disabled) {
    req.flash('error', 'Email dispatch is disabled (setting email.enabled). Enable it in Settings to send.');
  } else {
    req.flash('success',
      `Dispatch complete: ${result.sent} sent, ${result.retrying} scheduled for retry, ${result.failed} failed.` +
      (result.errors.length ? ` Errors: ${result.errors.slice(0, 3).join(' | ')}` : ''));
  }
  res.redirect('/notifications');
}));

/* ------------------ POST /notifications/:id/resend ------------- */
router.post('/:id/resend', asyncHandler(async (req, res) => {
  try {
    await notificationService.resend(req.params.id, { ...req.session.user, ip: req.ip });
    req.flash('success', 'Notification reset and re-dispatched.');
  } catch (err) {
    req.flash('error', err.message);
  }
  res.redirect('/notifications');
}));

module.exports = router;
