/* The September sheet is the test: if this port disagrees with Excel on any
   day or any total, the port is wrong. */
import fs from 'node:fs';
import { computeDay, computeMonth, splitHM, DEFAULT_RULES } from '../src/kintai.js';

const fx = JSON.parse(fs.readFileSync(
  new URL('./kintai-september.json', import.meta.url), 'utf8'));
const DOW = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
const HOL = new Set(['2026-09-21', '2026-09-22']); // 敬老の日・秋分の日 fall outside this period

const days = fx.days.map((d) => ({
  dom: d.dom, dow: DOW[d.dow], holiday: false,
  inH: d.in_h, inM: d.in_m, outH: d.out_h, outM: d.out_m,
  status1: d.status1 || '', status2: d.status2 || '',
}));

let bad = 0;
const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 1e-6;

fx.days.forEach((d, i) => {
  const c = computeDay(days[i], DEFAULT_RULES);
  const e = d.exp;
  const checks = [
    ['BU inside', c.inside, e.BU],
    ['BV deduct', c.deduct, (e.BV || 0) + (e.BW || 0)],
    ['BY ot', c.otWeekday, e.BY],
    ['BZ otNight', c.otWeekdayNight, e.BZ],
    ['CA otHol', c.otHoliday, e.CA],
    ['CB otHolNight', c.otHolidayNight, e.CB],
    ['BH weekday', c.isWeekday ? 1 : 0, e.BH],
  ];
  for (const [name, got, want] of checks) {
    if (!near(got, want)) { bad++; console.log(`  MISMATCH ${d.dom}日 ${d.dow} ${name}: got ${got}, Excel ${want}`); }
  }
});

const m = computeMonth(days, DEFAULT_RULES);
const T = fx.totals, C = fx.head.counts;
const tot = [
  ['所定時間内時間合計', m.inside, T.BU],
  ['遅刻・早退', m.deduct, (T.BV || 0) + (T.BW || 0)],
  ['時間外（平日普通）', m.otWeekday, T.BY],
  ['時間外（平日深夜）', m.otWeekdayNight, T.BZ],
  ['時間外（休日普通）', m.otHoliday, T.CA],
  ['時間外（休日深夜）', m.otHolidayNight, T.CB],
  ['所定労働日数', m.counts.shotei, C.shotei_nissu],
  ['出勤日数', m.counts.worked, C.shukkin],
  ['有給休暇日数', m.counts.paidLeave, C.yukyu],
  ['欠勤日数', m.counts.absent, C.kekkin],
  ['特別休暇日数', m.counts.special, C.tokubetsu],
  ['休日出勤（土・祝）', m.counts.holidaySat, C.kyujitsu_dosyuku],
  ['法定休日出勤', m.counts.holidaySun, C.hotei_kyujitsu],
  ['振替休暇日数', m.counts.furikae, C.furikae],
];
console.log('\n  totals                 ours        Excel');
for (const [name, got, want] of tot) {
  const ok = near(got, want);
  if (!ok) bad++;
  const hm = typeof got === 'number' && !Number.isInteger(got * 1) ? '' : '';
  console.log(`  ${ok ? 'ok  ' : 'BAD '} ${name.padEnd(20)} ${String(got).padStart(7)} ${String(want).padStart(10)}${hm}`);
}
const s = splitHM(m.otWeekday);
console.log(`\n  時間外（平日普通） printed as: ${s.h}時間${s.m}分`);
console.log(bad ? `\n  ${bad} MISMATCHES` : '\n  every day and every total matches Excel');
