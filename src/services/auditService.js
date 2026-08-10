/**
 * src/services/auditService.js
 * ------------------------------------------------------------------
 * Append-only audit trail (FR-49, FR-50). Every sensitive action calls
 * audit.log(...). The record contains: actor (user), action, entity,
 * detail (JSON), IP address, timestamp.
 *
 * Design notes:
 *  - Best-effort: if writing the audit row fails we log to the console
 *    but never crash the main operation (audit must not break payroll).
 *  - There is NO application path to update or delete audit rows.
 *  - `detail` must never contain passwords or plaintext secrets.
 * ------------------------------------------------------------------
 */
const { AuditLog } = require('../models');

/**
 * @param {Object} opts
 * @param {number|null} opts.userId
 * @param {string|null} opts.userEmail
 * @param {string} opts.action    e.g. 'LOGIN_SUCCESS', 'PAYROLL_PROCESSED'
 * @param {string} opts.entityType e.g. 'USER', 'EMPLOYEE', 'PAYROLL_RUN'
 * @param {string|number|null} opts.entityId
 * @param {Object|null} opts.detail
 * @param {string|null} opts.ip
 */
async function log({ userId = null, userEmail = null, action, entityType, entityId = null, detail = null, ip = null }) {
  try {
    await AuditLog.create({
      user_id: userId,
      user_email: userEmail,
      action,
      entity_type: entityType,
      entity_id: entityId !== null && entityId !== undefined ? String(entityId) : null,
      detail: detail || null,
      ip_address: ip,
    });
  } catch (err) {
    console.error('[audit] failed to write audit entry:', err.message);
  }
}

module.exports = { log };
