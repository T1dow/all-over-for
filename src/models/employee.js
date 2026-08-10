/** Employee model — master employee record (FR-09..FR-14). */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('employees', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employee_no: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    first_name: { type: DataTypes.STRING(80), allowNull: false },
    last_name: { type: DataTypes.STRING(80), allowNull: false },
    other_names: { type: DataTypes.STRING(120), allowNull: true },
    gender: { type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'), allowNull: true },
    date_of_birth: { type: DataTypes.DATEONLY, allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    ssnit_no: { type: DataTypes.STRING(20), allowNull: true, unique: true },
    bank_name: { type: DataTypes.STRING(80), allowNull: true },
    bank_account: { type: DataTypes.STRING(30), allowNull: true },
    department_id: { type: DataTypes.INTEGER, allowNull: false },
    position: { type: DataTypes.STRING(100), allowNull: false },
    campus: { type: DataTypes.STRING(100), allowNull: true, comment: 'Campus/site (from school payroll register)' },
    hire_date: { type: DataTypes.DATEONLY, allowNull: false },
    employment_status: {
      type: DataTypes.ENUM('ACTIVE', 'ON_LEAVE', 'TERMINATED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
  });
