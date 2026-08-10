/**
 * 008-create-email-notifications.js
 * Email notification records with delivery state machine (FR-34..FR-40):
 * PENDING -> SENT | PENDING -> FAILED -> RETRYING -> SENT/FAILED
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.createTable('email_notifications', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      payslip_id: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'payslips', key: 'id' }, onDelete: 'CASCADE' },
      run_id: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'payroll_runs', key: 'id' }, onDelete: 'CASCADE' },
      employee_id: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'employees', key: 'id' } },
      recipient_email: { type: Sequelize.DataTypes.STRING(150), allowNull: false },
      subject: { type: Sequelize.DataTypes.STRING(200), allowNull: false },
      body: { type: Sequelize.DataTypes.TEXT, allowNull: false },
      attachment_path: { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      status: {
        type: Sequelize.DataTypes.ENUM('PENDING', 'SENT', 'FAILED', 'RETRYING'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      attempts: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      last_error: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      sent_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
      next_retry_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.addIndex('email_notifications', ['status'], { transaction: tx });
    await qi.addIndex('email_notifications', ['run_id'], { transaction: tx });
    await qi.addIndex('email_notifications', ['employee_id'], { transaction: tx });
    await qi.addIndex('email_notifications', ['next_retry_at'], { transaction: tx });
  },
  down: async (qi) => {
    await qi.dropTable('email_notifications');
  },
};
