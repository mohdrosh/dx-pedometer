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

import { computeMonth, splitHM, LEAVE } from './kintai.js';
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
 *   rules         the working-hours rules, if not モラブ阪神's own
 * @returns {Promise<Buffer>} the filled workbook
 */
export async function buildTimesheet({ y, m, person, days, holidays = {}, rules }) {
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

    /* A day of 有給休暇 is not a day worked 09:00–17:45, and the form knows
       it — BI throws the times away, so 休憩 and 実働時間 come out blank
       beside them. Printing the hours anyway leaves a row that reads like
       a half-filled one. The one-tap month fill puts standard hours on
       every weekday, so this is the common case, not a rare one. The times
       stay in the record; only the form leaves them off, so unpicking the
       status brings them straight back. */
    const away = LEAVE.includes(d.status1);
    put(COL.inH, away ? null : (d.inH ?? null));
    put(COL.inM, away || d.inH == null ? null : (d.inM ?? 0));
    put(COL.outH, away ? null : (d.outH ?? null));
    put(COL.outM, away || d.outH == null ? null : (d.outM ?? 0));
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

  /* ---- the answers, written in beside the formulas --------------------
     Excel recalculates on open and would fill these itself, but plenty of
     things that open an xlsx do not: a phone's preview, Google Sheets on a
     first load, the Finder's Quick Look. Someone checking the file before
     sending it should see the figures, not a grid of blanks. So each
     formula keeps its formula and is given the result as well, from the
     same engine the screen uses — which is itself a port of these very
     formulas, verified against them.                                     */
  writeCachedResults(ws, days, holidays, rules);

  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
  return wb.xlsx.writeBuffer();
}

/* Excel stores a time as a fraction of a day: 7h45m is 7.75/24. */
const asTime = (hours) => (hours ? hours / 24 : '');

/** Keep a cell's formula, attach what it evaluates to. */
function cache(ws, ref, result) {
  const cell = ws.getCell(ref);
  const f = cell.value && cell.value.formula;
  if (!f) return;                       // a plain cell, or an empty one
  cell.value = { formula: f, result };
}

function writeCachedResults(ws, days, holidays, rules) {
  const month = computeMonth(
    days.map((d) => (d ? { ...d, holiday: !!holidays[d.iso] } : d)).filter(Boolean),
    rules,
  );

  month.rows.forEach((r, i) => {
    const row = FIRST_ROW + i;
    const c = r.calc;
    const on = c.entered;
    cache(ws, `M${row}`, on && c.breakMin ? c.breakMin : '');
    cache(ws, `O${row}`, on ? asTime(c.inside) : '');
    cache(ws, `S${row}`, on ? asTime(c.show.overtime) : '');
    cache(ws, `W${row}`, on ? asTime(c.show.night) : '');
    cache(ws, `AA${row}`, on ? asTime(c.show.holiday) : '');
    cache(ws, `AP${row}`, c.notice || '');
  });

  /* the 就業時間 box: hours on the left, the leftover minutes on the right */
  const hm = [
    ['AQ40', 'AX40', month.inside],
    ['AQ41', 'AX41', month.deduct],
    ['AQ42', 'AX42', month.otWeekday],
    ['AQ43', 'AX43', month.otWeekdayNight],
    ['AQ44', 'AX44', month.otHoliday],
    ['AQ45', 'AX45', month.otHolidayNight],
  ];
  hm.forEach(([hRef, mRef, hours]) => {
    const { h, m: mins } = splitHM(hours);
    cache(ws, hRef, h);
    cache(ws, mRef, mins);
  });

  /* and the day counts down the left */
  const C = month.counts;
  [['W40', C.shotei], ['W41', C.worked], ['W42', C.paidLeave], ['W43', C.absent],
    ['W44', C.special], ['W45', C.holidaySat], ['W46', C.holidaySun], ['W47', C.furikae],
  ].forEach(([ref, v]) => cache(ws, ref, v));
}

/** 業務報告書_2610_2407036.xlsx */
export const timesheetFilename = (y, m, id) =>
  `業務報告書_${String(y % 100).padStart(2, '0')}${String(m).padStart(2, '0')}_${id}.xlsx`;
