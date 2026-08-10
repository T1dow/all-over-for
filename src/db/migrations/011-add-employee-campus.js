/**
 * 011-add-employee-campus.js
 * Adds the employee's campus/site to the employees table.
 * The school's payroll register (pay.png) has a "Campus" column —
 * employees are grouped by campus before department grouping.
 */
module.exports = {
  up: async (qi, Sequelize, tx) => {
    await qi.addColumn('employees', 'campus', {
      type: Sequelize.DataTypes.STRING(100),
      allowNull: true,
      comment: 'Campus/site the employee works at (from the school payroll register)',
    }, { transaction: tx });
  },
  down: async (qi) => {
    await qi.removeColumn('employees', 'campus');
  },
};
