/**
 * src/routes/reports.js
 * ------------------------------------------------------------------
 * Reports & exports (FR-44..FR-48):
 *   GET /reports                    landing/dashboard
 *   GET /reports/summary?run_id=    payroll summary (HTML + CSV/XLSX/PDF)
 *   GET /reports/departmental       by department
 *   GET /reports/remittance         SSNIT/PAYE remittance (GRA filing)
 *   GET /reports/employee           one employee's history
 *
 * Permission: reports.view (ADMIN, PAYROLL_OFFICER, MANAGEMENT).
 * ------------------------------------------------------------------
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const reportsService = require('../services/reportsService');
const { PayrollRun, Employee } = require('../models');
const { exportCsv, exportXlsx, exportPdf } = require('../utils/exporters');

const router = express.Router();
router.use(requireAuth, requirePermission('reports.view'));

const money = (n) => `GH₵ ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* --------------------------- GET /reports ---------------------- */
router.get('/', asyncHandler(async (req, res) => {
  const stats = await reportsService.dashboardStats();
  res.render('reports/index', {
    title: 'Reports',
    stats,
    money,
    runs: await PayrollRun.findAll({ order: [['period_year', 'DESC'], ['period_month', 'DESC'], ['run_number', 'DESC']] }),
    employees: await Employee.findAll({ attributes: ['id', 'employee_no', 'first_name', 'last_name'], order: [['employee_no', 'ASC']] }),
  });
}));

/* --------------------- GET /reports/summary -------------------- */
router.get('/summary', asyncHandler(async (req, res) => {
  const runId = req.query.run_id;
  const runs = await PayrollRun.findAll({ order: [['period_year', 'DESC'], ['period_month', 'DESC'], ['run_number', 'DESC']] });
  const selected = runId ? await reportsService.periodSummary(runId) : (runs[0] ? await reportsService.periodSummary(runs[0].id) : null);
  res.render('reports/summary', { title: 'Payroll Summary', runs, selected, money });
}));

/* ------------------ GET /reports/summary/export ---------------- */
router.get('/summary/export', asyncHandler(async (req, res) => {
  const runId = req.query.run_id;
  const fmt = req.query.format;
  const summary = runId ? await reportsService.periodSummary(runId) : null;
  if (!summary) {
    req.flash('error', 'No payroll run selected.');
    return res.redirect('/reports/summary');
  }

  const label = `${summary.run.period_year}-${String(summary.run.period_month).padStart(2, '0')}`;
  const headers = ['Reference', 'Employee No.', 'Name', 'Department', 'Position', 'Basic', 'Gross', 'SSNIT', 'PAYE', 'Total Deductions', 'Net'];
  const rows = summary.rows.map((r) => [r.reference, r.employeeNo, r.name, r.department, r.position, r.basic, r.gross, r.ssnit, r.paye, r.totalDeductions, r.net]);

  if (fmt === 'csv') {
    return exportCsv(res, `payroll-summary-${label}.csv`, headers, rows);
  }
  if (fmt === 'xlsx') {
    return exportXlsx(res, `payroll-summary-${label}.xlsx`, 'Payroll Summary', headers, rows);
  }
  if (fmt === 'pdf') {
    return exportPdf(res, `payroll-summary-${label}.pdf`, 'Payroll Summary', `Period ${label}`, headers, rows, money);
  }
  res.redirect('/reports/summary');
}));

/* --------------------- GET /reports/departmental --------------- */
router.get('/departmental', asyncHandler(async (req, res) => {
  const runs = await PayrollRun.findAll({ order: [['period_year', 'DESC'], ['period_month', 'DESC'], ['run_number', 'DESC']] });
  const report = req.query.run_id
    ? await reportsService.departmentalReport(req.query.run_id)
    : (runs[0] ? await reportsService.departmentalReport(runs[0].id) : null);
  res.render('reports/departmental', { title: 'Departmental Report', runs, report, money });
}));

/* --------------------- GET /reports/remittance ----------------- */
router.get('/remittance', asyncHandler(async (req, res) => {
  const runs = await PayrollRun.findAll({ order: [['period_year', 'DESC'], ['period_month', 'DESC'], ['run_number', 'DESC']] });
  const report = req.query.run_id
    ? await reportsService.remittanceReport(req.query.run_id)
    : (runs[0] ? await reportsService.remittanceReport(runs[0].id) : null);
  res.render('reports/remittance', { title: 'Remittance Report', runs, report, money });
}));

/* ---------------------- GET /reports/employee ------------------ */
router.get('/employee', asyncHandler(async (req, res) => {
  const employees = await Employee.findAll({ attributes: ['id', 'employee_no', 'first_name', 'last_name'], order: [['employee_no', 'ASC']] });
  const report = req.query.employee_id ? await reportsService.employeeHistory(req.query.employee_id) : null;
  res.render('reports/employee', { title: 'Employee Payslip History', employees, report, money });
}));

module.exports = router;
