/** AuditLog model — append-only trail (FR-49, FR-50). */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('audit_logs', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    user_email: { type: DataTypes.STRING(150), allowNull: true },
    action: { type: DataTypes.STRING(80), allowNull: false },
    entity_type: { type: DataTypes.STRING(50), allowNull: false },
    entity_id: { type: DataTypes.STRING(50), allowNull: true },
    detail: { type: DataTypes.JSON, allowNull: true },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
