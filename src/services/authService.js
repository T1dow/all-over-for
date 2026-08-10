/**
 * src/services/authService.js
 * ------------------------------------------------------------------
 * Authentication business logic (FR-01, FR-03, FR-07):
 *  - email + password verification (bcrypt, never plaintext)
 *  - account lockout after N consecutive failures (configurable)
 *  - lock expiry, attempt counter reset on success
 *  - last_login_at tracking
 *  - audit logging of every auth outcome
 *
 * The HTTP layer (routes/auth.js) handles sessions; this service stays
 * pure business logic so it can be unit-tested without HTTP.
 * ------------------------------------------------------------------
 */
const { User } = require('../models');
const { verifyPassword } = require('../utils/passwords');
const audit = require('./auditService');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/** Error with a stable `code` so the controller can map messages. */
class AuthError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/**
 * Verify credentials. Returns the user row on success;
 * throws AuthError with a safe, non-revealing message on failure.
 */
async function login({ email, password, ip }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ where: { email: normalizedEmail } });

  // Generic message for "unknown user" and "wrong password" alike:
  // we must NOT reveal which emails exist (user enumeration defence).
  if (!user) {
    await audit.log({
      userEmail: normalizedEmail,
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      detail: { reason: 'not_found' },
      ip,
    });
    throw new AuthError('Invalid email or password.', 'INVALID');
  }

  if (!user.is_active) {
    await audit.log({ userId: user.id, userEmail: user.email, action: 'LOGIN_BLOCKED', entityType: 'USER', detail: { reason: 'disabled' }, ip });
    throw new AuthError('This account has been disabled. Contact the administrator.', 'DISABLED');
  }

  const now = new Date();
  if (user.locked_until && new Date(user.locked_until) > now) {
    await audit.log({ userId: user.id, userEmail: user.email, action: 'LOGIN_BLOCKED', entityType: 'USER', detail: { reason: 'locked' }, ip });
    const mins = Math.ceil((new Date(user.locked_until) - now) / 60000);
    throw new AuthError(`Too many failed attempts. Account locked — try again in about ${mins} minute(s).`, 'LOCKED');
  }

  const valid = await verifyPassword(password, user.password_hash);

  if (!valid) {
    user.failed_attempts = (user.failed_attempts || 0) + 1;
    if (user.failed_attempts >= MAX_FAILED_ATTEMPTS) {
      user.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failed_attempts = 0;
      await user.save();
      await audit.log({
        userId: user.id, userEmail: user.email,
        action: 'ACCOUNT_LOCKED', entityType: 'USER', entityId: user.id,
        detail: { attempts: MAX_FAILED_ATTEMPTS, lockMinutes: LOCK_MINUTES }, ip,
      });
      throw new AuthError(`Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`, 'LOCKED');
    }
    await user.save();
    await audit.log({
      userId: user.id, userEmail: user.email,
      action: 'LOGIN_FAILED', entityType: 'USER', entityId: user.id,
      detail: { attempt: user.failed_attempts }, ip,
    });
    throw new AuthError('Invalid email or password.', 'INVALID');
  }

  // Success: clear lock state and counter, record login time.
  if (user.locked_until && new Date(user.locked_until) <= now) user.locked_until = null;
  user.failed_attempts = 0;
  user.last_login_at = now;
  await user.save();

  await audit.log({
    userId: user.id, userEmail: user.email,
    action: 'LOGIN_SUCCESS', entityType: 'USER', entityId: user.id, ip,
  });

  return user;
}

/** Public shape stored in the session (no hash, no lock fields). */
function sessionPayload(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    employeeId: user.employee_id || null,
    mustChangePassword: Boolean(user.must_change_password),
  };
}

module.exports = { login, sessionPayload, AuthError, MAX_FAILED_ATTEMPTS, LOCK_MINUTES };
