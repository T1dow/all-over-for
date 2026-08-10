/**
 * src/routes/cron.js
 * ------------------------------------------------------------------
 * Endpoints for Vercel Cron Jobs (serverless replacement for the
 * in-process node-cron scheduler).
 *
 *   POST /api/cron/payroll   monthly auto-payroll (BR-01 safe)
 *   POST /api/cron/email     dispatch due payslip emails
 *
 * AUTH: Vercel cron requests carry User-Agent "vercel-cron/...".
 * We also accept an x-cron-secret header matching CRON_SECRET for
 * external schedulers (e.g. cron-job.org). Everything else → 403.
 * ------------------------------------------------------------------
 */
const express = require('express');
const schedulerService = require('../services/schedulerService');

const router = express.Router();

function requireCronAuth(req, res, next) {
  const ua = req.headers['user-agent'] || '';
  const secret = req.headers['x-cron-secret'];
  const allowed =
    ua.toLowerCase().startsWith('vercel-cron') ||
    (process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  next();
}

router.post('/payroll', requireCronAuth, async (req, res) => {
  try {
    const result = await schedulerService.runNow('payroll');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.post('/email', requireCronAuth, async (req, res) => {
  try {
    const result = await schedulerService.runNow('email');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = router;
