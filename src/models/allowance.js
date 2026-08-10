/** Allowance catalogue model (FR-17). */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('allowances', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    type: { type: DataTypes.ENUM('FIXED', 'PERCENT'), allowNull: false, defaultValue: 'FIXED' },
    taxable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    default_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    default_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });
