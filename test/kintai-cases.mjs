import { computeDay, splitHM, rulesFor, DEFAULT_RULES } from '../src/kintai.js';
const D = (o) => computeDay({ holiday: false, inM: 0, outM: 0, status1: '', status2: '', ...o });
const show = (c) => `内${c.inside} 控${c.deduct} 外${c.otWeekday} 夜${c.otWeekdayNight} 休${c.otHoliday} 休夜${c.otHolidayNight}`;
const cases = [
  ['weekday 9:00-17:45 (standard)',      D({ dow: 1, inH: 9, outH: 17, outM: 45 }), '内7.75'],
  ['weekday 9:00-22:00 (4h overtime)',   D({ dow: 1, inH: 9, outH: 22 }),           '内7.75 外4'],
  ['weekday 9:00-23:30 (+1.5h night)',   D({ dow: 1, inH: 9, outH: 23, outM: 30 }), '内7.75 外4 夜1.5'],
  ['weekday 9:00-16:00 (early leave)',   D({ dow: 1, inH: 9, outH: 16 }),           '内6 控1.75'],
  ['weekday 10:00 train delay (excused)', D({ dow: 1, inH: 10, outH: 17, outM: 45, status1: '遅刻（電車遅延）' }), '内6.75 控0'],
  ['weekday 10:00 plain late',           D({ dow: 1, inH: 10, outH: 17, outM: 45, status1: '遅刻' }), '内6.75 控1'],
  ['Saturday 9:00-17:45',                D({ dow: 6, inH: 9, outH: 17, outM: 45 }), '外7.75 (weekday rate)'],
  ['Sunday 9:00-17:45',                  D({ dow: 0, inH: 9, outH: 17, outM: 45 }), '休7.75 (holiday rate)'],
  ['public holiday Mon 9:00-17:45',      D({ dow: 1, holiday: true, inH: 9, outH: 17, outM: 45 }), '外7.75'],
  ['overnight 22:00-05:00',              D({ dow: 1, inH: 22, outH: 5 }),           '夜7'],
  ['早朝 6:00-17:45',                     D({ dow: 1, inH: 6, outH: 17, outM: 45 }), '内7.75 外3 (早朝)'],
  ['有給休暇',                             D({ dow: 1, status1: '有給休暇' }),          'all zero'],
  ['振替予定休日出勤 on Sunday',             D({ dow: 0, inH: 9, outH: 17, outM: 45, status1: '振替予定休日出勤' }), '内7.75 (treated as normal)'],
];
for (const [name, c, expect] of cases) {
  console.log(`${name.padEnd(38)} ${show(c).padEnd(44)} 届:${c.notice || '-'}   want ${expect}`);
}
console.log('\nprinted form:', (() => { const s = splitHM(10 + 59 / 60); return `${s.h}時間${s.m}分`; })());

/* 働き方 is per person, and the thirteen already have two of them. The same
   clock-in has to come out differently for a 新長田 start of 8:45 than for a
   明海 start of 9:00 — otherwise somebody's 遅刻 and their 時間外 are quietly
   taken from a day they were never asked to work. */
{
  const day = { dow: 4, inH: 9, inM: 0, outH: 17, outM: 45 };
  const meikai = computeDay(day, rulesFor({ workStart: '09:00', workEnd: '17:45' }));
  const nagata = computeDay(day, rulesFor({ workStart: '08:45', workEnd: '17:15' }));
  const eq = (what, got, want) => {
    if (got !== want) { console.error(`FAIL ${what}: got ${got}, wanted ${want}`); process.exitCode = 1; }
  };
  console.log('\n働き方 per person — clocking 9:00–17:45');
  console.log(`  明海  9:00–17:45   内${meikai.inside} 控${meikai.deduct} 外${meikai.otWeekday}`);
  console.log(`  新長田 8:45–17:15   内${nagata.inside} 控${nagata.deduct} 外${nagata.otWeekday}`);
  eq('明海 on time', meikai.deduct, 0);
  eq('明海 no overtime', meikai.otWeekday, 0);
  eq('新長田 is a quarter hour late', nagata.deduct, 0.25);
  eq('新長田 stays half an hour over', nagata.otWeekday, 0.5);
  eq('and so works less of its own day', nagata.inside, 7.25);
  eq('an unset 働き方 falls back to the house rules', rulesFor({}), DEFAULT_RULES);
  if (!process.exitCode) console.log('  both come out as their own day says');
}
