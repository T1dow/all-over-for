/**
 * 007-create-payslips-and-lines.js
 * Payslip header (totals snapshot — the STORED authoritative values,
 * NFR-INTEG-02) + itemised lines (earnings and deductions, FR-30).
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.createTable('payslips', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      run_id: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'payroll_runs', key: 'id' }, onDelete: 'CASCADE' },
      employee_id: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'employees', key: 'id' } },
      reference: { type: Sequelize.DataTypes.STRING(20), allowNull: false, unique: true, comment: 'PS-YYYYMM-XXXXX (BR-06)' },
      basic_salary: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: false },
      gross: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: false },
      ssnit_amount: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      paye_amount: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total_deductions: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: false },
      net: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: false },
      days_paid: { type: Sequelize.DataTypes.STRING(10), allowNull: false, defaultValue: 'FULL' },
      status: { type: Sequelize.DataTypes.STRING(20), allowNull: false, defaultValue: 'PROCESSED' },
      pdf_generated_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.createTable('payslip_lines', {
      id: { type: Sequelize.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      payslip_id: { type: Sequelize.DataTypes.INTEGER, allowNull: false, references: { model: 'payslips', key: 'id' }, onDelete: 'CASCADE' },
      line_type: { type: Sequelize.DataTypes.ENUM('EARNING', 'DEDUCTION'), allowNull: false },
      name: { type: Sequelize.DataTypes.STRING(120), allowNull: false },
      amount: { type: Sequelize.DataTypes.DECIMAL(12, 2), allowNull: false },
      sort_order: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    }, { transaction: tx });

    await qi.addIndex('payslips', ['run_id', 'employee_id'], { unique: true, transaction: tx });
    await qi.addIndex('payslips', ['employee_id'], { transaction: tx });
    await qi.addIndex('payslip_lines', ['payslip_id'], { transaction: tx });
  },
  down: async (qi) => {
    await qi.dropTable('payslip_lines');
    await qi.dropTable('payslips');
  },
};
