/**
 * src/services/payslipService.js
 * ------------------------------------------------------------------
 * Payslip PDF generation (Stage 10, FR-30/FR-31/FR-33).
 *
 * Produces a professional A4 payslip matching the reference design in
 * docs/00 — seven zones:
 *   1. School header (name, address, "PAYSLIP", period)
 *   2. Employee block (employee no., name, department, position,
 *      SSNIT number, pay date, reference)
 *   3. Earnings table (basic salary + each allowance)
 *   4. Deductions table (SSNIT, PAYE, custom)
 *   5. Totals (gross, total deductions, NET PAY)
 *   6. Net pay in words
 *   7. Footer (payment channel, "computer-generated — no signature
 *      required", generation timestamp, reference)
 *
 * SECURITY: files are written to storage/payslips/ which is OUTSIDE
 * the web root (src/public). There is no public URL — downloads go
 * through an authenticated, permission-checked route (FR-39).
 * ------------------------------------------------------------------
 */
const path = require('path');
const fs = require('fs');
const pdfMake = require('pdfmake/build/pdfmake');
const vfsFonts = require('pdfmake/build/vfs_fonts');

pdfMake.vfs = vfsFonts.vfs || (vfsFonts.pdfMake && vfsFonts.pdfMake.vfs) || vfsFonts;

const { Payslip, PayslipLine, Employee, PayrollRun, Department } = require('../models');
const { amountInWords } = require('../utils/numberToWords');
const { getSetting } = require('../utils/settings');

const STORAGE_DIR = process.env.VERCEL === '1'
  ? path.join('/tmp', 'payslips') // Vercel: ephemeral, regenerated on demand
  : path.join(__dirname, '..', '..', 'storage', 'payslips');

