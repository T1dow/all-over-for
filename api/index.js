/**
 * api/index.js
 * ------------------------------------------------------------------
 * Vercel serverless entry point. The whole Express app is exported as
 * a single serverless function; vercel.json rewrites every route to
 * this handler.
 *
 * NOTE: on Vercel there is no long-running process, so:
 *  - sessions live in PostgreSQL (see src/app.js)
 *  - the scheduler's in-process cron is replaced by Vercel Cron Jobs
 *    hitting /api/cron/payroll and /api/cron/email (see vercel.json)
 *  - payslip PDFs are written to /tmp (they regenerate on demand)
 * ------------------------------------------------------------------
 */
const createApp = require('../src/app');

module.exports = createApp();
