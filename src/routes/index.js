/**
 * src/routes/index.js
 * Mounts all route modules. Auth-protected modules arrive in later
 * stages; each module is mounted with the middleware it needs.
 */
const express = require('express');
const homeRoutes = require('./home');
const healthRoutes = require('./health');
const authRoutes = require('./auth');
const dashboardRoutes = require('./dashboard');
const usersRoutes = require('./users');
const employeesRoutes = require('./employees');
const salariesRoutes = require('./salaries');
const allowancesRoutes = require('./allowances');
const deductionsRoutes = require('./deductions');
const payrollRoutes = require('./payroll');
const payslipsRoutes = require('./payslips');
const notificationsRoutes = require('./notifications');
const schedulerRoutes = require('./scheduler');
const reportsRoutes = require('./reports');
const settingsRoutes = require('./settings');
const auditRoutes = require('./audit');
const cronRoutes = require('./cron');

const router = express.Router();

router.use('/', homeRoutes);
router.use('/', authRoutes);
router.use('/', dashboardRoutes);
router.use('/users', usersRoutes);
router.use('/employees', employeesRoutes);
router.use('/', salariesRoutes); // salaries.js defines full /employees/... paths
router.use('/allowances', allowancesRoutes);
router.use('/deductions', deductionsRoutes);
router.use('/payroll', payrollRoutes);
router.use('/payslips', payslipsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/scheduler', schedulerRoutes);
router.use('/reports', reportsRoutes);
router.use('/settings', settingsRoutes);
router.use('/audit', auditRoutes);
router.use('/api/cron', cronRoutes);
router.use('/health', healthRoutes);

module.exports = router;
