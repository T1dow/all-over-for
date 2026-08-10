/** SystemSetting model — key/value configuration (FR-51). */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('system_settings', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    value: { type: DataTypes.TEXT, allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    updated_by: { type: DataTypes.INTEGER, allowNull: true },
  });
