/**
 * src/middleware/rbac.js
 * ------------------------------------------------------------------
 * Server-side role enforcement (NFR-SEC-02). Every protected route is
 * wrapped with requirePermission(...) — hiding buttons is NOT enough;
 * the server must reject requests from roles that lack the permission.
 * Denials are audit-logged (action = ACCESS_DENIED).
 * ------------------------------------------------------------------
 */
const { can } = require('../config/permissions');
const audit = require('../services/auditService');

function deny(req, res) {
  const user = req.session.user;
  audit.log({
    userId: user ? user.id : null,
    userEmail: user ? user.email : null,
    action: 'ACCESS_DENIED',
    entityType: 'ROUTE',
    entityId: req.path,
    detail: { role: user ? user.role : null },
    ip: req.ip,
  });
  return res.status(403).render('pages/error', {
    statusCode: 403,
    message: 'You do not have permission to access this page. This attempt has been recorded.',
  });
}

function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) {
      req.flash('error', 'Please log in to continue.');
      return res.redirect('/login');
    }
    if (!can(user.role, permission)) return deny(req, res);
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) {
      req.flash('error', 'Please log in to continue.');
      return res.redirect('/login');
    }
    if (!roles.includes(user.role)) return deny(req, res);
    next();
  };
}

module.exports = { requirePermission, requireRole };
