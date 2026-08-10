/**
 * 004-create-allowances.js
 * Allowance catalogue (FR-17) + employee assignments (FR-18).
 * type: FIXED (cedis amount) or PERCENT (of basic salary).
 * taxable: whether the allowance counts toward PAYE chargeable income.
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.createTable('allowances', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.DataTypes.STRING(120), allowNull: false },
      code: { type: Sequelize.DataTypes.STRING(30), allowNull: false, unique: true },
      type: { type: Sequelize.DataTypes.ENUM('FIXED', 'PERCENT'), allowNull: false, defaultValue: 'FIXED' },
      taxable: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      default_amount: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: true },
      default_percent: { type: Sequelize.DataTypes.DECIMAL(5, 2), allowNull: true },
      is_active: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.createTable('employee_allowances', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'employees', key: 'id' }, onDelete: 'CASCADE' },
      allowance_id: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'allowances', key: 'id' }, onDelete: 'CASCADE' },
      amount: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: true, comment: 'Used when allowance type is FIXED' },
      percent: { type: Sequelize.DataTypes.DECIMAL(5, 2), allowNull: true, comment: 'Used when allowance type is PERCENT' },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.addIndex('employee_allowances', ['employee_id', 'allowance_id'], { unique: true, transaction: tx });
  },
  down: async (qi) => {
    await qi.dropTable('employee_allowances');
    await qi.dropTable('allowances');
  },
};
