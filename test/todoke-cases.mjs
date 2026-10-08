/* Grouping is the whole trick: a week of 有給休暇 is one 届, not five. */
import { noticesFor } from '../src/todoke.js';

const day = (iso, dow, o = {}) => ({ iso, dom: Number(iso.slice(-2)), dow, status1: '', status2: '', ...o });
const show = (ns) => ns.map((n) => `${n.kind} ${n.from.iso}→${n.to.iso} (${n.days}d${n.partial ? ', partial' : ''})`);

const cases = [
  ['a week of 有給休暇 is one notice', [
    day('2026-09-14', 1, { status1: '有給休暇' }), day('2026-09-15', 2, { status1: '有給休暇' }),
    day('2026-09-16', 3, { status1: '有給休暇' }), day('2026-09-17', 4, { status1: '有給休暇' }),
    day('2026-09-18', 5, { status1: '有給休暇' }),
  ]],
  ['a gap splits the run', [
    day('2026-09-14', 1, { status1: '欠勤' }), day('2026-09-15', 2),
    day('2026-09-16', 3, { status1: '欠勤' }),
  ]],
  ['different kinds do not merge', [
    day('2026-09-14', 1, { status1: '有給休暇' }), day('2026-09-15', 2, { status1: '欠勤' }),
  ]],
  ['遅刻 and 早退 on one day are two notices', [
    day('2026-09-14', 1, { status1: '遅刻', status2: '早退', inH: 10, inM: 30, outH: 16, outM: 0 }),
  ]],
  ['遅刻（電車遅延） ticks the same box', [
    day('2026-09-14', 1, { status1: '遅刻（電車遅延）', inH: 10, inM: 0 }),
  ]],
  ['直行・直帰 needs no notice', [
    day('2026-09-14', 1, { status1: '直行', status2: '直帰' }),
  ]],
  ['振替予定休日出勤 goes under その他', [
    day('2026-09-13', 0, { status1: '振替予定休日出勤' }),
  ]],
  ['an ordinary month needs none', [
    day('2026-09-14', 1, { inH: 9, outH: 17, outM: 45 }),
  ]],
];

let bad = 0;
for (const [name, rows] of cases) {
  const got = show(noticesFor(rows));
  console.log(`${name}\n   ${got.length ? got.join('\n   ') : '(none)'}`);
}
console.log(bad ? `${bad} failures` : '\nall grouped as expected');
