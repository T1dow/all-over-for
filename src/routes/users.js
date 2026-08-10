/**
 * src/routes/users.js
 * ------------------------------------------------------------------
 * User management (FR-06) — ADMIN only (permission users.manage):
 *   GET  /users                list users
 *   GET  /users/new            create form
 *   POST /users                create user (temp password, forced change)
 *   GET  /users/:id/edit       edit form
 *   POST /users/:id            update name/email/role/active
 *   POST /users/:id/reset-password  reset to temp password (forced change)
 *
 * Guards:
 *  - every action is audit-logged (USER_CREATED/UPDATED, PASSWORD_RESET)
 *  - an admin cannot demote or disable their own account (no lockout
 *    of the last administrator)
 * ------------------------------------------------------------------
 */
const express = require('express');
const { Op } = require('sequelize');
const { body, validationResult } = require('express-validator');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const { User } = require('../models');
const { hashPassword } = require('../utils/passwords');
const audit = require('../services/auditService');
const { ROLES, ROLE_LABELS } = require('../config/permissions');

const router = express.Router();

router.use(requireAuth, requirePermission('users.manage'));

const ALL_ROLES = Object.values(ROLES);

const userRules = [
  body('name').trim().isLength({ min: 2 }).withMessage('Name is required (min 2 characters).'),
  body('email').trim().isEmail().withMessage('Enter a valid email address.'),
  body('role').isIn(ALL_ROLES).withMessage('Invalid role selected.'),
];

/* --------------------------- GET /users ------------------------ */
router.get('/', asyncHandler(async (req, res) => {
  const users = await User.findAll({ order: [['id', 'ASC']] });
  res.render('users/index', {
    title: 'Users',
    users,
    ROLE_LABELS,
  });
}));

/* ------------------------- GET /users/new ---------------------- */
router.get('/new', (req, res) => {
  res.render('users/form', {
    title: 'New User',
    user: null,
    roles: ALL_ROLES,
    ROLE_LABELS,
    errors: [],
  });
});

/* -------------------------- POST /users ------------------------ */
router.post('/', userRules.concat([
  body('temp_password').isLength({ min: 8 }).withMessage('Temporary password must be at least 8 characters long.'),
]), asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('users/form', {
      title: 'New User',
      user: { ...req.body, id: null },
      roles: ALL_ROLES,
      ROLE_LABELS,
      errors: errors.array().map((e) => e.msg),
    });
  }

  const email = req.body.email.trim().toLowerCase();
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    return res.status(409).render('users/form', {
      title: 'New User',
      user: { ...req.body, id: null },
      roles: ALL_ROLES,
      ROLE_LABELS,
      errors: ['A user with this email address already exists.'],
    });
  }

  const user = await User.create({
    name: req.body.name.trim(),
    email,
    password_hash: await hashPassword(req.body.temp_password),
    role: req.body.role,
    must_change_password: true,
    is_active: true,
  });

  audit.log({
    userId: req.session.user.id,
    userEmail: req.session.user.email,
    action: 'USER_CREATED',
    entityType: 'USER',
    entityId: user.id,
    detail: { role: user.role, email: user.email },
    ip: req.ip,
  });

  req.flash('success', `User ${user.name} created. They must set their own password at first login.`);
  res.redirect('/users');
}));

/* ----------------------- GET /users/:id/edit ------------------- */
router.get('/:id/edit', asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/users');
  }
  res.render('users/form', {
    title: 'Edit User',
    user,
    roles: ALL_ROLES,
    ROLE_LABELS,
    errors: [],
  });
}));

/* -------------------------- POST /users/:id -------------------- */
router.post('/:id', userRules, asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/users');
  }

  // Self-protection: you cannot demote or disable your own account.
  const self = Number(user.id) === Number(req.session.user.id);
  const newRole = req.body.role;
  const newActive = req.body.is_active === 'on';
  if (self && (newRole !== user.role || !newActive)) {
    return res.status(422).render('users/form', {
      title: 'Edit User',
      user,
      roles: ALL_ROLES,
      ROLE_LABELS,
      errors: ['You cannot change your own role or disable your own account.'],
    });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('users/form', {
      title: 'Edit User',
      user,
      roles: ALL_ROLES,
      ROLE_LABELS,
      errors: errors.array().map((e) => e.msg),
    });
  }

  const email = req.body.email.trim().toLowerCase();
  const dup = await User.findOne({ where: { email, id: { [Op.ne]: user.id } } });
  if (dup) {
    return res.status(409).render('users/form', {
      title: 'Edit User',
      user,
      roles: ALL_ROLES,
      ROLE_LABELS,
      errors: ['Another user already uses this email address.'],
    });
  }

  const before = { role: user.role, active: user.is_active };
  user.name = req.body.name.trim();
  user.email = email;
  user.role = newRole;
  user.is_active = newActive;
  await user.save();

  audit.log({
    userId: req.session.user.id,
    userEmail: req.session.user.email,
    action: 'USER_UPDATED',
    entityType: 'USER',
    entityId: user.id,
    detail: { before, after: { role: user.role, active: user.is_active } },
    ip: req.ip,
  });

  req.flash('success', 'User updated.');
  res.redirect('/users');
}));

/* ------------------- POST /users/:id/reset-password ------------ */
router.post('/:id/reset-password', [
  body('temp_password').isLength({ min: 8 }).withMessage('Temporary password must be at least 8 characters long.'),
], asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/users');
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array()[0].msg);
    return res.redirect('/users');
  }

  user.password_hash = await hashPassword(req.body.temp_password);
  user.must_change_password = true;
  user.failed_attempts = 0;
  user.locked_until = null;
  await user.save();

  audit.log({
    userId: req.session.user.id,
    userEmail: req.session.user.email,
    action: 'PASSWORD_RESET',
    entityType: 'USER',
    entityId: user.id,
    detail: { forcedChange: true },
    ip: req.ip,
  });

  req.flash('success', `Password for ${user.name} reset. They must change it at next login.`);
  res.redirect('/users');
}));

module.exports = router;
