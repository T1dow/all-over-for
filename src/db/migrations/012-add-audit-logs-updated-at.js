/**
 * 012-add-audit-logs-updated-at.js
 * Bug fix: the audit_logs table was created without an `updated_at`
 * column, but the Sequelize model expects it (default timestamps).
 * Without this, every audit insert failed with
 *   column "updated_at" of relation "audit_logs" does not exist
 * (the auditService's best-effort handler swallowed it silently).
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.addColumn('audit_logs', 'updated_at', {
      type: Sequelize.DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.DataTypes.NOW,
    }, { transaction: tx });
  },
  down: async (qi) => {
    await qi.removeColumn('audit_logs', 'updated_at');
  },
};
