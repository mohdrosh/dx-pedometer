/* 会社情報と就業条件 — what a settings form may change about a working day,
   and what it may not. These numbers decide every 時間外 figure in the
   company, so an unreadable one must fall back rather than be stored.
   Run: node test/company-cases.mjs                                        */
import assert from 'node:assert/strict';
import { DEFAULT_RULES } from '../src/kintai.js';
import {
  DEFAULT_COMPANY, cleanCompany, companiesOf, rulesForPerson, closureMap,
} from '../src/company.js';

let n = 0;
const ok = (what, got, want) => {
  n += 1;
  assert.deepEqual(got, want, `${what}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
};
const rules = (r) => cleanCompany({ rules: r }).rules;

/* ---- the three layers ---------------------------------------------------- */
ok('no company, no person: the house rules',
  rulesForPerson({}, {}), DEFAULT_RULES);

ok('a company changing the unit leaves the rest alone',
  rulesForPerson({ companies: [{ ...DEFAULT_COMPANY, rules: { unitMin: 1 } }] }, {}),
  { ...DEFAULT_RULES, unitMin: 1 });

ok('a person overrides their company',
  rulesForPerson(
    { companies: [{ ...DEFAULT_COMPANY, rules: { workStart: '08:00', workEnd: '16:00', unitMin: 5 } }] },
    { workStart: '08:45', workEnd: '17:15' },
  ).workStart, '08:45');

ok('but only the hours — the unit stays the company\'s',
  rulesForPerson(
    { companies: [{ ...DEFAULT_COMPANY, rules: { unitMin: 5 } }] },
    { workStart: '08:45', workEnd: '17:15' },
  ).unitMin, 5);

ok('half a pair of hours is not enough to override',
  rulesForPerson({}, { workStart: '08:45' }).workStart, '09:00');

/* ---- what a form may set ------------------------------------------------- */
ok('a time', rules({ workStart: '08:45' }).workStart, '08:45');
ok('past midnight, because 深夜まで is 29:00', rules({ nightEnd: '29:00' }).nightEnd, '29:00');
ok('a break is a pair', rules({ break1: ['12:00', '12:45'] }).break1, ['12:00', '12:45']);
ok('an overtime unit', rules({ unitMin: 1 }).unitMin, 1);
/* 控除単位 is still accepted and stored — the engine will want it — but no
   settings control offers it while nothing reads it. */
ok('a deduction unit is stored even though nothing reads it yet', rules({ deductUnitMin: 5 }).deductUnitMin, 5);
ok('the days that get the holiday rate', rules({ premiumDow: [0, 6] }).premiumDow, [0, 6]);

/* ---- and what it may not ------------------------------------------------- */
ok('not a time at all', rules({ workStart: '9am' }).workStart, undefined);
ok('an hour that cannot exist', rules({ workStart: '31:00' }).workStart, undefined);
ok('an empty time', rules({ workStart: '' }).workStart, undefined);
ok('half a break', rules({ break1: ['12:00'] }).break1, undefined);
ok('a break that is not a pair', rules({ break1: '12:00-13:00' }).break1, undefined);
ok('a unit of zero minutes', rules({ unitMin: 0 }).unitMin, undefined);
ok('a unit of an hour and a half', rules({ unitMin: 90 }).unitMin, undefined);
ok('a unit that is not a number', rules({ unitMin: 'fifteen' }).unitMin, undefined);
ok('a weekday that is not one', rules({ premiumDow: [0, 9, -1] }).premiumDow, [0]);

/* A rejected value leaves the house rule standing rather than a gap. */
ok('a refused 始業 still computes', rulesForPerson({ companies: [{ rules: { workStart: 'nonsense' } }] }, {}).workStart, '09:00');

/* ---- the calendar -------------------------------------------------------- */
const cal = (c) => cleanCompany(c);
ok('working days default to the week', cal({}).workDays, [1, 2, 3, 4, 5]);
ok('a six-day week', cal({ workDays: [1, 2, 3, 4, 5, 6] }).workDays, [1, 2, 3, 4, 5, 6]);
ok('closures take a name', cal({ closures: [{ date: '2026-12-29', name: '年末休業' }] }).closures,
  [{ date: '2026-12-29', name: '年末休業' }]);
ok('a bare date is a closure too', cal({ closures: ['2026-12-30'] }).closures,
  [{ date: '2026-12-30', name: '' }]);
ok('a date that is not one is dropped', cal({ closures: ['29/12/2026', 'soon'] }).closures, []);
ok('the same day twice is once', cal({ closures: ['2026-12-29', '2026-12-29'] }).closures.length, 1);
ok('they come back in order',
  cal({ closures: ['2026-12-30', '2026-01-02'] }).closures.map((c) => c.date),
  ['2026-01-02', '2026-12-30']);
ok('closures reach the timesheet as the holiday feed does',
  closureMap({ companies: [{ closures: [{ date: '2026-12-29', name: '年末休業' }] }] }, {}),
  { '2026-12-29': '年末休業' });
ok('an unnamed one still says something', closureMap({ companies: [{ closures: ['2026-12-30'] }] }, {}),
  { '2026-12-30': '休業日' });

/* ---- the list ------------------------------------------------------------ */
ok('no settings at all still gives a company', companiesOf({}).length, 1);
ok('and it is モラブ阪神', companiesOf({})[0].name, 'モラブ阪神工業株式会社');
ok('an empty list is not a company', companiesOf({ companies: [] }).length, 1);
ok('rubbish in the list is normalised', companiesOf({ companies: [null] })[0].id, 'morabu');

console.log(`  ${n} checks — a working day is the house rule, the company's, then the person's`);
