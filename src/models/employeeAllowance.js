/** Employee-allowance assignment model (FR-18). */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('employee_allowances', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employee_id: { type: DataTypes.INTEGER, allowNull: false },
    allowance_id: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  });
