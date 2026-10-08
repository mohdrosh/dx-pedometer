/* His own 8/21–9/20 交通費精算書, rebuilt from the journeys on it and
   compared cell by cell with the sheet he actually submitted. If the two
   agree, the generator is writing the form the way a person writes it. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildKoutsuuhi } from '../src/koutsuuhi.js';
import {
  totals, filled, ROWS_PER_SHEET, sheetCount, sheetRows,
  roundTrip, workedDays, hasRoute, frequentRoutes, routeReady,
} from '../src/koutsuuhi-calc.js';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad += 1; console.log(`  ✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  return ok;
};

/* ---- the journeys, as the submitted sheet has them -------------------- */
const rows = [
  { date: '2026-08-26', from: '姫路', fromH: 20, fromM: 41, to: '三ノ宮', toH: 21, toM: 21, line: 'JR', commute: false, fare: 960 },
  { date: '2026-08-28', from: '三ノ宮', fromH: 11, fromM: 15, to: '京都', toH: 13, toM: 50, line: '阪急', commute: true, fare: 640 },
  { date: '2026-08-28', from: '京都', fromH: 15, fromM: 40, to: '三ノ宮', toH: 17, toM: 30, line: '阪急', commute: true, fare: 640 },
];

console.log('totals');
is('通勤交通費', totals(rows).commute, 1280);
is('立替交通費', totals(rows).advance, 960);
is('合計', totals(rows).total, 2240);
is('a row with only a time is not a journey', filled({ fromH: 9 }), false);
is('a row with a fare is', filled({ fare: 220 }), true);

/* ---- the form ---------------------------------------------------------- */
const buf = await buildKoutsuuhi({
  y: 2026, m: 9,
  person: { id: '2407036', name: 'モハメド ロシャン', dept: '開発部', section: 'システム開発1課' },
  rows,
  today: new Date(2026, 8, 11),
});
const out = path.join(os.tmpdir(), 'koutsuuhi-test.xlsx');
fs.writeFileSync(out, Buffer.from(buf));

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(out);
const ws = wb.worksheets[0];
const v = (ref) => {
  const c = ws.getCell(ref).value;
  return c && typeof c === 'object' && 'result' in c ? c.result : c;
};

console.log('header');
is('作成日', [v('AD4'), v('AH4'), v('AJ4')], [2026, 9, 11]);
is('所属 is the 課, as the submitted sheet has it', v('F6'), 'システム開発1課');
is('氏名', v('Z7'), 'モハメド ロシャン');
is('社員№', ['AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH'].map((c) => v(`${c}6`)), [2, 4, 0, 7, 0, 3, 6]);
is('精算期間 from', [v('I9'), v('M9'), v('P9')], [2026, 8, 21]);
is('精算期間 to', [v('Z9'), v('AD9'), v('AG9')], [2026, 9, 20]);

console.log('journeys');
const got = [];
for (let r = 16; r <= 40; r += 1) {
  if (v(`D${r}`) == null && v(`AF${r}`) == null) continue;
  got.push([v(`A${r}`), v(`C${r}`), v(`D${r}`), v(`H${r}`), v(`K${r}`),
    v(`M${r}`), v(`Q${r}`), v(`T${r}`), v(`V${r}`), v(`AD${r}`), v(`AF${r}`)]);
}
is('three lines used', got.length, 3);
is('8/26 姫路→三ノ宮', got[0], [8, 26, '姫路', 20, 41, '三ノ宮', 21, 21, 'JR', null, 960]);
is('8/28 三ノ宮→京都 ○', got[1], [8, 28, '三ノ宮', 11, 15, '京都', 13, 50, '阪急', '○', 640]);
is('8/28 京都→三ノ宮 ○', got[2], [8, 28, '京都', 15, 40, '三ノ宮', 17, 30, '阪急', '○', 640]);

console.log('the form adds up');
is('通勤交通費 AF41', v('AF41'), 1280);
is('立替交通費 AF42', v('AF42'), 960);
is('合計 AF43', v('AF43'), 2240);
is('the SUMIFs are still formulas', [
  ws.getCell('AF41').value.formula.startsWith('IF(SUMIF'),
  ws.getCell('AF43').value.formula.startsWith('IF(SUM('),
], [true, true]);

