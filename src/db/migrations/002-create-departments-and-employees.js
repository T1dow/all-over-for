/**
 * 002-create-departments-and-employees.js
 * School departments + employee master record (FR-09 .. FR-14).
 * employee_no and email are unique (FR-10). SSNIT/bank details are
 * masked in the UI (FR-14) — enforcement lives in the view layer.
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.createTable('departments', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.DataTypes.STRING(120), allowNull: false, unique: true },
      code: { type: Sequelize.DataTypes.STRING(20), allowNull: false, unique: true },
      description: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.createTable('employees', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_no: { type: Sequelize.DataTypes.STRING(20), allowNull: false, unique: true },
      first_name: { type: Sequelize.DataTypes.STRING(80), allowNull: false },
      last_name: { type: Sequelize.DataTypes.STRING(80), allowNull: false },
      other_names: { type: Sequelize.DataTypes.STRING(120), allowNull: true },
      gender: { type: Sequelize.DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'), allowNull: true },
      date_of_birth: { type: Sequelize.DataTypes.DATEONLY, allowNull: true },
      phone: { type: Sequelize.DataTypes.STRING(20), allowNull: true },
      email: { type: Sequelize.DataTypes.STRING(150), allowNull: false, unique: true, comment: 'Payslip delivery address' },
      address: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      ssnit_no: { type: Sequelize.DataTypes.STRING(20), allowNull: true, unique: true },
      bank_name: { type: Sequelize.DataTypes.STRING(80), allowNull: true },
      bank_account: { type: Sequelize.DataTypes.STRING(30), allowNull: true },
      department_id: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'departments', key: 'id' } },
      position: { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      hire_date: { type: Sequelize.DataTypes.DATEONLY, allowNull: false },
      employment_status: {
        type: Sequelize.DataTypes.ENUM('ACTIVE', 'ON_LEAVE', 'TERMINATED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.addIndex('employees', ['department_id'], { transaction: tx });
    await qi.addIndex('employees', ['employment_status'], { transaction: tx });
  },
  down: async (qi) => {
    await qi.dropTable('employees');
    await qi.dropTable('departments');
  },
};
