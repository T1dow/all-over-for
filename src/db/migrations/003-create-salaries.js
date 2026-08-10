/**
 * 003-create-salaries.js
 * Salary history per employee (FR-16). One row per (employee, effective_from).
 * The payroll engine picks the latest effective_from <= period start,
 * giving effective-dated salary changes (FR-21) for free.
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.createTable('salaries', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      basic_salary: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: false },
      effective_from: { type: Sequelize.DataTypes.DATEONLY, allowNull: false },
      note: { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.addIndex('salaries', ['employee_id', 'effective_from'], { unique: true, transaction: tx });
  },
  down: async (qi) => {
    await qi.dropTable('salaries');
  },
};
