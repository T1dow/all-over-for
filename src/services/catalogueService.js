/**
 * src/services/catalogueService.js
 * ------------------------------------------------------------------
 * Allowance & deduction catalogue management (FR-17, FR-19):
 *  - list active/inactive
 *  - create / update / toggle-active
 *  - duplicate codes rejected; audit every change
 *
 * Catalogue entries are the building blocks the payroll engine
 * consumes (Stage 8). Statutory deductions (SSNIT, PAYE) are
 * catalogue rows with is_statutory=true — labels only; amounts are
 * computed by the engine.
 * ------------------------------------------------------------------
 */
const { Op } = require('sequelize');
const { Allowance, Deduction } = require('../models');
const audit = require('./auditService');

class CatalogueError extends Error {
  constructor(message) { super(message); }
}

const TYPES = ['FIXED', 'PERCENT'];

function validateBase(body, { percentAllowed = true } = {}) {
  const errors = [];
  const data = {
    name: String(body.name || '').trim(),
    code: String(body.code || '').trim().toUpperCase().replace(/\s+/g, '_'),
    type: body.type || 'FIXED',
    // Checkboxes: the form submits a hidden "off" when unchecked, or
    // nothing at all for fields not present on the form (new rows).
    taxable: body.taxable === undefined ? true : body.taxable === 'on',
    is_active: body.is_active === undefined ? true : body.is_active === 'on',
    default_amount: body.default_amount ? Number(body.default_amount) : null,
    default_percent: body.default_percent ? Number(body.default_percent) : null,
  };
  if (!data.name) errors.push('Name is required.');
  if (!data.code || !/^[A-Z0-9_]+$/.test(data.code)) errors.push('Code is required (letters, digits, underscore).');
  if (!TYPES.includes(data.type)) errors.push('Type must be FIXED or PERCENT.');
  if (data.type === 'PERCENT' && !percentAllowed) errors.push('Percent type is not allowed here.');
  if (data.default_amount !== null && (!Number.isFinite(data.default_amount) || data.default_amount < 0)) errors.push('Default amount must be a positive number.');
  if (data.default_percent !== null && (!Number.isFinite(data.default_percent) || data.default_percent < 0 || data.default_percent > 100)) errors.push('Default percent must be between 0 and 100.');
  return { data, errors };
}

/* -------------------------- Allowances ------------------------- */

async function listAllowances() {
  return Allowance.findAll({ order: [['is_active', 'DESC'], ['name', 'ASC']] });
}

async function createAllowance(body, actor) {
  const { data, errors } = validateBase(body);
  if (errors.length) throw new CatalogueError(errors.join(' '));
  const dup = await Allowance.findOne({ where: { code: data.code } });
  if (dup) throw new CatalogueError(`Allowance code ${data.code} already exists.`);
  const row = await Allowance.create(data);
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'ALLOWANCE_CREATED', entityType: 'ALLOWANCE', entityId: row.id,
    detail: { code: row.code, name: row.name, type: row.type }, ip: actor.ip,
  });
  return row;
}

async function updateAllowance(id, body, actor) {
  const row = await Allowance.findByPk(id);
  if (!row) throw new CatalogueError('Allowance not found.');
  const { data, errors } = validateBase(body);
  if (errors.length) throw new CatalogueError(errors.join(' '));
  const dup = await Allowance.findOne({ where: { code: data.code, id: { [Op.ne]: id } } });
  if (dup) throw new CatalogueError(`Allowance code ${data.code} already exists.`);
  const before = { name: row.name, type: row.type, taxable: row.taxable, is_active: row.is_active };
  Object.assign(row, data);
  await row.save();
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'ALLOWANCE_UPDATED', entityType: 'ALLOWANCE', entityId: row.id,
    detail: { before, after: { name: row.name, type: row.type, is_active: row.is_active } }, ip: actor.ip,
  });
  return row;
}

/* -------------------------- Deductions ------------------------- */

async function listDeductions() {
  return Deduction.findAll({ order: [['is_statutory', 'DESC'], ['is_active', 'DESC'], ['name', 'ASC']] });
}

async function createDeduction(body, actor) {
  const { data, errors } = validateBase(body);
  if (errors.length) throw new CatalogueError(errors.join(' '));
  const dup = await Deduction.findOne({ where: { code: data.code } });
  if (dup) throw new CatalogueError(`Deduction code ${data.code} already exists.`);
  const row = await Deduction.create({ ...data, is_statutory: false });
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'DEDUCTION_CREATED', entityType: 'DEDUCTION', entityId: row.id,
    detail: { code: row.code, name: row.name, type: row.type }, ip: actor.ip,
  });
  return row;
}

async function updateDeduction(id, body, actor) {
  const row = await Deduction.findByPk(id);
  if (!row) throw new CatalogueError('Deduction not found.');
  if (row.is_statutory) throw new CatalogueError('Statutory deductions cannot be edited — their amounts are computed by the engine.');
  const { data, errors } = validateBase(body);
  if (errors.length) throw new CatalogueError(errors.join(' '));
  const dup = await Deduction.findOne({ where: { code: data.code, id: { [Op.ne]: id } } });
  if (dup) throw new CatalogueError(`Deduction code ${data.code} already exists.`);
  const before = { name: row.name, type: row.type, is_active: row.is_active };
  Object.assign(row, data);
  await row.save();
  await audit.log({
    userId: actor.id, userEmail: actor.email,
    action: 'DEDUCTION_UPDATED', entityType: 'DEDUCTION', entityId: row.id,
    detail: { before, after: { name: row.name, type: row.type, is_active: row.is_active } }, ip: actor.ip,
  });
  return row;
}

module.exports = {
  listAllowances, createAllowance, updateAllowance,
  listDeductions, createDeduction, updateDeduction,
  CatalogueError,
};
