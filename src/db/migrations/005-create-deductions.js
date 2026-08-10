/**
 * 005-create-deductions.js
 * Deduction catalogue (FR-19) + employee assignments (FR-20).
 * Statutory deductions (SSNIT, PAYE) are computed by the engine and
 * exist in the catalogue as reporting labels (is_statutory = true).
 * Custom deductions (loans, welfare, cooperatives, union dues) are
 * FIXED or PERCENT, with an optional end_month for repayments.
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.createTable('deductions', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.DataTypes.STRING(120), allowNull: false },
      code: { type: Sequelize.DataTypes.STRING(30), allowNull: false, unique: true },
      type: { type: Sequelize.DataTypes.ENUM('FIXED', 'PERCENT'), allowNull: false, defaultValue: 'FIXED' },
      is_statutory: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      default_amount: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: true },
      default_percent: { type: Sequelize.DataTypes.DECIMAL(5, 2), allowNull: true },
      is_active: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.createTable('employee_deductions', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'employees', key: 'id' }, onDelete: 'CASCADE' },
      deduction_id: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'deductions', key: 'id' }, onDelete: 'CASCADE' },
      amount: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: true },
      percent: { type: Sequelize.DataTypes.DECIMAL(5, 2), allowNull: true },
      end_month: { type: Sequelize.DataTypes.STRING(7), allowNull: true, comment: 'YYYY-MM; deduction stops after this month (loan schedules)' },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.addIndex('employee_deductions', ['employee_id', 'deduction_id'], { unique: true, transaction: tx });
  },
  down: async (qi) => {
    await qi.dropTable('employee_deductions');
    await qi.dropTable('deductions');
  },
};
