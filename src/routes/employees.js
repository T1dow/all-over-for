/**
 * src/routes/employees.js
 * ------------------------------------------------------------------
 * Employee management (FR-09 .. FR-14).
 *   GET  /employees            list + search/filter
 *   GET  /employees/new        create form
 *   POST /employees            create
 *   GET  /employees/:id        detail (masked sensitive fields)
 *   GET  /employees/:id/edit   edit form
 *   POST /employees/:id        update
 *   POST /employees/:id/status quick status change
 *
 * Permissions: employees.view (list/detail) and employees.manage
 * (create/edit/status). Enforced server-side via requirePermission.
 * ------------------------------------------------------------------
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const employeeService = require('../services/employeeService');
const { maskSsnit, maskAccount } = require('../utils/masking');
const { EmployeeAllowance, EmployeeDeduction, Allowance, Deduction, Salary } = require('../models');

const router = express.Router();
router.use(requireAuth);

/* -------------------------- GET /employees --------------------- */
router.get('/', requirePermission('employees.view'), asyncHandler(async (req, res) => {
  const { q, department_id, status, page } = req.query;
  const result = await employeeService.list({
    q, departmentId: department_id, status, page: parseInt(page, 10) || 1,
  });
  res.render('employees/index', {
    title: 'Employees',
    employees: result.rows,
    total: result.total,
    pages: result.pages,
    page: result.page,
    filters: { q: q || '', department_id: department_id || '', status: status || '' },
    departments: await employeeService.departments(),
    STATUSES: employeeService.STATUSES,
    maskSsnit, maskAccount,
  });
}));

/* ------------------------ GET /employees/new ------------------- */
router.get('/new', requirePermission('employees.manage'), asyncHandler(async (req, res) => {
  res.render('employees/form', {
    title: 'New Employee',
    employee: null,
    departments: await employeeService.departments(),
    STATUSES: employeeService.STATUSES,
    suggestedNo: await employeeService.nextEmployeeNo(),
    errors: [],
    values: {},
  });
}));

/* -------------------------- POST /employees -------------------- */
router.post('/', requirePermission('employees.manage'), asyncHandler(async (req, res) => {
  try {
    const employee = await employeeService.create(req.body, { ...req.session.user, ip: req.ip });
    req.flash('success', `Employee ${employee.employee_no} (${employee.first_name} ${employee.last_name}) registered.`);
    return res.redirect(`/employees/${employee.id}`);
  } catch (err) {
    if (err instanceof employeeService.EmployeeValidationError) {
      return res.status(422).render('employees/form', {
        title: 'New Employee',
        employee: null,
        departments: await employeeService.departments(),
        STATUSES: employeeService.STATUSES,
        suggestedNo: req.body.employee_no || '',
        errors: [err.message],
        values: req.body,
      });
    }
    throw err;
  }
}));

/* ------------------------- GET /employees/:id ------------------ */
router.get('/:id', requirePermission('employees.view'), asyncHandler(async (req, res) => {
  const employee = await employeeService.getById(req.params.id);
  if (!employee) {
    req.flash('error', 'Employee not found.');
    return res.redirect('/employees');
  }
  const [salary, allowances, deductions] = await Promise.all([
    Salary.findOne({ where: { employee_id: employee.id }, order: [['effective_from', 'DESC']] }),
    EmployeeAllowance.findAll({
      where: { employee_id: employee.id },
      include: [{ model: Allowance, as: 'allowance' }],
    }),
    EmployeeDeduction.findAll({
      where: { employee_id: employee.id },
      include: [{ model: Deduction, as: 'deduction' }],
    }),
  ]);
  const showFull = res.locals.can('salaries.manage');
  res.render('employees/show', {
    title: `${employee.first_name} ${employee.last_name}`,
    employee, salary, allowances, deductions,
    maskSsnit, maskAccount, showFull,
  });
}));

/* ---------------------- GET /employees/:id/edit ---------------- */
router.get('/:id/edit', requirePermission('employees.manage'), asyncHandler(async (req, res) => {
  const employee = await employeeService.getById(req.params.id, false);
  if (!employee) {
    req.flash('error', 'Employee not found.');
    return res.redirect('/employees');
  }
  res.render('employees/form', {
    title: `Edit ${employee.first_name} ${employee.last_name}`,
    employee,
    departments: await employeeService.departments(),
    STATUSES: employeeService.STATUSES,
    suggestedNo: employee.employee_no,
    errors: [],
    values: employee.toJSON(),
  });
}));

/* -------------------------- POST /employees/:id ---------------- */
router.post('/:id', requirePermission('employees.manage'), asyncHandler(async (req, res) => {
  try {
    const employee = await employeeService.update(req.params.id, req.body, { ...req.session.user, ip: req.ip });
    req.flash('success', 'Employee updated.');
    return res.redirect(`/employees/${employee.id}`);
  } catch (err) {
    if (err instanceof employeeService.EmployeeValidationError) {
      return res.status(422).render('employees/form', {
        title: 'Edit Employee',
        employee: { id: req.params.id },
        departments: await employeeService.departments(),
        STATUSES: employeeService.STATUSES,
        suggestedNo: req.body.employee_no || '',
        errors: [err.message],
        values: req.body,
      });
    }
    throw err;
  }
}));

/* --------------------- POST /employees/:id/status -------------- */
router.post('/:id/status', requirePermission('employees.manage'), asyncHandler(async (req, res) => {
  try {
    const employee = await employeeService.changeStatus(req.params.id, req.body.status, { ...req.session.user, ip: req.ip });
    req.flash('success', `${employee.employee_no} status changed to ${employee.employment_status}.`);
  } catch (err) {
    if (err instanceof employeeService.EmployeeValidationError) req.flash('error', err.message);
    else throw err;
  }
  res.redirect('/employees');
}));

module.exports = router;
