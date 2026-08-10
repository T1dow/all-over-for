/**
 * src/routes/deductions.js
 * Deduction catalogue management (FR-19) — ADMIN & PAYROLL_OFFICER.
 * Statutory rows (SSNIT/PAYE) are labels only and cannot be edited;
 * their amounts come from the engine (Stage 8).
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const catalogueService = require('../services/catalogueService');

const router = express.Router();
router.use(requireAuth, requirePermission('deductions.manage'));

router.get('/', asyncHandler(async (req, res) => {
  res.render('catalogues/deductions', { title: 'Deductions', rows: await catalogueService.listDeductions() });
}));

router.get('/new', (req, res) => {
  res.render('catalogues/form', {
    title: 'New Deduction', kind: 'deduction', row: null, errors: [], values: {},
  });
});

router.post('/', asyncHandler(async (req, res) => {
  try {
    await catalogueService.createDeduction(req.body, { ...req.session.user, ip: req.ip });
    req.flash('success', 'Deduction created.');
    return res.redirect('/deductions');
  } catch (err) {
    if (err instanceof catalogueService.CatalogueError) {
      return res.status(422).render('catalogues/form', {
        title: 'New Deduction', kind: 'deduction', row: null, errors: [err.message], values: req.body,
      });
    }
    throw err;
  }
}));

router.get('/:id/edit', asyncHandler(async (req, res) => {
  const { Deduction } = require('../models');
  const row = await Deduction.findByPk(req.params.id);
  if (!row) {
    req.flash('error', 'Deduction not found.');
    return res.redirect('/deductions');
  }
  res.render('catalogues/form', {
    title: 'Edit Deduction', kind: 'deduction', row, errors: [], values: row.toJSON(),
  });
}));

router.post('/:id', asyncHandler(async (req, res) => {
  try {
    await catalogueService.updateDeduction(req.params.id, req.body, { ...req.session.user, ip: req.ip });
    req.flash('success', 'Deduction updated.');
    return res.redirect('/deductions');
  } catch (err) {
    if (err instanceof catalogueService.CatalogueError) {
      const { Deduction } = require('../models');
      const row = await Deduction.findByPk(req.params.id);
      return res.status(422).render('catalogues/form', {
        title: 'Edit Deduction', kind: 'deduction', row, errors: [err.message], values: req.body,
      });
    }
    throw err;
  }
}));

module.exports = router;
