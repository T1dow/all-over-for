/**
 * src/services/schedulerService.js
 * ------------------------------------------------------------------
 * SCHEDULED PAYROLL PROCESSING (Stage 12, FR-41..FR-43).
 *
 * Two node-cron jobs:
 *
 *   1. PAYROLL JOB (monthly)  — on the configured pay day & time
 *      (settings payroll.pay_date, payroll.schedule_time). Processes
 *      the CURRENT period for all active employees. Duplicate
 *      prevention (BR-01) still applies: if the period already has a
 *      run, the job skips it and logs SCHEDULED_PAYROLL_SKIPPED.
 *
 *   2. EMAIL JOB (every 5 min) — dispatches due payslip notifications
 *      (PENDING, or RETRYING past next_retry_at) with the retry
 *      backoff. Gated by email.enabled.
 *
 * Properties:
 *   - idempotent & restart-safe (FR-43): nothing happens twice; the
 *     jobs are cheap no-ops when there is nothing to do.
 *   - gated by scheduler.payroll_enabled / scheduler.email_enabled.
 *   - audited: every scheduled action writes SCHEDULED_* audit rows
 *     with a dedicated system actor (scheduler@system.local) so the
 *     trail distinguishes automatic from human actions.
 * ------------------------------------------------------------------
 */
const cron = require('node-cron');
const env = require('../config/env');
const { getSetting, getSettingNumber, setSetting } = require('../utils/settings');
const { User } = require('../models');
const payrollService = require('./payrollService');
const notificationService = require('./notificationService');
const audit = require('./auditService');

const SYSTEM_EMAIL = 'scheduler@system.local';

/** Lazy singleton so the service can be required anywhere. */
let jobs = null;
let running = false;

/** The system actor used by scheduled jobs (cannot log in — is_active=false). */
async function systemActor() {
  let user = await User.findOne({ where: { email: SYSTEM_EMAIL } });
  if (!user) {
    user = await User.create({
      name: 'Scheduled Job (System)',
      email: SYSTEM_EMAIL,
      password_hash: '!disabled-account!', // bcrypt-incompatible → can never log in
      role: 'ADMIN',
      is_active: false,
    });
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role, ip: 'scheduler' };
}

/* ---------------------------- Jobs ----------------------------- */

/** Monthly payroll job: process the current period (BR-01-safe). */
async function runMonthlyPayroll() {
  const actor = await systemActor();
  const now = new Date();
  const period = { year: now.getFullYear(), month: now.getMonth() + 1 };

  // Respect the configured pay date for the run's pay_date.
  const payDay = (await getSettingNumber('payroll.pay_date')) || 25;
  const payDate = `${period.year}-${String(period.month).padStart(2, '0')}-${String(payDay).padStart(2, '0')}`;

  try {
    const { run, count, skipped } = await payrollService.processPeriod({
      year: period.year,
      month: period.month,
      payDate,
      actor,
    });
    await audit.log({
      userId: actor.id, userEmail: actor.email,
      action: 'SCHEDULED_PAYROLL_PROCESSED', entityType: 'PAYROLL_RUN', entityId: run.id,
      detail: { period: `${period.year}-${String(period.month).padStart(2, '0')}`, employees: count, skipped },
      ip: 'scheduler',
    });
    return { status: 'processed', runId: run.id, count };
  } catch (err) {
    if (err instanceof payrollService.PayrollError && err.code === 'DUPLICATE') {
      // BR-01: the period already has a run — scheduled job must NOT force one.
      await audit.log({
        userId: actor.id, userEmail: actor.email,
        action: 'SCHEDULED_PAYROLL_SKIPPED', entityType: 'PAYROLL_RUN',
        detail: { period: `${period.year}-${String(period.month).padStart(2, '0')}`, reason: 'already processed' },
        ip: 'scheduler',
      });
      return { status: 'skipped_duplicate' };
    }
    await audit.log({
      userId: actor.id, userEmail: actor.email,
      action: 'SCHEDULED_PAYROLL_ERROR', entityType: 'PAYROLL_RUN',
      detail: { period: `${period.year}-${String(period.month).padStart(2, '0')}`, error: String(err.message || err).slice(0, 300) },
      ip: 'scheduler',
    });
    return { status: 'error', error: String(err.message || err) };
  }
}

/** Email dispatch job: send all due notifications. */
async function runEmailDispatch() {
  const actor = await systemActor();
  const result = await notificationService.dispatchPending({ limit: 200, actor });
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'SCHEDULED_EMAIL_DISPATCH', entityType: 'EMAIL_NOTIFICATION',
    detail: result, ip: 'scheduler',
  });
  return result;
}