console.log('the form is still the form');
is('ruled lines kept', [ws.getCell('B30').value, ws.getCell('J30').value, ws.getCell('AK30').value], ['/', '：', '円']);
is('the 通勤経路 note survived', !!ws.getCell('AD14').note, true);
is('merges kept', ws.model.merges.length, 277);

console.log('a month that needs two copies of the form');
/* 20 working days of round trips is 40 journeys — the sheet holds 25. */
const many = Array.from({ length: 40 }, (_, i) => ({
  date: '2026-09-01', from: `A${i}`, to: `B${i}`, fare: 100 + i, commute: true,
}));
is('two sheets', sheetCount(many), 2);
is('first sheet is full', sheetRows(many, 0).length, ROWS_PER_SHEET);
is('second holds the rest', sheetRows(many, 1).length, 15);
is('and the two together are the month', sheetRows(many, 0).length + sheetRows(many, 1).length, 40);

const p2 = await buildKoutsuuhi({ y: 2026, m: 9, person: { id: '1', name: 'x' }, rows: many, page: 1 });
const wb2 = new ExcelJS.Workbook();
await wb2.xlsx.load(p2);
const s2 = wb2.worksheets[0];
const cell = (ref) => {
  const c = s2.getCell(ref).value;
  return c && typeof c === 'object' && 'result' in c ? c.result : c;
};
is('sheet 2 starts at the 26th journey', cell('D16'), 'A25');
is('sheet 2 totals its own lines only', cell('AF41'),
  many.slice(25).reduce((a, r) => a + r.fare, 0));

let threw = '';
await buildKoutsuuhi({ y: 2026, m: 9, person: { id: '1', name: 'x' }, rows: many, page: 2 })
  .catch((e) => { threw = e.code; });
is('a page the month does not have is refused', threw, 'no_such_page');

console.log('the commute, entered once');
const route = { from: '姫路', to: '三ノ宮', line: 'JR', fare: 960 };
is('a route needs both stations', [routeReady({ from: '姫路' }), routeReady(route)], [false, true]);
const rt = roundTrip(route, '2026-09-28');
is('out and back', rt.map((r) => `${r.from}→${r.to}`), ['姫路→三ノ宮', '三ノ宮→姫路']);
is('both marked 通勤', rt.every((r) => r.commute), true);
is('both carry the one-way fare', rt.map((r) => r.fare), [960, 960]);
is('a day already covered is recognised, either way round',
  hasRoute(rt, route, '2026-09-28'), true);
is('another day is not', hasRoute(rt, route, '2026-09-29'), false);

console.log('which days the timesheet says were worked');
const kt = {
  days: {
    '2026-09-21': { inH: 9, inM: 0, outH: 17, outM: 45 },
    '2026-09-22': { status1: '有給休暇' },
    '2026-09-23': { status1: '欠勤' },
    '2026-09-24': { status1: '振替休日' },
    '2026-09-25': { status1: '直行', inH: 10, inM: 0, outH: 18, outM: 0 },
    '2026-09-26': { status1: '休日出勤' },
    '2026-09-28': { inH: 9, inM: 0, outH: 17, outM: 45 },
  },
};
const period = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24',
  '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'];
is('leave and absence are skipped, 直行 and 休日出勤 are not',
  workedDays(kt, period), ['2026-09-21', '2026-09-25', '2026-09-26', '2026-09-28']);
is('a day with nothing entered is not a day travelled',
  workedDays({ days: {} }, period), []);

console.log('routes offered back');
const freq = frequentRoutes(rows, [{ from: '姫路', to: '三ノ宮', line: 'JR', fare: 960 }]);
is('the duplicate 姫路→三ノ宮 is one entry', freq.filter((r) => r.from === '姫路').length, 1);
is('each direction is its own', freq.length, 3);

fs.unlinkSync(out);
console.log(bad ? `\n${bad} mismatch(es)` : '\nthe form matches the one he submitted');
process.exit(bad ? 1 : 0);
