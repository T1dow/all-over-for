/**
 * src/routes/allowances.js
 * Allowance catalogue management (FR-17) — ADMIN & PAYROLL_OFFICER.
 *   GET  /allowances            list
 *   GET  /allowances/new        create form
 *   POST /allowances            create
 *   GET  /allowances/:id/edit   edit form
 *   POST /allowances/:id        update (incl. active toggle)
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const catalogueService = require('../services/catalogueService');

const router = express.Router();
router.use(requireAuth, requirePermission('allowances.manage'));

router.get('/', asyncHandler(async (req, res) => {
  res.render('catalogues/allowances', { title: 'Allowances', rows: await catalogueService.listAllowances() });
}));

router.get('/new', (req, res) => {
  res.render('catalogues/form', {
    title: 'New Allowance', kind: 'allowance', row: null, errors: [], values: {},
  });
});

router.post('/', asyncHandler(async (req, res) => {
  try {
    await catalogueService.createAllowance(req.body, { ...req.session.user, ip: req.ip });
    req.flash('success', 'Allowance created.');
    return res.redirect('/allowances');
  } catch (err) {
    if (err instanceof catalogueService.CatalogueError) {
      return res.status(422).render('catalogues/form', {
        title: 'New Allowance', kind: 'allowance', row: null, errors: [err.message], values: req.body,
      });
    }
    throw err;
  }
}));

router.get('/:id/edit', asyncHandler(async (req, res) => {
  const { Allowance } = require('../models');
  const row = await Allowance.findByPk(req.params.id);
  if (!row) {
    req.flash('error', 'Allowance not found.');
    return res.redirect('/allowances');
  }
  res.render('catalogues/form', {
    title: 'Edit Allowance', kind: 'allowance', row, errors: [], values: row.toJSON(),
  });
}));

router.post('/:id', asyncHandler(async (req, res) => {
  try {
    await catalogueService.updateAllowance(req.params.id, req.body, { ...req.session.user, ip: req.ip });
    req.flash('success', 'Allowance updated.');
    return res.redirect('/allowances');
  } catch (err) {
    if (err instanceof catalogueService.CatalogueError) {
      const { Allowance } = require('../models');
      const row = await Allowance.findByPk(req.params.id);
      return res.status(422).render('catalogues/form', {
        title: 'Edit Allowance', kind: 'allowance', row, errors: [err.message], values: req.body,
      });
    }
    throw err;
  }
}));

module.exports = router;
