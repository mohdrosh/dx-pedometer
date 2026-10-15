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

import { computeMonth, splitHM, LEAVE, hhmm, DEFAULT_RULES } from './kintai.js';
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
  /* 年 is 18pt MS UI Gothic in their template, and that font is not on a
     Linux server. Converting to PDF substitutes something wider, 2026 stops
     fitting the merged cell, and the form prints ### where the year should
     be — which is not a thing to send to 総務.

     shrinkToFit rather than a smaller font, because the right size depends
     on which font the converting machine happens to substitute, and that is
     not knowable from here. This asks the renderer to make it fit whatever
     it has, and Excel honours it too, so the file still looks as it did. */
  ws.getCell('A3').value = y;
  ws.getCell('A3').alignment = { ...(ws.getCell('A3').alignment || {}), shrinkToFit: true };
  ws.getCell('I3').value = m;
  /* This form has a cell for the 部署 and another for the 課. Where only the
     single 所属 string is on record — which is every one of the thirteen —
     it goes in the first rather than leaving both blank. */
  ws.getCell('AQ2').value = person.dept || person.affiliation || '';
  ws.getCell('AQ3').value = person.dept ? (person.section || '') : '';
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
  writeRuleBox(ws, rules || DEFAULT_RULES);
  writeHeaderResults(ws, y, m);
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

/* The period across the top of the form is four formulas off the 年 and 月
   cells, and the cached results saved in the template belong to the month it
   was built for. Excel recalculates the moment it opens the file, so nobody
   reading it in Excel ever saw this. Anything that does not — LibreOffice,
   a PDF made from it, a preview pane — prints the template's month instead
   of the one on the sheet, and a 業務報告書 for 10月分 goes to payroll saying
   8月21日〜9月20日.

   The formulas are left where they are; only the answers beside them are
   brought up to date. */
/* The 就業時間 reference box — the panel that states what a standard day is
   for the person whose form this is. Its cells hold the template's own
   9:00–17:45 and nothing has ever written anything else into them, so the
   four 新長田 members' forms say their day runs 9:00 to 17:45 when it runs
   8:45 to 17:15. The figures beside it are right; they are computed from the
   real rules. The box describing them is not, which on a form 総務 reads is
   its own kind of wrong.

   The same cached-result problem as the header, one layer deeper: the panel
   is a dozen formulas pointing at a handful of value cells, so the values go
   in and every answer that hangs off them is refreshed. Excel would do it on
   open; a PDF never opens. */
function writeRuleBox(ws, rules) {
  const day = (hhmmStr) => hhmm(hhmmStr) / 24;          // Excel keeps a time as a fraction
  const mins = (pair) => Math.round((hhmm(pair[1]) - hhmm(pair[0])) * 60);

  /* the values the panel reads */
  ws.getCell('AS9').value = day(rules.workStart);
  ws.getCell('AW9').value = day(rules.workEnd);
  ws.getCell('AS10').value = day(rules.break1[0]);
  ws.getCell('AW10').value = day(rules.break1[1]);
  ws.getCell('BA10').value = mins(rules.break1);
  ws.getCell('AS11').value = day(rules.break2[0]);
  ws.getCell('AW11').value = day(rules.break2[1]);
  ws.getCell('BA11').value = mins(rules.break2);
  ws.getCell('BF6').value = day(rules.nightStart);
  ws.getCell('BG6').value = day(rules.nightEnd);
  ws.getCell('BF7').value = day(rules.earlyStart);

  /* and every answer that hangs off them */
  const b1 = mins(rules.break1) / 60;
  const b2 = mins(rules.break2) / 60;
  const start = day(rules.workStart);
  const end = day(rules.workEnd);
  const r = {
    BF3: start, BG3: end, BG7: start,
    BH4: b1, BH5: b2,
    BH3: hhmm(rules.workEnd) - hhmm(rules.workStart) - b1,
    BF4: day(rules.break1[0]), BG4: day(rules.break1[1]),
    BF5: day(rules.break2[0]), BG5: day(rules.break2[1]),
    BN6: start, BO6: day(rules.break1[0]), BP6: day(rules.break1[1]),
    BQ6: day(rules.break2[0]), BR6: end,
    BS6: day(rules.nightStart), BT6: day(rules.earlyStart),
    BN7: day(rules.break1[0]), BO7: day(rules.break1[1]), BP7: end,
    BQ7: day(rules.break2[1]), BR7: day(rules.nightStart),
    BS7: day(rules.nightEnd), BT7: start,
  };
  for (const [ref, v] of Object.entries(r)) cache(ws, ref, v);
}

function writeHeaderResults(ws, y, m) {
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const from = Number(ws.getCell('G5').value) || 21;
  const to = Number(ws.getCell('T5').value) || 20;
  cache(ws, 'B5', prevM);                              // 締め開始の月
  cache(ws, 'O5', m);                                  // 締め終了の月
  cache(ws, 'BJ5', `${prevY}/${prevM}/${from}`);       // 期間 開始
  cache(ws, 'BK5', `${y}/${m}/${to}`);                 // 期間 終了
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
