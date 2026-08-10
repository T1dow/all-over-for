/**
 * src/routes/health.js
 * Liveness + database connectivity probe. Used by the deployment health
 * check and for quick verification that the whole stack is up.
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { sequelize } = require('../config/database');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  let db = 'disconnected';
  try {
    // Bound the check so /health never hangs (serverless 504s).
    const result = await Promise.race([
      sequelize.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db check timed out')), 5000)),
    ]);
    if (result) db = 'connected';
  } catch (e) {
    /* keep db = disconnected */
  }
  res.json({
    status: db === 'connected' ? 'ok' : 'degraded',
    app: process.env.APP_NAME || 'KBK Payroll System',
    uptimeSeconds: Math.floor(process.uptime()),
    database: db,
    timestamp: new Date().toISOString(),
  });
}));

module.exports = router;
