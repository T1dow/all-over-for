/**
 * src/models/index.js
 * Loads every model, sets up associations, and exports a single object.
 * The rest of the app imports models from here only.
 */
const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

const User = require('./user')(sequelize, DataTypes);
const Department = require('./department')(sequelize, DataTypes);
const Employee = require('./employee')(sequelize, DataTypes);
const Salary = require('./salary')(sequelize, DataTypes);
const Allowance = require('./allowance')(sequelize, DataTypes);
const EmployeeAllowance = require('./employeeAllowance')(sequelize, DataTypes);
const Deduction = require('./deduction')(sequelize, DataTypes);
const EmployeeDeduction = require('./employeeDeduction')(sequelize, DataTypes);
const PayrollRun = require('./payrollRun')(sequelize, DataTypes);
const Payslip = require('./payslip')(sequelize, DataTypes);
const PayslipLine = require('./payslipLine')(sequelize, DataTypes);
const EmailNotification = require('./emailNotification')(sequelize, DataTypes);
const AuditLog = require('./auditLog')(sequelize, DataTypes);
const SystemSetting = require('./systemSetting')(sequelize, DataTypes);

/* ------------------------- Associations ------------------------- */

// Departments & employees
Department.hasMany(Employee, { foreignKey: 'department_id', as: 'employees' });
Employee.belongsTo(Department, { foreignKey: 'department_id', as: 'department' });

// Salary history
Employee.hasMany(Salary, { foreignKey: 'employee_id', as: 'salaries' });
Salary.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// Allowances
Allowance.hasMany(EmployeeAllowance, { foreignKey: 'allowance_id', as: 'assignments' });
Employee.hasMany(EmployeeAllowance, { foreignKey: 'employee_id', as: 'allowances' });
EmployeeAllowance.belongsTo(Allowance, { foreignKey: 'allowance_id', as: 'allowance' });
EmployeeAllowance.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// Deductions
Deduction.hasMany(EmployeeDeduction, { foreignKey: 'deduction_id', as: 'assignments' });
Employee.hasMany(EmployeeDeduction, { foreignKey: 'employee_id', as: 'deductions' });
EmployeeDeduction.belongsTo(Deduction, { foreignKey: 'deduction_id', as: 'deduction' });
EmployeeDeduction.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// Payroll runs
PayrollRun.hasMany(Payslip, { foreignKey: 'run_id', as: 'payslips' });
PayrollRun.hasMany(EmailNotification, { foreignKey: 'run_id', as: 'notifications' });
PayrollRun.belongsTo(User, { foreignKey: 'processed_by', as: 'processor' });
PayrollRun.belongsTo(User, { foreignKey: 'finalised_by', as: 'finaliser' });
PayrollRun.belongsTo(PayrollRun, { foreignKey: 'rerun_of_id', as: 'rerunOf' });

// Payslips
Payslip.belongsTo(PayrollRun, { foreignKey: 'run_id', as: 'run' });
Payslip.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
Payslip.hasMany(PayslipLine, { foreignKey: 'payslip_id', as: 'lines' });
Payslip.hasMany(EmailNotification, { foreignKey: 'payslip_id', as: 'notifications' });
PayslipLine.belongsTo(Payslip, { foreignKey: 'payslip_id', as: 'payslip' });

// Email notifications
EmailNotification.belongsTo(Payslip, { foreignKey: 'payslip_id', as: 'payslip' });
EmailNotification.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
EmailNotification.belongsTo(PayrollRun, { foreignKey: 'run_id', as: 'run' });

// Audit log
User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditEntries' });
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Employee-linked user accounts
Employee.hasOne(User, { foreignKey: 'employee_id', as: 'userAccount' });
User.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

module.exports = {
  sequelize,
  User,
  Department,
  Employee,
  Salary,
  Allowance,
  EmployeeAllowance,
  Deduction,
  EmployeeDeduction,
  PayrollRun,
  Payslip,
  PayslipLine,
  EmailNotification,
  AuditLog,
  SystemSetting,
};