const money = (n) => `GH₵ ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Load a payslip with everything the PDF needs. */
async function loadPayslip(payslipId) {
  return Payslip.findByPk(payslipId, {
    include: [
      { model: Employee, as: 'employee', include: [{ model: Department, as: 'department' }] },
      { model: PayrollRun, as: 'run' },
      { model: PayslipLine, as: 'lines', order: [['sort_order', 'ASC']] },
    ],
  });
}

function buildDocDefinition(payslip, school) {
  const emp = payslip.employee;
  const period = `${payslip.run.period_year}-${String(payslip.run.period_month).padStart(2, '0')}`;
  const earnings = payslip.lines.filter((l) => l.line_type === 'EARNING');
  const deductions = payslip.lines.filter((l) => l.line_type === 'DEDUCTION');

  const table = (rows, widths) => ({
    layout: {
      hLineWidth: (i) => (i === 0 || i === rows.length ? 1 : 0.4),
      vLineWidth: () => 0.4,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    // pdfmake requires widths/body nested under `table`:
    table: { widths, body: rows },
  });

  const labelStyle = { fontSize: 9, bold: true, color: '#4a5568' };

  return {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 36],
    info: {
      title: `Payslip ${payslip.reference} — ${period}`,
      author: school.name,
    },
    content: [
      // ---- Zone 1: school header ----
      {
        table: {
          widths: ['*'],
          body: [[
            {
              text: school.name,
              alignment: 'center',
              bold: true,
              fontSize: 16,
              color: '#1a3a6b',
              margin: [0, 0, 0, 2],
            },
          ]],
        },
        layout: 'noBorders',
      },
      {
        text: school.address,
        alignment: 'center',
        fontSize: 9,
        color: '#666',
        margin: [0, 0, 0, 2],
      },
      {
        text: 'P A Y S L I P',
        alignment: 'center',
        fontSize: 13,
        bold: true,
        color: '#1a3a6b',
        margin: [0, 4, 0, 0],
      },
      {
        text: `Pay Period: ${period}  ·  Pay Date: ${payslip.run.pay_date}`,
        alignment: 'center',
        fontSize: 9,
        color: '#444',
        margin: [0, 2, 0, 10],
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 519, y2: 0, lineWidth: 1.2, lineColor: '#1a3a6b' }],
        margin: [0, 0, 0, 10],
      },

      // ---- Zone 2: employee block ----
      table([
        [
          { text: 'Employee No.', ...labelStyle },
          { text: emp.employee_no, fontSize: 10 },
          { text: 'Department', ...labelStyle },
          { text: emp.department ? emp.department.name : '—', fontSize: 10 },
        ],
        [
          { text: 'Employee Name', ...labelStyle },
          { text: `${emp.first_name} ${emp.last_name}`, fontSize: 10 },
          { text: 'Position', ...labelStyle },
          { text: emp.position, fontSize: 10 },
        ],
        [
          { text: 'SSNIT No.', ...labelStyle },
          { text: emp.ssnit_no || '—', fontSize: 10 },
          { text: 'Reference No.', ...labelStyle },
          { text: payslip.reference, fontSize: 10, bold: true },
        ],
      ], ['*', '*', '*', '*']),

      // ---- Zone 3: earnings ----
      { text: 'EARNINGS', style: 'sectionTitle', margin: [0, 14, 0, 4] },
      table(
        [
          [{ text: 'Description', ...labelStyle }, { text: 'Amount', ...labelStyle, alignment: 'right' }],
          ...earnings.map((l) => [{ text: l.name, fontSize: 10 }, { text: money(l.amount), fontSize: 10, alignment: 'right' }]),
          [
            { text: 'GROSS SALARY', bold: true, fontSize: 10.5 },
            { text: money(payslip.gross), bold: true, fontSize: 10.5, alignment: 'right' },
          ],
        ],
        ['*', 130],
      ),

      // ---- Zone 4: deductions ----
      { text: 'DEDUCTIONS', style: 'sectionTitle', margin: [0, 14, 0, 4] },
      table(
        [
          [{ text: 'Description', ...labelStyle }, { text: 'Amount', ...labelStyle, alignment: 'right' }],
          ...deductions.map((l) => [{ text: l.name, fontSize: 10 }, { text: money(l.amount), fontSize: 10, alignment: 'right' }]),
          [
            { text: 'TOTAL DEDUCTIONS', bold: true, fontSize: 10.5 },
            { text: money(payslip.total_deductions), bold: true, fontSize: 10.5, alignment: 'right' },
          ],
        ],
        ['*', 130],
      ),

      // ---- Zone 5: net pay ----
      {
        table: {
          widths: ['*', 170],
          body: [[
            { text: 'NET PAY', bold: true, fontSize: 13, color: '#1a3a6b' },
            { text: money(payslip.net), bold: true, fontSize: 13, color: '#1a3a6b', alignment: 'right' },
          ]],
        },
        layout: {
          hLineWidth: (i) => (i === 1 ? 1.2 : 0.4),
          vLineWidth: () => 0.4,
          paddingTop: () => 7,
          paddingBottom: () => 7,
          paddingLeft: () => 8,
          paddingRight: () => 8,
        },
        margin: [0, 14, 0, 4],
      },

      // ---- Zone 6: net pay in words ----
      {
        text: `Amount in words: ${amountInWords(payslip.net)}`,
        fontSize: 9.5,
        italics: true,
        color: '#333',
        margin: [0, 4, 0, 10],
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 519, y2: 0, lineWidth: 0.8, lineColor: '#999' }],
        margin: [0, 0, 0, 8],
      },

      // ---- Zone 7: footer ----
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Payment details', ...labelStyle },
              { text: `Bank: ${emp.bank_name || '—'}`, fontSize: 9 },
              { text: `Account: ${emp.bank_account ? emp.bank_account.replace(/.(?=.{4})/g, '*') : '—'}`, fontSize: 9 },
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'This payslip', ...labelStyle },
              { text: 'Computer-generated payslip — no signature required.', fontSize: 9 },
              { text: `Generated: ${new Date(payslip.pdf_generated_at || payslip.updated_at).toLocaleString('en-GB')}`, fontSize: 9 },
              { text: `Reference: ${payslip.reference}`, fontSize: 9, color: '#666' },
            ],
          },
        ],
        columnGap: 20,
      },
    ],
    styles: {
      sectionTitle: { fontSize: 10.5, bold: true, color: '#1a3a6b' },
    },
    defaultStyle: { font: 'Roboto' },
  };
}

/** Generate the payslip PDF, save it outside the web root, return {filePath, fileName}. */
async function generatePayslipPdf(payslipId) {
  const payslip = await loadPayslip(payslipId);
  if (!payslip) return null;

  const school = {
    name: (await getSetting('school.name')) || 'Kay-Billie-Klaer International School',
    address: (await getSetting('school.address')) || '',
  };

  const docDefinition = buildDocDefinition(payslip, school);
  // pdfmake >= 0.3 returns a Promise from getBuffer() (the old
  // callback style never fires and would hang the request).
  const buffer = await pdfMake.createPdf(docDefinition).getBuffer();

  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const fileName = `${payslip.reference}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);
  fs.writeFileSync(filePath, buffer);

  payslip.pdf_generated_at = new Date();
  await payslip.save();

  return { filePath, fileName };
}

module.exports = { generatePayslipPdf, loadPayslip, buildDocDefinition };
