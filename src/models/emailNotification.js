/** EmailNotification model — delivery state machine (FR-34..FR-40). */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('email_notifications', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    payslip_id: { type: DataTypes.INTEGER, allowNull: false },
    run_id: { type: DataTypes.INTEGER, allowNull: false },
    employee_id: { type: DataTypes.INTEGER, allowNull: false },
    recipient_email: { type: DataTypes.STRING(150), allowNull: false },
    subject: { type: DataTypes.STRING(200), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    attachment_path: { type: DataTypes.STRING(255), allowNull: true },
    status: {
      type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED', 'RETRYING'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_error: { type: DataTypes.TEXT, allowNull: true },
    sent_at: { type: DataTypes.DATE, allowNull: true },
    next_retry_at: { type: DataTypes.DATE, allowNull: true },
  });
