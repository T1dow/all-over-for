/**
 * 001-create-users.js
 * System users with role-based access control (RBAC).
 * Roles are an enum here (5 fixed roles) — see docs/02 FR-02.
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.createTable('users', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.DataTypes.STRING(120), allowNull: false },
      email: { type: Sequelize.DataTypes.STRING(150), allowNull: false, unique: true },
      password_hash: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      role: {
        type: Sequelize.DataTypes.ENUM('ADMIN', 'PAYROLL_OFFICER', 'HR_OFFICER', 'MANAGEMENT', 'EMPLOYEE'),
        allowNull: false,
        defaultValue: 'EMPLOYEE',
      },
      employee_id: { type: Sequelize.DataTypes.INTEGER, allowNull: true, comment: 'Link for EMPLOYEE-role users' },
      is_active: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      must_change_password: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      failed_attempts: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      locked_until: { type: Sequelize.DataTypes.DATE, allowNull: true },
      last_login_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.addIndex('users', ['email'], { unique: true, transaction: tx });
    await qi.addIndex('users', ['role'], { transaction: tx });
  },
  down: async (qi) => {
    await qi.dropTable('users');
  },
};
