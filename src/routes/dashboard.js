/**
 * src/routes/dashboard.js
 * Role-aware dashboard. Each role sees only the statistics and actions
 * its permissions allow (deny by default). Counts come from the tables
 * that exist; stage-specific modules add their own widgets later.
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { can } = require('../config/permissions');
const { User, Employee, Department, PayrollRun, Payslip, EmailNotification } = require('../models');

const router = express.Router();

router.get('/dashboard', requireAuth, asyncHandler(async (req, res) => {
  const role = req.session.user.role;
  const data = { role };

  if (can(role, 'users.manage')) {
    data.userCount = await User.count();
  }
  if (can(role, 'employees.view')) {
    data.employeeCount = await Employee.count();
    data.departmentCount = await Department.count();
  }
  if (can(role, 'payroll.process')) {
    data.runCount = await PayrollRun.count();
    data.latestRun = await PayrollRun.findOne({ order: [['period_year', 'DESC'], ['period_month', 'DESC']] });
  }
  if (can(role, 'payslips.view_own') && req.session.user.employeeId) {
    data.myPayslipCount = await Payslip.count({ where: { employee_id: req.session.user.employeeId } });
    data.myNotifications = await EmailNotification.count({
      where: { employee_id: req.session.user.employeeId },
    });
  }

  res.render('pages/dashboard', { title: 'Dashboard', user: req.session.user, data });
}));

module.exports = router;
