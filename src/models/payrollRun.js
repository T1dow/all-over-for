/** PayrollRun model — one row per processing event per period (BR-01). */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('payroll_runs', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    period_year: { type: DataTypes.INTEGER, allowNull: false },
    period_month: { type: DataTypes.INTEGER, allowNull: false },
    run_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    status: {
      type: DataTypes.ENUM('PROCESSED', 'FINALISED'),
      allowNull: false,
      defaultValue: 'PROCESSED',
    },
    pay_date: { type: DataTypes.DATEONLY, allowNull: false },
    gross_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    deduction_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    net_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    employee_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    processed_by: { type: DataTypes.INTEGER, allowNull: false },
    processed_at: { type: DataTypes.DATE, allowNull: false },
    finalised_by: { type: DataTypes.INTEGER, allowNull: true },
    finalised_at: { type: DataTypes.DATE, allowNull: true },
    rerun_of_id: { type: DataTypes.INTEGER, allowNull: true },
    rerun_reason: { type: DataTypes.TEXT, allowNull: true },
  });
