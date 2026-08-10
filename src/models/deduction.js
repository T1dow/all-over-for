/** Deduction catalogue model (FR-19). */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('deductions', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    type: { type: DataTypes.ENUM('FIXED', 'PERCENT'), allowNull: false, defaultValue: 'FIXED' },
    is_statutory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    default_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    default_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });
