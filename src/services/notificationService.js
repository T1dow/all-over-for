/**
 * src/services/notificationService.js
 * ------------------------------------------------------------------
 * Payslip email notification state machine (FR-34..FR-40):
 *
 *   PENDING ──dispatch──► SENT
 *      │                     ▲
 *      ▼                     │resend
 *   FAILED ◄──3 attempts── RETRYING ──(backoff 5m/15m/1h)──► dispatch
 *
 *  - createNotificationsForRun(): called when a payroll is FINALISED —
 *    one PENDING row per payslip, PDF generated, neutral subject/body.
 *  - dispatchPending(): sends due notifications (PENDING, or RETRYING
 *    whose next_retry_at has passed), updates status, schedules retries.
 *  - resend(): manual retry of a failed notification.
 *  - Gated by the email.enabled setting; every send outcome is
 *    audit-logged (EMAIL_SENT / EMAIL_FAILED / EMAIL_RESEND).
 * ------------------------------------------------------------------
 */
const { Op } = require('sequelize');
const path = require('path');
const { EmailNotification, Payslip, PayrollRun, Employee } = require('../models');
const { getSetting, getSettingNumber } = require('../utils/settings');
const { generatePayslipPdf } = require('./payslipService');
const emailService = require('./emailService');
const audit = require('./auditService');

/** Retry backoff (minutes) per attempt index (attempt 1 → +5m, 2 → +15m, 3+ → +1h). */
const BACKOFF_MINUTES = [5, 15, 60];

function periodLabelOf(run) {
  return `${run.period_year}-${String(run.period_month).padStart(2, '0')}`;
}

/** Build the neutral subject/body (FR-39: no amounts, no URLs). */
async function composeMessage(payslip) {
  const school = (await getSetting('school.name')) || 'Kay-Billie-Klaer International School';
  const period = periodLabelOf(payslip.run);
  const emp = payslip.employee;
  const subject = `Payslip for ${period} — ${school}`;
  const body = [
    `Dear ${emp.first_name} ${emp.last_name},`,
    '',
    `Your payslip for the period ${period} has been generated and is attached to this email.`,
    `Payslip reference: ${payslip.reference}`,
    '',
    'If you have any questions about your payslip, please contact the payroll office quoting the reference above.',
    '',
    'This is an automated message — please do not reply.',
    school,
  ].join('\n');
  return { subject, body };
}

/** One PENDING notification per payslip in a run (idempotent). */
async function createNotificationsForRun(runId, actor = null) {
  const payslips = await Payslip.findAll({
    where: { run_id: runId },
    include: [
      { model: Employee, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { model: PayrollRun, as: 'run' },
    ],
  });

  let created = 0;
  for (const p of payslips) {
    const exists = await EmailNotification.findOne({ where: { payslip_id: p.id } });
    if (exists) continue;

    const { subject, body } = await composeMessage(p);
    await EmailNotification.create({
      payslip_id: p.id,
      run_id: runId,
      employee_id: p.employee_id,
      recipient_email: p.employee ? p.employee.email : '',
      subject,
      body,
      status: 'PENDING',
      attempts: 0,
    });
    created += 1;
  }

  if (actor && created > 0) {
    await audit.log({
      userId: actor.id, userEmail: actor.email,
      action: 'NOTIFICATIONS_CREATED', entityType: 'PAYROLL_RUN', entityId: runId,
      detail: { count: created }, ip: actor.ip,
    });
  }
  return created;
}

/** Send all due notifications. Returns a summary of outcomes. */
async function dispatchPending({ limit = 100, actor = null } = {}) {
  const enabled = (await getSetting('email.enabled')) !== 'false';
  if (!enabled) return { disabled: true, sent: 0, retrying: 0, failed: 0, errors: [] };

  const now = new Date();
  const due = await EmailNotification.findAll({
    where: {
      [Op.or]: [
        { status: 'PENDING' },
        { status: 'RETRYING', next_retry_at: { [Op.lte]: now } },
      ],
    },
    order: [['id', 'ASC']],
    limit,
  });

  const maxAttempts = (await getSettingNumber('email.max_attempts')) || 3;
  const result = { disabled: false, sent: 0, retrying: 0, failed: 0, errors: [] };

  for (const n of due) {
    try {
      // Ensure the PDF exists (regenerates if needed) — direct attachment.
      const { filePath } = await generatePayslipPdf(n.payslip_id);
      await emailService.sendPayslipEmail({
        to: n.recipient_email,
        subject: n.subject,
        text: n.body,
        attachmentPath: filePath,
      });
      n.status = 'SENT';
      n.attempts += 1;
      n.sent_at = new Date();
      n.last_error = null;
      n.next_retry_at = null;
      result.sent += 1;
      await audit.log({
        userId: actor ? actor.id : null, userEmail: actor ? actor.email : null,
        action: 'EMAIL_SENT', entityType: 'EMAIL_NOTIFICATION', entityId: n.id,
        detail: { payslip_id: n.payslip_id, recipient: n.recipient_email }, ip: actor ? actor.ip : null,
      });
    } catch (err) {
      n.attempts += 1;
      n.last_error = String(err.message || err).slice(0, 500);
      if (n.attempts >= maxAttempts) {
        n.status = 'FAILED';
        n.next_retry_at = null;
        result.failed += 1;
      } else {
        const backoff = BACKOFF_MINUTES[Math.min(n.attempts - 1, BACKOFF_MINUTES.length - 1)];
        n.status = 'RETRYING';
        n.next_retry_at = new Date(Date.now() + backoff * 60 * 1000);
        result.retrying += 1;
      }
      result.errors.push(`#${n.id} (${n.recipient_email}): ${String(err.message || err).slice(0, 200)}`);
      await audit.log({
        userId: actor ? actor.id : null, userEmail: actor ? actor.email : null,
        action: 'EMAIL_FAILED', entityType: 'EMAIL_NOTIFICATION', entityId: n.id,
        detail: { payslip_id: n.payslip_id, attempts: n.attempts, error: n.last_error }, ip: actor ? actor.ip : null,
      });
    }
    await n.save();
  }
  return result;
}

/** Manual resend: reset a notification and dispatch it immediately. */
async function resend(notificationId, actor) {
  const n = await EmailNotification.findByPk(notificationId);
  if (!n) throw new Error('Notification not found.');
  n.status = 'PENDING';
  n.attempts = 0;
  n.next_retry_at = null;
  n.last_error = null;
  await n.save();

  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'EMAIL_RESEND', entityType: 'EMAIL_NOTIFICATION', entityId: n.id,
    detail: { payslip_id: n.payslip_id, recipient: n.recipient_email }, ip: actor.ip,
  });

  const result = await dispatchPending({ limit: 1, actor });
  return result;
}

/** Status counts for the notification dashboard. */
async function statusSummary() {
  const rows = await EmailNotification.findAll({
    attributes: ['status', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
    group: ['status'],
    raw: true,
  });
  const summary = { PENDING: 0, SENT: 0, FAILED: 0, RETRYING: 0 };
  for (const r of rows) summary[r.status] = Number(r.count);
  return summary;
}

module.exports = {
  createNotificationsForRun, dispatchPending, resend, statusSummary, BACKOFF_MINUTES,
};
