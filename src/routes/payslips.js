/**
 * src/routes/payslips.js
 * ------------------------------------------------------------------
 * Payslip delivery (FR-31/FR-32/FR-33):
 *   GET  /payslips           list — employees see ONLY their own;
 *                            staff (view_all) can filter by employee/run
 *   GET  /payslips/:id/pdf   download the PDF (permission-checked)
 *   POST /payslips/:id/regenerate  staff: regenerate the PDF file
 *
 * SECURITY (FR-32): an Employee can only ever download their OWN
 * payslip — verified server-side (not just hidden buttons), and every
 * denial is audit-logged. Files are outside the web root; there is no
 * public URL (FR-39).
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const { can } = require('../config/permissions');
const { Payslip, Employee, PayrollRun } = require('../models');
const { generatePayslipPdf, loadPayslip } = require('../services/payslipService');
const audit = require('../services/auditService');

const router = express.Router();
router.use(requireAuth);

const STORAGE_DIR = path.join(__dirname, '..', '..', 'storage', 'payslips');

/* --------------------------- GET /payslips --------------------- */
router.get('/', asyncHandler(async (req, res) => {
  const user = req.session.user;
  const viewAll = can(user.role, 'payslips.view_all');
  const viewOwn = can(user.role, 'payslips.view_own');
  if (!viewAll && !viewOwn) {
    await audit.log({ userId: user.id, userEmail: user.email, action: 'ACCESS_DENIED', entityType: 'ROUTE', entityId: '/payslips', detail: { role: user.role }, ip: req.ip });
    return res.status(403).render('pages/error', { statusCode: 403, message: 'You do not have permission to view payslips.' });
  }

  let where = {};
  let title = 'Payslips';

  if (!viewAll) {
    // Employee self-service: only their own payslips
    where = { employee_id: user.employeeId };
    title = 'My Payslips';
    if (!user.employeeId) {
      return res.render('payslips/index', { title, payslips: [], ownOnly: true, employees: [], runs: [] });
    }
  } else if (req.query.employee_id) {
    where.employee_id = req.query.employee_id;
  } else if (req.query.run_id) {
    where.run_id = req.query.run_id;
  }

  const payslips = await Payslip.findAll({
    where,
    include: [
      { model: Employee, as: 'employee', attributes: ['employee_no', 'first_name', 'last_name', 'position'] },
      { model: PayrollRun, as: 'run', attributes: ['id', 'period_year', 'period_month', 'pay_date'] },
    ],
    order: [['run_id', 'DESC'], ['employee_id', 'ASC']],
    limit: 200,
  });

  const [employees, runs] = viewAll
    ? await Promise.all([
        Employee.findAll({ attributes: ['id', 'employee_no', 'first_name', 'last_name'], order: [['employee_no', 'ASC']] }),
        PayrollRun.findAll({ attributes: ['id', 'period_year', 'period_month', 'run_number'], order: [['period_year', 'DESC'], ['period_month', 'DESC']] }),
      ])
    : [[], []];

  res.render('payslips/index', { title, payslips, ownOnly: !viewAll, employees, runs, filters: req.query });
}));

/* ------------------------- GET /payslips/:id/pdf --------------- */
router.get('/:id/pdf', asyncHandler(async (req, res) => {
  const user = req.session.user;
  const payslip = await Payslip.findByPk(req.params.id);
  if (!payslip) {
    req.flash('error', 'Payslip not found.');
    return res.redirect('/payslips');
  }

  const allowed = can(user.role, 'payslips.view_all')
    || (can(user.role, 'payslips.view_own') && Number(payslip.employee_id) === Number(user.employeeId));

  if (!allowed) {
    await audit.log({
      userId: user.id, userEmail: user.email,
      action: 'PAYSLIP_ACCESS_DENIED', entityType: 'PAYSLIP', entityId: payslip.id,
      detail: { reference: payslip.reference, role: user.role }, ip: req.ip,
    });
    return res.status(403).render('pages/error', {
      statusCode: 403,
      message: 'You are not allowed to view this payslip. This attempt has been recorded.',
    });
  }

  const { filePath, fileName } = await generatePayslipPdf(payslip.id);
  await audit.log({
    userId: user.id, userEmail: user.email,
    action: 'PAYSLIP_VIEWED', entityType: 'PAYSLIP', entityId: payslip.id,
    detail: { reference: payslip.reference }, ip: req.ip,
  });
  res.download(filePath, fileName);
}));

/* -------------------- POST /payslips/:id/regenerate ------------ */
router.post('/:id/regenerate', requirePermission('payslips.regenerate'), asyncHandler(async (req, res) => {
  const payslip = await Payslip.findByPk(req.params.id);
  if (!payslip) {
    req.flash('error', 'Payslip not found.');
    return res.redirect('/payslips');
  }
  const { fileName } = await generatePayslipPdf(payslip.id);
  await audit.log({
    userId: req.session.user.id, userEmail: req.session.user.email,
    action: 'PAYSLIP_REGENERATED', entityType: 'PAYSLIP', entityId: payslip.id,
    detail: { reference: payslip.reference, file: fileName }, ip: req.ip,
  });
  req.flash('success', `Payslip ${payslip.reference} regenerated.`);
  res.redirect(req.get('referer') || '/payslips');
}));

module.exports = router;
