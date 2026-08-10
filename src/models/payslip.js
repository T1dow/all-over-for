/** Payslip model — stored authoritative totals (NFR-INTEG-02). */
module.exports = (sequelize, DataTypes) =>
  sequelize.define('payslips', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    run_id: { type: DataTypes.INTEGER, allowNull: false },
    employee_id: { type: DataTypes.INTEGER, allowNull: false },
    reference: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    basic_salary: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    gross: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    ssnit_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    paye_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    total_deductions: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    net: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    days_paid: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'FULL' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PROCESSED' },
    pdf_generated_at: { type: DataTypes.DATE, allowNull: true },
  });
