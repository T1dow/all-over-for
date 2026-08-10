/**
 * src/routes/settings.js
 * ------------------------------------------------------------------
 * System settings (FR-51) — ADMIN only (settings.manage):
 *   GET /settings   show current values
 *   POST /settings  save (validated; audit-logged SETTINGS_UPDATED)
 *
 * Statutory rates (SSNIT, PAYE brackets) are DATA — edited here, never
 * in code. PAYE brackets are JSON: [{"up_to":5880,"rate":0}, ...,
 * {"up_to":null,"rate":35}].
 * ------------------------------------------------------------------
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const { getSetting, setSetting } = require('../utils/settings');
const audit = require('../services/auditService');
const schedulerService = require('../services/schedulerService');

const router = express.Router();
router.use(requireAuth, requirePermission('settings.manage'));

const FIELDS = [
  ['school.name', 'School name', 'text'],
  ['school.address', 'School address', 'text'],
  ['payroll.pay_date', 'Default pay day of month (1–31)', 'number'],
  ['payroll.schedule_time', 'Scheduled payroll time (HH:MM)', 'text'],
  ['email.enabled', 'Email dispatch enabled (true/false)', 'text'],
  ['email.transport', 'Email transport (smtp | json)', 'text'],
  ['email.max_attempts', 'Max email attempts before FAILED', 'number'],
  ['scheduler.payroll_enabled', 'Scheduled monthly payroll job (true/false)', 'text'],
  ['scheduler.email_enabled', 'Scheduled email dispatcher (true/false)', 'text'],
  ['ssnit.rate', 'SSNIT employee rate (%)', 'number'],
  ['ssnit.ceiling_annual', 'SSNIT insurable ceiling (GHS/yr)', 'number'],
  ['tax.method', 'PAYE method (ANNUALISED | MONTHLY)', 'text'],
];

router.get('/', asyncHandler(async (req, res) => {
  const values = {};
  for (const [key] of FIELDS) values[key] = (await getSetting(key)) ?? '';
  values['tax.paye_brackets'] = (await getSetting('tax.paye_brackets')) ?? '';
  res.render('settings/index', { title: 'Settings', values, errors: [] });
}));

router.post('/', asyncHandler(async (req, res) => {
  const errors = [];

  // Validation
  const payDay = Number(req.body['payroll.pay_date']);
  if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) errors.push('Pay day must be a whole number 1–31.');

  const ssnitRate = Number(req.body['ssnit.rate']);
  if (!Number.isFinite(ssnitRate) || ssnitRate < 0 || ssnitRate > 30) errors.push('SSNIT rate must be between 0 and 30%.');

  const ceiling = Number(req.body['ssnit.ceiling_annual']);
  if (!Number.isFinite(ceiling) || ceiling <= 0) errors.push('SSNIT ceiling must be a positive amount.');

  let brackets = null;
  try {
    brackets = JSON.parse(req.body['tax.paye_brackets']);
    if (!Array.isArray(brackets) || !brackets.length) throw new Error();
    for (const b of brackets) {
      if (typeof b.rate !== 'number' || (b.up_to !== null && typeof b.up_to !== 'number')) throw new Error();
    }
  } catch {
    errors.push('PAYE brackets must be valid JSON, e.g. [{"up_to":5880,"rate":0},{"up_to":null,"rate":35}].');
  }

  if (errors.length) {
    return res.status(422).render('settings/index', { title: 'Settings', values: req.body, errors });
  }

  for (const [key] of FIELDS) {
    if (req.body[key] !== undefined) await setSetting(key, req.body[key], req.session.user.id);
  }
  if (brackets) await setSetting('tax.paye_brackets', JSON.stringify(brackets), req.session.user.id);

  await audit.log({
    userId: req.session.user.id, userEmail: req.session.user.email,
    action: 'SETTINGS_UPDATED', entityType: 'SYSTEM', detail: { fields: FIELDS.map(([k]) => k) }, ip: req.ip,
  });

  // Rebuild the scheduler jobs if toggles changed.
  try { await schedulerService.restartScheduler(); } catch { /* keep going */ }

  req.flash('success', 'Settings saved. Scheduler jobs rebuilt from the new values.');
  res.redirect('/settings');
}));

module.exports = router;
