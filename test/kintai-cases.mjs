import { computeDay, splitHM } from '../src/kintai.js';
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
