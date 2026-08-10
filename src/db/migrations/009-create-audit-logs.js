/**
 * 009-create-audit-logs.js
 * Append-only audit trail (FR-49, FR-50): actor, action, entity,
 * detail (JSON), IP address, timestamp. No UPDATE/DELETE paths exist
 * in the application for this table.
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.createTable('audit_logs', {
      id: { type: Sequelize.DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      user_email: { type: Sequelize.DataTypes.STRING(150), allowNull: true, comment: 'Denormalised for display after user deletion' },
      action: { type: Sequelize.DataTypes.STRING(80), allowNull: false },
      entity_type: { type: Sequelize.DataTypes.STRING(50), allowNull: false },
      entity_id: { type: Sequelize.DataTypes.STRING(50), allowNull: true },
      detail: { type: Sequelize.DataTypes.JSON, allowNull: true },
      ip_address: { type: Sequelize.DataTypes.STRING(45), allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.addIndex('audit_logs', ['action'], { transaction: tx });
    await qi.addIndex('audit_logs', ['entity_type', 'entity_id'], { transaction: tx });
    await qi.addIndex('audit_logs', ['user_id'], { transaction: tx });
    await qi.addIndex('audit_logs', ['created_at'], { transaction: tx });
  },
  down: async (qi) => {
    await qi.dropTable('audit_logs');
  },
};
