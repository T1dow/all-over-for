/**
 * src/middleware/flash.js
 * One-round session flash messages: set req.flash('success'|'error', msg),
 * display via the `flash` partial, then clear. Simple, dependency-free.
 */
module.exports = function flash(req, res, next) {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;

  req.flash = (type, message) => {
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type, message });
  };
  next();
};
