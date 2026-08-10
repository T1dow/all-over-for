/**
 * src/routes/auth.js
 * ------------------------------------------------------------------
 * Authentication endpoints (FR-01..FR-08):
 *   GET/POST /login             - sign in (rate-limited, CSRF-protected)
 *   POST /logout                - destroy session
 *   GET/POST /change-password   - set a new password (forced after
 *                                 admin reset: must_change_password)
 *
 * Security details:
 *  - CSRF protection is global (middleware/csrf.js).
 *  - The login endpoint is rate-limited (middleware/rateLimit.js).
 *  - On success the session is REGENERATED (new session ID) to prevent
 *    session-fixation attacks.
 *  - Sessions are server-side; the cookie is HttpOnly + SameSite.
 * ------------------------------------------------------------------
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const asyncHandler = require('../utils/asyncHandler');
const { authLimiter } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/requireAuth');
const authService = require('../services/authService');
const audit = require('../services/auditService');
const { User } = require('../models');
const { hashPassword, verifyPassword } = require('../utils/passwords');

const router = express.Router();

/* ------------------------- GET /login ------------------------- */
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('pages/login', { title: 'Login', error: null, email: '' });
});

/* ------------------------- POST /login ------------------------ */
router.post('/login', authLimiter, [
  body('email').trim().isEmail().withMessage('Enter a valid email address.'),
  body('password').notEmpty().withMessage('Password is required.'),
], asyncHandler(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('pages/login', {
      title: 'Login',
      error: errors.array()[0].msg,
      email: req.body.email || '',
    });
  }

  try {
    const user = await authService.login({
      email: req.body.email,
      password: req.body.password,
      ip: req.ip,
    });

    // Regenerate the session ID before storing identity (anti-fixation).
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = authService.sessionPayload(user);
      if (user.must_change_password) {
        return res.redirect('/change-password');
      }
      req.flash('success', `Welcome back, ${user.name}.`);
      return res.redirect('/dashboard');
    });
  } catch (err) {
    if (err instanceof authService.AuthError) {
      return res.status(401).render('pages/login', {
        title: 'Login',
        error: err.message,
        email: req.body.email || '',
      });
    }
    throw err;
  }
}));

/* ------------------------- POST /logout ----------------------- */
router.post('/logout', (req, res) => {
  const user = req.session.user || null;
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    audit.log({
      userId: user ? user.id : null,
      userEmail: user ? user.email : null,
      action: 'LOGOUT',
      entityType: 'USER',
      entityId: user ? user.id : null,
      ip: req.ip,
    });
    res.redirect('/login');
  });
});

/* ---------------------- GET /change-password ------------------ */
router.get('/change-password', requireAuth, (req, res) => {
  res.render('pages/change-password', { title: 'Change Password', errors: [] });
});

/* --------------------- POST /change-password ------------------ */
router.post('/change-password', requireAuth, [
  body('current_password').notEmpty().withMessage('Enter your current password.'),
  body('new_password')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters long.')
    .matches(/[A-Za-z]/).withMessage('New password must contain letters.')
    .matches(/[0-9]/).withMessage('New password must contain numbers.'),
  body('confirm_password').custom((value, { req }) => value === req.body.new_password)
    .withMessage('Passwords do not match.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('pages/change-password', {
      title: 'Change Password',
      errors: errors.array().map((e) => e.msg),
    });
  }

  const user = await User.findByPk(req.session.user.id);
  if (!user) {
    req.flash('error', 'Account not found.');
    return res.redirect('/login');
  }

  const currentOk = await verifyPassword(req.body.current_password, user.password_hash);
  if (!currentOk) {
    return res.status(422).render('pages/change-password', {
      title: 'Change Password',
      errors: ['Current password is incorrect.'],
    });
  }

  user.password_hash = await hashPassword(req.body.new_password);
  user.must_change_password = false;
  await user.save();

  audit.log({
    userId: user.id, userEmail: user.email,
    action: 'PASSWORD_CHANGED', entityType: 'USER', entityId: user.id, ip: req.ip,
  });

  req.session.user.mustChangePassword = false;
  req.flash('success', 'Password changed successfully.');
  res.redirect('/dashboard');
}));

module.exports = router;
