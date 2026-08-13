// Excel (.xlsx) helpers — read uploads, generate clean templates with dropdowns,
// and export styled sheets. ExcelJS is loaded lazily (dynamic import) so it never
// weighs on the initial page load; only screens that import/export pull it in.

let _ExcelJS = null;
async function excel() {
  if (!_ExcelJS) _ExcelJS = (await import('exceljs')).default;
  return _ExcelJS;
}

const BRAND = 'FF0B6FB8'; // header fill (ARGB) — GestiEcole blue
const WHITE = 'FFFFFFFF';

// Coerce an ExcelJS cell value (which can be a Date, formula object, rich text,
// or hyperlink) into a clean trimmed string.
function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10); // YYYY-MM-DD
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text); // rich text / hyperlink
    if (v.result != null) return String(v.result); // formula result
    if (v.richText) return v.richText.map((t) => t.text).join('');
    return '';
  }
  return String(v);
}

// Read the FIRST worksheet of an .xlsx file into an array of objects keyed by the
// (lowercased, trimmed) header row — same shape the old CSV parser produced, so
// downstream import logic is unchanged. Fully-empty rows are skipped.
export async function readRows(file) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];

  let headers = [];
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    const vals = row.values; // 1-indexed: [ <empty>, col1, col2, ... ]
    if (rowNumber === 1) {
      headers = vals.slice(1).map((h) => cellText(h).trim().toLowerCase());
      return;
    }
    const obj = {};
    headers.forEach((h, i) => {
      if (!h) return;
      obj[h] = cellText(vals[i + 1]).trim();
    });
    if (Object.values(obj).some((x) => x !== '')) rows.push(obj);
  });
  return rows;
}

function styleHeader(ws) {
  const hr = ws.getRow(1);
  hr.font = { bold: true, color: { argb: WHITE } };
  hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  hr.alignment = { vertical: 'middle', horizontal: 'left' };
  hr.height = 20;
}

function triggerDownload(filename, buffer) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Download a clean IMPORT TEMPLATE.
//   columns:      [{ header, key, width? }]
//   example:      optional object keyed by column key (one sample row)
//   dropdowns:    optional [{ key, values: [] }] — in-cell list validation
//   instructions: optional string[] (first line rendered as a title) → 2nd sheet
export async function downloadTemplate(filename, { sheetName = 'Données', columns, example, dropdowns, instructions }) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GestiPrint';

  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 18 }));
  styleHeader(ws);
  if (example) ws.addRow(example);

  // Dropdown source values live on a hidden "Listes" sheet so long lists (whole
  // class list, all subjects) aren't capped by Excel's 255-char inline limit.
  if (dropdowns && dropdowns.length) {
    const src = wb.addWorksheet('Listes');
    src.state = 'veryHidden';
    dropdowns.forEach((d, colI) => {
      const letter = src.getColumn(colI + 1).letter;
      (d.values || []).forEach((v, rowI) => (src.getCell(`${letter}${rowI + 1}`).value = v));
      const n = (d.values || []).length || 1;
      const ref = `Listes!$${letter}$1:$${letter}$${n}`;
      const targetIdx = columns.findIndex((c) => c.key === d.key) + 1;
      if (targetIdx < 1) return;
      const targetLetter = ws.getColumn(targetIdx).letter;
      for (let r = 2; r <= 1000; r++) {
        ws.getCell(`${targetLetter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [ref],
          showErrorMessage: true,
          errorStyle: 'warning',
          error: 'Choisissez une valeur dans la liste.',
        };
      }
    });
  }

  if (instructions && instructions.length) {
    const is = wb.addWorksheet('Instructions');
    is.getColumn(1).width = 100;
    instructions.forEach((line, i) => {
      const cell = is.getCell(`A${i + 1}`);
      cell.value = line;
      cell.alignment = { wrapText: true, vertical: 'top' };
      if (i === 0) cell.font = { bold: true, size: 14 };
    });
  }

  triggerDownload(filename, await wb.xlsx.writeBuffer());
}

// Export a styled data sheet (or several).
//   sheets: [{ name, columns:[{header,key,width?}], rows:[obj] }]  OR a single
//   {columns, rows} object with an optional top-level sheetName.
export async function downloadXlsx(filename, spec) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GestiPrint';

  const sheets = Array.isArray(spec.sheets) ? spec.sheets : [{ name: spec.sheetName || 'Feuille1', ...spec }];
  sheets.forEach((s) => {
    const ws = wb.addWorksheet(s.name || 'Feuille1', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 18 }));
    styleHeader(ws);
    (s.rows || []).forEach((r) => ws.addRow(r));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  });

  triggerDownload(filename, await wb.xlsx.writeBuffer());
}
