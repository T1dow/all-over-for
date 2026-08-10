/**
 * src/utils/exporters.js
 * Shared CSV / Excel (xlsx) / PDF export helpers for reports.
 */
const ExcelJS = require('exceljs');
const pdfMake = require('pdfmake/build/pdfmake');
const vfsFonts = require('pdfmake/build/vfs_fonts');
pdfMake.vfs = vfsFonts.vfs || (vfsFonts.pdfMake && vfsFonts.pdfMake.vfs) || vfsFonts;

/** CSV export. */
function exportCsv(res, filename, headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send('\uFEFF' + csv); // BOM for Excel compatibility
}

/** Excel (.xlsx) export via exceljs. */
async function exportXlsx(res, filename, sheetName, headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((col, i) => { col.width = Math.max(10, ...rows.map((r) => String(r[i] ?? '').length + 2)); });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  return res.end();
}

/** PDF export via pdfmake (same engine as payslips). */
async function exportPdf(res, filename, title, subtitle, headers, rows, formatter = (v) => v) {
  const doc = {
    pageSize: 'A4',
    pageMargins: [30, 30, 30, 30],
    info: { title, author: 'KBK Payroll System' },
    content: [
      { text: title, fontSize: 15, bold: true, color: '#1a3a6b', margin: [0, 0, 0, 2] },
      { text: subtitle, fontSize: 10, color: '#666', margin: [0, 0, 0, 12] },
      {
        table: {
          headerRows: 1,
          widths: Array(headers.length).fill('*'),
          body: [
            headers.map((h) => ({ text: h, bold: true, fontSize: 8, fillColor: '#1a3a6b', color: '#fff' })),
            ...rows.map((r) => r.map((c) => ({ text: formatter(c), fontSize: 8 }))),
          ],
        },
      },
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
  };
  const raw = await pdfMake.createPdf(doc).getBuffer();
  // pdfmake 0.3 resolves with the `buffer` npm package's Buffer class
  // (a foreign-realm Uint8Array). Express' Buffer.isBuffer() rejects it
  // and would JSON-serialize it, so normalize to a Node Buffer first.
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.data || raw);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
}

module.exports = { exportCsv, exportXlsx, exportPdf };
