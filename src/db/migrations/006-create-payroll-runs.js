/**
 * 006-create-payroll-runs.js
 * One row per payroll processing event for a period.
 *
 * Duplicate-run prevention (BR-01) is enforced by the SERVICE layer
 * (friendlier error messages) AND by the database:
 *   unique(period_year, period_month, run_number)
 * A rerun (authorised override) gets run_number = 2, 3, ... and never
 * overwrites the original run — full audit trail.
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.createTable('payroll_runs', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      period_year: { type: Sequelize.DataTypes.INTEGER, allowNull: false },
      period_month: { type: Sequelize.DataTypes.INTEGER, allowNull: false, comment: '1-12' },
      run_number: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      status: {
        type: Sequelize.DataTypes.ENUM('PROCESSED', 'FINALISED'),
        allowNull: false,
        defaultValue: 'PROCESSED',
        comment: 'PROCESSED = computed & reviewable; FINALISED = approved & locked',
      },
      pay_date: { type: Sequelize.DataTypes.DATEONLY, allowNull: false },
      gross_total: { type: Sequelize.DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      deduction_total: { type: Sequelize.DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      net_total: { type: Sequelize.DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      employee_count: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      processed_by: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
      processed_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      finalised_by: { type: Sequelize.DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
      finalised_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
      rerun_of_id: { type: Sequelize.DataTypes.INTEGER, allowNull: true, references: { model: 'payroll_runs', key: 'id' } },
      rerun_reason: { type: Sequelize.DataTypes.TEXT, allowNull: true, comment: 'Required when run_number > 1' },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.addIndex('payroll_runs', ['period_year', 'period_month', 'run_number'], { unique: true, transaction: tx });
    await qi.addIndex('payroll_runs', ['status'], { transaction: tx });
  },
  down: async (qi) => {
    await qi.dropTable('payroll_runs');
  },
};
