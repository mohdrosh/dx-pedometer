/* ============================================================================
   交通費精算書 — the journeys written back into the form they came from.

   Same approach as the timesheet: open the real sheet, type into the boxes a
   person would type into, leave its formulas alone. The three totals at the
   foot are the form's own SUMIFs and stay that way, with the figures cached
   beside them so the file reads correctly before Excel has recalculated it.

   The ／ between month and day, the ： between hours and minutes and the 円
   after each fare are printed on the form. Only the numbers go in.
   ========================================================================= */

import { MAX_ROWS, filled, totals } from './koutsuuhi-calc.js';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE = path.join(HERE, 'templates', 'koutsuuhi.xlsx');

const FIRST_ROW = 16;
const COL = {
  mon: 'A', day: 'C',
  from: 'D', fromH: 'H', fromM: 'K',
  to: 'M', toH: 'Q', toM: 'T',
  line: 'V', commute: 'AD', fare: 'AF',
};

/**
 * @param {object} o
 *   y, m      the period, as 精算期間 closes it (21st → 20th)
 *   person    { id, name, dept }
 *   rows      journeys, in order; anything past the form's 25 lines is
 *             refused rather than silently dropped
 *   today     the date on the form
 * @returns {Promise<Buffer>}
 */
export async function buildKoutsuuhi({ y, m, person, rows = [], today = new Date() }) {
  const use = rows.filter(filled);
  if (use.length > MAX_ROWS) {
    const err = new Error('too_many_rows');
    err.code = 'too_many_rows';
    throw err;
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.worksheets[0];
  const set = (ref, v) => { ws.getCell(ref).value = v === '' || v == null ? null : v; };

  /* 作成日 */
  set('AD4', today.getFullYear());
  set('AH4', today.getMonth() + 1);
  set('AJ4', today.getDate());

  /* 所属 / 氏名, and the employee number one digit to a box */
  set('F6', person.dept || '');
  set('Z7', person.name || '');
  const digits = String(person.id || '').replace(/\D/g, '').slice(-7).padStart(7, ' ');
  ['AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH'].forEach((c, i) => {
    set(`${c}6`, digits[i] === ' ' ? null : Number(digits[i]));
  });

  /* 精算期間 — the same 21st-to-20th window the timesheet covers */
  const to = new Date(y, m - 1, 20);
  const from = new Date(y, m - 2, 21);
  set('I9', from.getFullYear()); set('M9', from.getMonth() + 1); set('P9', from.getDate());
  set('Z9', to.getFullYear()); set('AD9', to.getMonth() + 1); set('AG9', to.getDate());

  /* ---- the journeys ---------------------------------------------------- */
  for (let i = 0; i < MAX_ROWS; i++) {
    const row = FIRST_ROW + i;
    const r = use[i];
    const put = (col, v) => set(`${col}${row}`, v);
    if (!r) { Object.values(COL).forEach((c) => put(c, null)); continue; }

    const [, mo, dd] = (r.date || '--').split('-');
    put(COL.mon, mo ? Number(mo) : null);
    put(COL.day, dd ? Number(dd) : null);
    put(COL.from, r.from || null);
    put(COL.fromH, r.fromH ?? null);
    put(COL.fromM, r.fromH == null ? null : (r.fromM ?? 0));
    put(COL.to, r.to || null);
    put(COL.toH, r.toH ?? null);
    put(COL.toM, r.toH == null ? null : (r.toM ?? 0));
    put(COL.line, r.line || null);
    /* the one mark the two SUMIFs key off */
    put(COL.commute, r.commute ? '○' : null);
    put(COL.fare, Number(r.fare) > 0 ? Math.round(Number(r.fare)) : null);
  }

  /* ---- the three totals, cached beside their formulas ------------------ */
  const sum = totals(use);
  cache(ws, 'AF41', sum.commute || '');
  cache(ws, 'AF42', sum.advance || '');
  cache(ws, 'AF43', sum.total || '');

  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
  return wb.xlsx.writeBuffer();
}

/** Keep a cell's formula, attach what it evaluates to. */
function cache(ws, ref, result) {
  const cell = ws.getCell(ref);
  const f = cell.value && cell.value.formula;
  if (!f) return;
  cell.value = { formula: f, result };
}

/** 交通費精算書_2610_2407036.xlsx */
export const koutsuuhiFilename = (y, m, id) =>
  `交通費精算書_${String(y % 100).padStart(2, '0')}${String(m).padStart(2, '0')}_${id}.xlsx`;
