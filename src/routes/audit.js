/**
 * src/routes/audit.js
 * ------------------------------------------------------------------
 * Audit trail viewer (FR-49, FR-50) — ADMIN only (audit.view).
 *   GET /audit            filterable, paginated log
 *
 * The log is append-only from the application's perspective — there
 * is NO update/delete path in the UI. Filters: action, actor email,
 * entity type, date range. Every entry shows actor, action, entity,
 * detail (JSON), IP and timestamp.
 * ------------------------------------------------------------------
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePermission } = require('../middleware/rbac');
const { Op } = require('sequelize');
const { AuditLog } = require('../models');

const router = express.Router();
router.use(requireAuth, requirePermission('audit.view'));

const PAGE_SIZE = 100;

/* --------------------------- GET /audit ------------------------ */
router.get('/', asyncHandler(async (req, res) => {
  const { action, user, entity, from, to, page } = req.query;
  const where = {};

  if (action) where.action = { [Op.like]: `%${action}%` };
  if (user) {
    where[Op.or] = [
      { user_email: { [Op.like]: `%${user}%` } },
    ];
  }
  if (entity) where.entity_type = { [Op.like]: `%${entity}%` };
  if (from) where.created_at = { ...(where.created_at || {}), [Op.gte]: new Date(from) };
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    where.created_at = { ...(where.created_at || {}), [Op.lte]: end };
  }

  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const { count, rows } = await AuditLog.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
  });

  // Distinct values for the filter dropdowns (bounded).
  const [actions, entityTypes] = await Promise.all([
    AuditLog.findAll({ attributes: ['action'], group: ['action'], order: [['action', 'ASC']], raw: true, limit: 200 }),
    AuditLog.findAll({ attributes: ['entity_type'], group: ['entity_type'], order: [['entity_type', 'ASC']], raw: true, limit: 100 }),
  ]);

  res.render('audit/index', {
    title: 'Audit Log',
    entries: rows,
    total: count,
    page: currentPage,
    pages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
    filters: { action: action || '', user: user || '', entity: entity || '', from: from || '', to: to || '' },
    actions: actions.map((a) => a.action),
    entityTypes: entityTypes.map((e) => e.entity_type),
  });
}));

module.exports = router;
