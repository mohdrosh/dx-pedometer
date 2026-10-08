/* ============================================================================
   業務報告書 — the month written back into the form it came from.

   Rather than redraw a sheet of 634 merged cells, this opens the real one as
   a template and types into the boxes a person would type into: the header,
   and four numbers plus a note and a status per day. Every formula in the
   file is left exactly as it was, so the totals are still Excel's own
   arithmetic rather than a second implementation of it that could drift.
   fullCalcOnLoad is set, so Excel works them out the moment the file opens.

   The one thing written that nobody types is the 祝祭日 list. The form
   decides what is a working day by looking a date up in that sheet, and the
   app decides the same thing from its own holiday list. Writing ours in keeps
   the two from ever disagreeing.
   ========================================================================= */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE = path.join(HERE, 'templates', 'gyomu-hokokusho.xlsx');
const SHEET = '業務報告書・社内用（20日締）';
const HOLIDAY_SHEET = '祝祭日';

/* The grid: 31 day rows, and the columns a person fills in. */
const FIRST_ROW = 9;
const LAST_ROW = 39;
const COL = {
  dom: 'A', dow: 'C', inH: 'E', inM: 'G', outH: 'I', outM: 'K',
  note: 'AE', status1: 'AJ', status2: 'AN',
};
const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * @param {object} o
 *   y, m          the period, as the form's 年 / 月分
 *   person        { id, name, dept, section }
 *   days          one per day of the period: { iso, dom, dow, inH, inM,
 *                 outH, outM, note, status1, status2 }
 *   holidays      { 'YYYY-MM-DD': '名称' } — written into the 祝祭日 sheet
 * @returns {Promise<Buffer>} the filled workbook
 */
export async function buildTimesheet({ y, m, person, days, holidays = {} }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`template is missing ${SHEET}`);

  /* ---- header ---------------------------------------------------------- */
  ws.getCell('A3').value = y;
  ws.getCell('I3').value = m;
  ws.getCell('AQ2').value = person.dept || '';
  ws.getCell('AQ3').value = person.section || '';
  ws.getCell('AQ4').value = person.name || '';

  /* The employee number is seven separate boxes, one digit each, so that the
     printed form has a grid to write into. Right-aligned, like the paper. */
  const digits = String(person.id || '').replace(/\D/g, '').slice(-7).padStart(7, ' ');
  ['AS', 'AT', 'AU', 'AV', 'AW', 'AX', 'AY'].forEach((c, i) => {
    const d = digits[i];
    ws.getCell(`${c}5`).value = d === ' ' ? null : Number(d);
  });

  /* ---- the 31 rows ----------------------------------------------------- */
  for (let i = 0; i < LAST_ROW - FIRST_ROW + 1; i++) {
    const row = FIRST_ROW + i;
    const d = days[i];
    const put = (col, v) => { ws.getCell(`${col}${row}`).value = v === '' ? null : v; };

    if (!d) {
      /* A short period — February through a 20th close is 28 rows — leaves
         the tail blank. The form reads a blank 曜 as a day off the end. */
      Object.values(COL).forEach((c) => put(c, null));
      continue;
    }
    put(COL.dom, d.dom);
    put(COL.dow, DOW_JA[d.dow]);
    put(COL.inH, d.inH ?? null);
    put(COL.inM, d.inH == null ? null : (d.inM ?? 0));
    put(COL.outH, d.outH ?? null);
    put(COL.outM, d.outH == null ? null : (d.outM ?? 0));
    put(COL.note, d.note || null);
    put(COL.status1, d.status1 || null);
    put(COL.status2, d.status2 || null);
  }

  /* ---- 祝祭日, so the form and the app agree on what a working day is --- */
  const hs = wb.getWorksheet(HOLIDAY_SHEET);
  if (hs) {
    const last = Math.max(hs.rowCount, 120);
    for (let r = 1; r <= last; r++) {
      hs.getCell(`A${r}`).value = null;
      hs.getCell(`B${r}`).value = null;
    }
    /* Real dates, as the original list holds them. The form's COUNTIF is
       given BG — CONCATENATE(year,"/",month,"/",day), a string — and Excel
       coerces that text to a date to compare. Writing text here instead
       would work until a locale read "2026/9/21" differently, so the list
       stays the type it has always been. */
    Object.entries(holidays).sort().forEach(([iso, name], i) => {
      const [yy, mm, dd] = iso.split('-').map(Number);
      hs.getCell(`A${i + 1}`).value = new Date(Date.UTC(yy, mm - 1, dd));
      hs.getCell(`B${i + 1}`).value = name;
    });
  }

  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
  return wb.xlsx.writeBuffer();
}

/** 業務報告書_2610_2407036.xlsx */
export const timesheetFilename = (y, m, id) =>
  `業務報告書_${String(y % 100).padStart(2, '0')}${String(m).padStart(2, '0')}_${id}.xlsx`;
