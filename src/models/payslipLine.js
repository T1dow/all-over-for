/** PayslipLine model — itemised earnings/deductions on a payslip. */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('payslip_lines', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    payslip_id: { type: DataTypes.INTEGER, allowNull: false },
    line_type: { type: DataTypes.ENUM('EARNING', 'DEDUCTION'), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  });
