/**
 * scripts/db-seed.js
 * Loads demo data for development and testing:
 *   npm run db:seed
 *
 * Seeds: departments, allowance & deduction catalogues, system settings
 * (including PAYE brackets and SSNIT rate — statutory rates are DATA,
 * not code), five role users, and ten realistic employees with salaries,
 * allowances and deductions.
 *
 * DEMO PASSWORDS (change immediately in a real deployment):
 *   admin@kbk.edu.gh     / Admin@123
 *   payroll@kbk.edu.gh   / Payroll@123
 *   hr@kbk.edu.gh        / Hr@123
 *   mgmt@kbk.edu.gh      / Mgmt@123
 *   e.g. kwame.mensah@kbk.edu.gh / Emp@123
 */
const { connectDB, closeDB } = require('../src/config/database');
const { runMigrations } = require('../src/db/runner');
const {
  User, Department, Employee, Salary, Allowance, EmployeeAllowance,
  Deduction, EmployeeDeduction, SystemSetting,
} = require('../src/models');
const { hashPassword } = require('../src/utils/passwords');

async function seed() {
  await connectDB();
  await runMigrations();

  const count = await User.count();
  if (count > 0) {
    console.log('[db:seed] Data already present — skipping (run `npm run db:reset` for a clean slate).');
    await closeDB();
    return;
  }

  /* ---------- Departments ---------- */
  const departments = await Department.bulkCreate([
    { name: 'Early Years', code: 'EY' },
    { name: 'Primary School', code: 'PR' },
    { name: 'Junior High School', code: 'JHS' },
    { name: 'Senior High School', code: 'SHS' },
    { name: 'Administration', code: 'ADM' },
    { name: 'Finance', code: 'FIN' },
    { name: 'Support Services', code: 'SUP' },
  ]);
  const byCode = Object.fromEntries(departments.map((d) => [d.code, d.id]));

  /* ---------- Allowance catalogue (FR-17) ---------- */
  await Allowance.bulkCreate([
    { name: 'Transport Allowance', code: 'TRANSPORT', type: 'FIXED', taxable: true, default_amount: 300 },
    { name: 'Housing Allowance', code: 'HOUSING', type: 'FIXED', taxable: true, default_amount: 500 },
    { name: 'Responsibility Allowance', code: 'RESPONSIBILITY', type: 'FIXED', taxable: true, default_amount: 0 },
    { name: 'Risk Allowance', code: 'RISK', type: 'FIXED', taxable: true, default_amount: 0 },
    { name: 'Book & Upkeep Allowance', code: 'BOOK_UPKEEP', type: 'FIXED', taxable: false, default_amount: 0 },
  ]);

  /* ---------- Deduction catalogue (FR-19) ---------- */
  await Deduction.bulkCreate([
    { name: 'SSNIT (Employee 5.5%)', code: 'SSNIT', type: 'FIXED', is_statutory: true, description: 'Computed by engine' },
    { name: 'PAYE Income Tax', code: 'PAYE', type: 'FIXED', is_statutory: true, description: 'Computed by engine' },
    { name: 'Staff Welfare', code: 'WELFARE', type: 'FIXED', default_amount: 50 },
    { name: 'Cooperative Contribution', code: 'COOP', type: 'FIXED' },
    { name: 'Loan Repayment', code: 'LOAN', type: 'FIXED' },
    { name: 'Union Dues', code: 'UNION', type: 'PERCENT', default_percent: 1 },
    { name: 'Provident Fund', code: 'PROVIDENT', type: 'PERCENT', default_percent: 5 },
  ]);
  const D = Object.fromEntries(
    (await Deduction.findAll()).map((d) => [d.code, d.id]),
  );

  /* ---------- System settings (FR-51) ---------- */
  const settings = [
    ['school.name', 'Kay-Billie-Klaer International School', 'School name shown on payslips and the UI'],
    ['school.address', 'Accra, Ghana', 'School address shown on payslips'],
    ['payroll.currency', 'GHS', 'Currency code'],
    ['payroll.pay_date', '25', 'Default day of month on which salaries are paid'],
    ['payroll.schedule_time', '08:00', 'Time of day for scheduled payroll runs'],
    ['email.enabled', 'true', 'Master switch for payslip email dispatch'],
    ['email.transport', 'json', 'Delivery transport: "smtp" (real) or "json" (demo/test capture)'],
    ['email.max_attempts', '3', 'Max delivery attempts before a notification is marked FAILED'],
    ['ssnit.rate', '5.5', 'SSNIT employee contribution rate (%)'],
    ['ssnit.ceiling_annual', '61000', 'SSNIT insurable earnings ceiling (GHS/year) — verify with SSNIT'],
    ['tax.paye_brackets',
      JSON.stringify([
        { up_to: 5880, rate: 0 },
        { up_to: 7200, rate: 5 },
        { up_to: 8760, rate: 10 },
        { up_to: 46760, rate: 17.5 },
        { up_to: 238760, rate: 25 },
        { up_to: 600000, rate: 30 },
        { up_to: null, rate: 35 },
      ]),
      'Annual PAYE brackets (GHS) — VERIFY CURRENT RATES WITH THE GRA before live use'],
  ];
  for (const [key, value, description] of settings) {
    await SystemSetting.create({ key, value, description });
  }

  /* ---------- Users (all five roles, FR-02) ---------- */
  const hash = (p) => hashPassword(p);
  const [admin, payroll, hr, mgmt] = await Promise.all([
    User.create({ name: 'System Administrator', email: 'admin@kbk.edu.gh', password_hash: await hash('Admin@123'), role: 'ADMIN' }),
    User.create({ name: 'Payroll Officer', email: 'payroll@kbk.edu.gh', password_hash: await hash('Payroll@123'), role: 'PAYROLL_OFFICER' }),
    User.create({ name: 'HR Officer', email: 'hr@kbk.edu.gh', password_hash: await hash('Hr@123'), role: 'HR_OFFICER' }),
    User.create({ name: 'School Management', email: 'mgmt@kbk.edu.gh', password_hash: await hash('Mgmt@123'), role: 'MANAGEMENT' }),
  ]);

  /* ---------- Employees ---------- */
  const A = Object.fromEntries((await Allowance.findAll()).map((a) => [a.code, a.id]));

  const people = [
    ['EPF-0001', 'Kwame', 'Mensah', 'MALE', 'kwame.mensah@kbk.edu.gh', 'ADM', 'Main Campus', 'Headmaster', 6500,
      [['TRANSPORT', 500], ['HOUSING', 800], ['RESPONSIBILITY', 1000]],
      [['WELFARE', 50, null], ['COOP', 200, null], ['LOAN', 350, '2026-12']]],
    ['EPF-0002', 'Ama', 'Serwaa', 'FEMALE', 'ama.serwaa@kbk.edu.gh', 'FIN', 'Main Campus', 'Accounts Officer', 4200,
      [['TRANSPORT', 350], ['RISK', 150]],
      [['WELFARE', 50, null], ['LOAN', 250, '2026-10']]],
    ['EPF-0003', 'Kofi', 'Boateng', 'MALE', 'kofi.boateng@kbk.edu.gh', 'ADM', 'Main Campus', 'ICT Coordinator', 4800,
      [['TRANSPORT', 400], ['RESPONSIBILITY', 300]],
      [['WELFARE', 50, null]]],
    ['EPF-0004', 'Abena', 'Owusu', 'FEMALE', 'abena.owusu@kbk.edu.gh', 'PR', 'Main Campus', 'Class Teacher', 3200,
      [['TRANSPORT', 300], ['BOOK_UPKEEP', 200]],
      [['WELFARE', 50, null], ['UNION', null, null]]],
    ['EPF-0005', 'Yaw', 'Adjei', 'MALE', 'yaw.adjei@kbk.edu.gh', 'JHS', 'Annex Campus', 'Mathematics Teacher', 3600,
      [['TRANSPORT', 300], ['RESPONSIBILITY', 400]],
      [['WELFARE', 50, null], ['UNION', null, null], ['COOP', 150, null]]],
    ['EPF-0006', 'Akosua', 'Frimpong', 'FEMALE', 'akosua.frimpong@kbk.edu.gh', 'EY', 'Annex Campus', 'Kindergarten Teacher', 3000,
      [['TRANSPORT', 250]],
      [['UNION', null, null]]],
    ['EPF-0007', 'Kojo', 'Asante', 'MALE', 'kojo.asante@kbk.edu.gh', 'SUP', 'Main Campus', 'Security Guard', 1500,
      [['RISK', 100]],
      []],
    ['EPF-0008', 'Efua', 'Ansah', 'FEMALE', 'efua.ansah@kbk.edu.gh', 'ADM', 'Main Campus', 'Secretary', 2800,
      [['TRANSPORT', 250]],
      [['WELFARE', 50, null]]],
    ['EPF-0009', 'Nana Yaa', 'Darko', 'FEMALE', 'nana.darko@kbk.edu.gh', 'SHS', 'Annex Campus', 'Science Teacher', 4000,
      [['TRANSPORT', 350], ['RESPONSIBILITY', 500]],
      [['WELFARE', 50, null], ['UNION', null, null]]],
    ['EPF-0010', 'Fiifi', 'Osei', 'MALE', 'fiifi.osei@kbk.edu.gh', 'SUP', 'Annex Campus', 'Cleaner', 1400,
      [['RISK', 80]],
      []],
  ];

  const employees = [];
  for (const [no, first, last, gender, email, dept, campus, position, basic, allowances, deductions] of people) {
    const emp = await Employee.create({
      employee_no: no,
      first_name: first,
      last_name: last,
      gender,
      email,
      phone: '024' + String(Math.floor(1000000 + Math.random() * 8999999)),
      ssnit_no: 'GHA-' + String(100000000 + Math.floor(Math.random() * 899999999)),
      bank_name: 'Ghana Commercial Bank',
      bank_account: String(101000 + Math.floor(Math.random() * 89999)),
      department_id: byCode[dept],
      position,
      campus,
      hire_date: `20${15 + Math.floor(Math.random() * 8)}-0${1 + Math.floor(Math.random() * 9)}-15`,
      employment_status: 'ACTIVE',
    });

    await Salary.create({
      employee_id: emp.id,
      basic_salary: basic,
      effective_from: '2024-01-01',
      note: 'Seed salary',
    });

    for (const [code, amount] of allowances) {
      await EmployeeAllowance.create({ employee_id: emp.id, allowance_id: A[code], amount });
    }
    for (const [code, amount, endMonth] of deductions) {
      const ded = D[code];
      await EmployeeDeduction.create({
        employee_id: emp.id,
        deduction_id: ded,
        amount: amount || null,
        percent: amount ? null : 1, // UNION dues default 1%
        end_month: endMonth,
      });
    }
    employees.push(emp);
  }

  // Employee-role user account for the first employee (self-service demo)
  await User.create({
    name: `${employees[0].first_name} ${employees[0].last_name}`,
    email: employees[0].email,
    password_hash: await hash('Emp@123'),
    role: 'EMPLOYEE',
    employee_id: employees[0].id,
    must_change_password: true,
  });

  console.log(`[db:seed] Done. ${departments.length} departments, ${people.length} employees, 5+ users, catalogues & settings loaded.`);
  console.log('[db:seed] Demo logins -> admin@kbk.edu.gh / Admin@123 (see script header for all).');
  await closeDB();
}

seed().catch((err) => {
  console.error('[db:seed] FAILED:', err);
  process.exit(1);
});
