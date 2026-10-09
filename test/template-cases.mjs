/* The template itself, checked before anything is written into it.

   佐野 sent back a generated 業務報告書 with 休憩 and 実働時間 blank on ten
   of the days she had worked. The cause was not the generator: the printed
   columns of the company's own master form have holes in them — M, O, S, W
   and AA have no formula at all in thirteen to fifteen of the thirty-one
   rows, which is what a block of cells deleted with the Delete key looks
   like after a few years of hands. The hidden helper columns are intact in
   every row and the month totals are summed from those, so the figures at
   the foot of the page were always right while the rows above them went
   blank — and on paper, filled in by hand, nobody saw it.

   make-template.mjs repairs them. This is the guard that says it worked,
   and that a future rebuild from a fresh copy of the form does not quietly
   bring the holes back.                                                  */

import { createRequire } from 'node:module';
import { TEMPLATE } from '../src/kintai-xlsx.js';
import { TEMPLATE as TODOKE } from '../src/todoke.js';
import { TEMPLATE as KOUTSUUHI } from '../src/koutsuuhi.js';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad += 1; console.log(`  ✗ ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(TEMPLATE);
const ws = wb.getWorksheet('業務報告書・社内用（20日締）');

/* A cell may hold the formula itself or point at a neighbour's; both are a
   formula as far as Excel is concerned. */
const hasFormula = (ref) => {
  const v = ws.getCell(ref).value;
  return !!(v && typeof v === 'object' && (v.formula || v.sharedFormula));
};

console.log('every day row computes');
const FIRST = 9; const LAST = 39;
for (const [col, what] of [
  ['M', '休憩'], ['O', '実働時間'], ['S', '時間外時間'],
  ['W', '深夜時間'], ['AA', '休日勤務時間'], ['AP', '届'],
]) {
  const missing = [];
  for (let r = FIRST; r <= LAST; r++) if (!hasFormula(`${col}${r}`)) missing.push(r);
  is(`${col} (${what}) — all 31 rows`, missing, []);
}

console.log('and so do the hidden columns the totals are summed from');
for (const col of ['BH', 'BI', 'BN', 'BO', 'BU', 'BY']) {
  const missing = [];
  for (let r = FIRST; r <= LAST; r++) if (!hasFormula(`${col}${r}`)) missing.push(r);
  is(`${col} — all 31 rows`, missing, []);
}

console.log('the repair did not disturb the rest of the form');
is('both sheets kept', wb.worksheets.map((w) => w.name),
  ['業務報告書・社内用（20日締）', '祝祭日']);
is('634 merged cells', ws.model.merges.length, 634);
is('the 就業時間 box is still formulas', [
  hasFormula('AQ40'), hasFormula('AX40'), hasFormula('W40'),
], [true, true, true]);
is('A4 portrait at 90%', [ws.pageSetup.paperSize, ws.pageSetup.scale, ws.pageSetup.orientation],
  [9, 90, 'portrait']);
is('nobody is left in the template', [
  ws.getCell('AQ4').value, ws.getCell('A3').value, ws.getCell('E12').value,
], [null, null, null]);

console.log('the other two templates are intact');
for (const [path, sheet, merges] of [[TODOKE, '届（設計開発・請負契約）', null], [KOUTSUUHI, null, 277]]) {
  const w = new ExcelJS.Workbook();
  await w.xlsx.readFile(path);
  const s = sheet ? w.getWorksheet(sheet) : w.worksheets[0];
  is(`${sheet || w.worksheets[0].name} exists`, !!s, true);
  if (merges) is('merged cells kept', s.model.merges.length, merges);
}

console.log(bad ? `\n${bad} failed` : '\nthe templates are whole');
process.exit(bad ? 1 : 0);
