/**
 * src/utils/masking.js
 * ------------------------------------------------------------------
 * Masking for sensitive identifiers (FR-14): SSNIT numbers and bank
 * account numbers are shown masked by default in lists and views.
 * Full values are only rendered for roles with salary-level access
 * (ADMIN / PAYROLL_OFFICER), decided by the view layer.
 * ------------------------------------------------------------------
 */

/** Mask everything except the last `keep` characters. */
function mask(value, keep = 4) {
  if (!value) return '—';
  const s = String(value);
  if (s.length <= keep) return s;
  return '*'.repeat(s.length - keep) + s.slice(-keep);
}

/** SSNIT-style mask keeping the last 4 digits. */
function maskSsnit(value) {
  return mask(value, 4);
}

/** Bank account mask keeping the last 4 digits. */
function maskAccount(value) {
  return mask(value, 4);
}

module.exports = { mask, maskSsnit, maskAccount };
