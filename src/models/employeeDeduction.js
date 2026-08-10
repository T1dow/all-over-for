/** Employee-deduction assignment model (FR-20). */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('employee_deductions', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employee_id: { type: DataTypes.INTEGER, allowNull: false },
    deduction_id: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    end_month: { type: DataTypes.STRING(7), allowNull: true },
  });
