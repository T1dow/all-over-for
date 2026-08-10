/** Department model. */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('departments', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    description: { type: DataTypes.TEXT, allowNull: true },
  });
