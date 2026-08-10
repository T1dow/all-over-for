/**
 * 010-create-system-settings.js
 * Key-value configuration (FR-51): school details, currency, pay date,
 * SSNIT rate/ceiling, PAYE brackets, email toggle. Statutory rates are
 * DATA, not code — they change without redeploying.
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.createTable('system_settings', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      key: { type: Sequelize.DataTypes.STRING(80), allowNull: false, unique: true },
      value: { type: Sequelize.DataTypes.TEXT, allowNull: false },
      description: { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      updated_by: { type: Sequelize.DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });
  },
  down: async (qi) => {
    await qi.dropTable('system_settings');
  },
};
