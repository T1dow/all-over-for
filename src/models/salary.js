/** Salary model — basic salary history per employee (FR-16, FR-21). */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('salaries', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employee_id: { type: DataTypes.INTEGER, allowNull: false },
    basic_salary: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    effective_from: { type: DataTypes.DATEONLY, allowNull: false },
    note: { type: DataTypes.STRING(255), allowNull: true },
  });
