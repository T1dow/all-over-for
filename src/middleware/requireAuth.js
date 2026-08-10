/**
 * src/middleware/requireAuth.js
 * ------------------------------------------------------------------
 * Protects routes that need a logged-in user (FR-05, NFR-SEC-02).
 *  - No session  -> redirect to /login with a flash message.
 *  - mustChangePassword -> force the user to /change-password before
 *    using any other feature (except logout).
 * ------------------------------------------------------------------
 */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Please log in to continue.');
    return res.redirect('/login');
  }

  if (req.session.user.mustChangePassword) {
    const allowed = ['/change-password', '/logout'];
    if (!allowed.includes(req.path)) {
      req.flash('error', 'You must set a new password before continuing.');
      return res.redirect('/change-password');
    }
  }

  next();
}

module.exports = { requireAuth };
