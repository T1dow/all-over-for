/**
 * src/services/employeeService.js
 * ------------------------------------------------------------------
 * Employee management business logic (FR-09 .. FR-14):
 *  - list with search & filters (FR-12)
 *  - create / update with uniqueness rules (FR-10)
 *  - employment status changes (FR-11)
 *  - audit logging of every mutation
 *
 * All money/identifier decisions live here so the routes stay thin and
 * the logic is unit-testable without HTTP.
 * ------------------------------------------------------------------
 */
const { Op } = require('sequelize');
const { Employee, Department } = require('../models');
const audit = require('./auditService');

/** Unique-value validation errors carry `field` so the route can map them. */
class EmployeeValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
  }
}

const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const STATUSES = ['ACTIVE', 'ON_LEAVE', 'TERMINATED'];

async function list({ q = '', departmentId = null, status = '', page = 1, pageSize = 50 } = {}) {
  const where = {};
  const terms = [];

  if (q && String(q).trim()) {
    const needle = `%${String(q).trim()}%`;
    terms.push(
      { employee_no: { [Op.iLike]: needle } },
      { first_name: { [Op.iLike]: needle } },
      { last_name: { [Op.iLike]: needle } },
      { email: { [Op.iLike]: needle } },
    );
  }
  if (terms.length) where[Op.or] = terms;
  if (departmentId) where.department_id = departmentId;
  if (status) where.employment_status = status;

  const { count, rows } = await Employee.findAndCountAll({
    where,
    include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }],
    order: [['employee_no', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true,
  });

  return { rows, total: count, page, pages: Math.max(1, Math.ceil(count / pageSize)) };
}

async function getById(id, withDepartment = true) {
  const options = { where: { id: Number(id) } };
  if (withDepartment) {
    options.include = [{ model: Department, as: 'department', attributes: ['id', 'name'] }];
  }
  return Employee.findOne(options);
}

async function departments() {
  return Department.findAll({ order: [['name', 'ASC']] });
}

/** Suggest the next employee number, e.g. EPF-0011. */
async function nextEmployeeNo() {
  const last = await Employee.findOne({ order: [['id', 'DESC']], attributes: ['employee_no'] });
  if (!last) return 'EPF-0001';
  const m = String(last.employee_no).match(/(\d+)$/);
  const n = m ? parseInt(m[1], 10) + 1 : 1;
  return `EPF-${String(n).padStart(4, '0')}`;
}

/** Validate and normalise the common employee fields. */
function validateFields(body) {
  const errors = [];
  const data = {
    employee_no: String(body.employee_no || '').trim(),
    first_name: String(body.first_name || '').trim(),
    last_name: String(body.last_name || '').trim(),
    other_names: String(body.other_names || '').trim() || null,
    gender: body.gender || null,
    date_of_birth: body.date_of_birth || null,
    phone: String(body.phone || '').trim() || null,
    email: String(body.email || '').trim().toLowerCase(),
    address: String(body.address || '').trim() || null,
    ssnit_no: String(body.ssnit_no || '').trim() || null,
    bank_name: String(body.bank_name || '').trim() || null,
    bank_account: String(body.bank_account || '').trim() || null,
    department_id: Number(body.department_id),
    position: String(body.position || '').trim(),
    campus: String(body.campus || '').trim() || null,
    hire_date: body.hire_date || null,
    employment_status: body.employment_status || 'ACTIVE',
  };

  if (!data.employee_no) errors.push('Employee number is required.');
  else if (!/^[A-Za-z0-9-]+$/.test(data.employee_no)) errors.push('Employee number may contain only letters, digits and hyphens.');
  if (!data.first_name) errors.push('First name is required.');
  if (!data.last_name) errors.push('Last name is required.');
  if (!data.email) errors.push('Email is required.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Enter a valid email address.');
  if (!data.department_id) errors.push('Department is required.');
  if (!data.position) errors.push('Position is required.');
  if (!data.hire_date) errors.push('Hire date is required.');
  if (data.gender && !GENDERS.includes(data.gender)) errors.push('Invalid gender.');
  if (data.employment_status && !STATUSES.includes(data.employment_status)) errors.push('Invalid employment status.');

  return { data, errors };
}

async function assertUnique(employeeNo, email, excludeId = null) {
  const or = [{ employee_no: employeeNo }];
  if (email) or.push({ email });
  const where = { [Op.or]: or };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const existing = await Employee.findOne({ where });
  if (existing) {
    if (existing.employee_no === employeeNo) throw new EmployeeValidationError(`Employee number ${employeeNo} is already in use.`, 'employee_no');
    throw new EmployeeValidationError('A employee with this email address already exists.', 'email');
  }
}

async function create(body, actor) {
  const { data, errors } = validateFields(body);
  if (errors.length) throw new EmployeeValidationError(errors.join(' '), null);

  await assertUnique(data.employee_no, data.email);

  const employee = await Employee.create(data);
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'EMPLOYEE_CREATED', entityType: 'EMPLOYEE', entityId: employee.id,
    detail: { employee_no: employee.employee_no, name: `${employee.first_name} ${employee.last_name}` },
    ip: actor.ip,
  });
  return employee;
}

async function update(id, body, actor) {
  const employee = await getById(id, false);
  if (!employee) throw new EmployeeValidationError('Employee not found.', null);

  const { data, errors } = validateFields(body);
  if (errors.length) throw new EmployeeValidationError(errors.join(' '), null);

  await assertUnique(data.employee_no, data.email, id);

  const before = {
    employee_no: employee.employee_no,
    name: `${employee.first_name} ${employee.last_name}`,
    department_id: employee.department_id,
    position: employee.position,
    employment_status: employee.employment_status,
    campus: employee.campus,
  };

  Object.assign(employee, data);
  await employee.save();

  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'EMPLOYEE_UPDATED', entityType: 'EMPLOYEE', entityId: employee.id,
    detail: {
      employee_no: employee.employee_no,
      before: { status: before.employment_status, position: before.position, campus: before.campus },
      after: { status: employee.employment_status, position: employee.position, campus: employee.campus },
    },
    ip: actor.ip,
  });
  return employee;
}

/** Quick employment-status change from the list screen (FR-11). */
async function changeStatus(id, status, actor) {
  if (!STATUSES.includes(status)) throw new EmployeeValidationError('Invalid employment status.', null);
  const employee = await getById(id, false);
  if (!employee) throw new EmployeeValidationError('Employee not found.', null);

  const before = employee.employment_status;
  employee.employment_status = status;
  await employee.save();

  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'EMPLOYEE_STATUS_CHANGED', entityType: 'EMPLOYEE', entityId: employee.id,
    detail: { employee_no: employee.employee_no, before, after: status },
    ip: actor.ip,
  });
  return employee;
}

module.exports = {
  list, getById, departments, nextEmployeeNo, create, update, changeStatus,
  EmployeeValidationError, GENDERS, STATUSES,
};