/* ------------------------- Cron wiring ------------------------- */

/** Build the cron expression for a monthly job on day @ time "HH:MM". */
function monthlyCron(day, time) {
  const [h, m] = String(time || '08:00').split(':').map((x) => parseInt(x, 10));
  return `${m || 0} ${h || 8} ${day} * *`;
}

/** (Re)define the cron jobs from current settings. Safe to call repeatedly. */
async function startScheduler() {
  // On Vercel there is no long-running process — scheduling is handled by
  // Vercel Cron Jobs (vercel.json) hitting /api/cron/*. No-op here.
  if (env.isVercel) {
    return { vercel: true, message: 'Scheduling handled by Vercel Cron Jobs' };
  }
  if (running) return { alreadyRunning: true };
  running = true;

  const payrollEnabled = (await getSetting('scheduler.payroll_enabled')) !== 'false';
  const emailEnabled = (await getSetting('scheduler.email_enabled')) !== 'false';
  const day = (await getSettingNumber('payroll.pay_date')) || 25;
  const time = (await getSetting('payroll.schedule_time')) || '08:00';

  jobs = [];

  if (payrollEnabled) {
    const task = cron.schedule(monthlyCron(day, time), async () => {
      try { await runMonthlyPayroll(); } catch (e) { console.error('[scheduler] payroll job error:', e.message); }
    });
    jobs.push({ key: 'PAYROLL', type: 'payroll', task, enabled: true, schedule: monthlyCron(day, time), label: `Monthly payroll — day ${day} at ${time}` });
  }

  if (emailEnabled) {
    const task = cron.schedule('*/5 * * * *', async () => {
      try { await runEmailDispatch(); } catch (e) { console.error('[scheduler] email job error:', e.message); }
    });
    jobs.push({ key: 'EMAIL', type: 'email', task, enabled: true, schedule: '*/5 * * * *', label: 'Payslip email dispatcher — every 5 minutes' });
  }

  console.log(`[scheduler] started: ${jobs.map((j) => j.key).join(', ') || 'none (all disabled)'}`);
  return { started: jobs.length };
}

/** Stop all cron jobs (used on shutdown / reconfig). */
function stopScheduler() {
  if (jobs) for (const j of jobs) j.task.stop();
  jobs = [];
  running = false;
}

/** Re-read settings and rebuild the jobs (after an enable/disable toggle). */
async function restartScheduler() {
  stopScheduler();
  return startScheduler();
}

/** Status for the UI: enabled flags, schedules, next run times. */
async function status() {
  const [payrollEnabled, emailEnabled, day, time, lastPayroll, lastEmail] = await Promise.all([
    getSetting('scheduler.payroll_enabled'),
    getSetting('scheduler.email_enabled'),
    getSettingNumber('payroll.pay_date'),
    getSetting('payroll.schedule_time'),
    getSetting('scheduler.last_payroll_run'),
    getSetting('scheduler.last_email_run'),
  ]);
  return {
    platform: env.isVercel ? 'vercel' : 'local',
    payrollEnabled: payrollEnabled !== 'false',
    emailEnabled: emailEnabled !== 'false',
    payrollCron: monthlyCron(day || 25, time || '08:00'),
    payrollLabel: `Monthly payroll — day ${day || 25} at ${time || '08:00'}`,
    emailCron: '*/5 * * * *',
    emailLabel: 'Payslip email dispatcher — every 5 minutes',
    lastPayrollRun: lastPayroll || 'never',
    lastEmailRun: lastEmail || 'never',
    jobsRunning: running,
  };
}

/** Record "last run" markers after a manual or scheduled execution. */
async function markRun(kind, outcome) {
  await setSetting(`scheduler.last_${kind}_run`, `${new Date().toISOString()} — ${outcome}`);
}

/* ------------------------- Run now (UI) ------------------------ */

async function runNow(type) {
  const actor = await systemActor();
  let result;
  if (type === 'payroll') {
    result = await runMonthlyPayroll();
    await markRun('payroll', result.status);
  } else if (type === 'email') {
    result = await runEmailDispatch();
    await markRun('email', result.disabled ? 'disabled' : `${result.sent} sent, ${result.retrying} retrying, ${result.failed} failed`);
  } else {
    throw new Error('Unknown job type.');
  }
  return result;
}

module.exports = {
  startScheduler, stopScheduler, restartScheduler, status, runNow, systemActor,
};
