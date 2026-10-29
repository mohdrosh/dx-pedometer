/* モラエッグ Phase 1 — 発送週、締切、そして割当。

   The allocation is the part that tells somebody no, so it is the part worth
   pinning down: the same inputs must always produce the same answer, nobody
   may be handed more than they asked for, and the packs handed out may never
   exceed the packs that were laid. */

import {
  dowOf, mondayOf, openShipMonday, shipDay, arrivalDay,
  requestDeadline, requestsOpen,
  pickupDeadline, weekInfo, allocate, missedFrom, statusOf,
} from '../src/egg-week.js';

let n = 0;
const fails = [];
const is = (what, got, want) => {
  n += 1;
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) fails.push(`${what}\n    got  ${a}\n    want ${b}`);
};

/* 2026-10-19 は月曜。以下すべてこの週を基準にする。 */

/* ------------------------------ the week -------------------------------- */

is('a Monday is its own Monday', mondayOf('2026-10-19'), '2026-10-19');
is('Friday belongs to the Monday before it', mondayOf('2026-10-23'), '2026-10-19');
is('Saturday too', mondayOf('2026-10-24'), '2026-10-19');

/* Sunday is where a week calculation usually goes wrong: getUTCDay calls it
   0, and 1-0 would push it forward into the week that has not started. */
is('Sunday belongs to the week that is ending', mondayOf('2026-10-25'), '2026-10-19');

is('across the new year', mondayOf('2027-01-01'), '2026-12-28');
is('across a month end', mondayOf('2026-11-01'), '2026-10-26');

/* --------------------- the week open for requests -----------------------
   佐野's rule, from 2026-11: 「締切は毎週月曜の朝9時（月曜が祝日の場合は火曜
   の9時）」. The old rule closed on the Friday BEFORE the shipment, so the
   week being requested for was always next week's. Now it is the shipping
   Monday's own 9am, so for the first nine hours of a Monday the open week
   is THIS one.

   2026-11-23 is 勤労感謝の日 and falls on a Monday, which is the case the
   whole rule exists for — and the one Moraegg goes live on.
------------------------------------------------------------------------ */
const HOL = { '2026-11-23': '勤労感謝の日' };

is('before 9 on a Monday, the eggs going out today are still open',
  openShipMonday('2026-11-30', 8, null, {}), '2026-11-30');
is('at 9 exactly it rolls to the Monday after',
  openShipMonday('2026-11-30', 9, null, {}), '2026-12-07');
is('and stays there for the rest of the week',
  openShipMonday('2026-12-02', 10, null, {}), '2026-12-07');
is('Saturday is the same week, not the one after',
  openShipMonday('2026-12-05', 10, null, {}), '2026-12-07');
is('and so is Sunday', openShipMonday('2026-12-06', 10, null, {}), '2026-12-07');

/* A holiday Monday carries the whole week with it: the deadline is the
   Tuesday, so Monday is not too late any more and neither is Tuesday
   morning. */
is('a holiday Monday leaves the week open through the Monday',
  openShipMonday('2026-11-23', 14, null, HOL), '2026-11-23');
is('and through the Tuesday morning',
  openShipMonday('2026-11-24', 8, null, HOL), '2026-11-23');
is('until 9 on the Tuesday',
  openShipMonday('2026-11-24', 9, null, HOL), '2026-11-30');

/* 「初回リクエストの締切 11/24（火）朝9:00」 — requests are taken from
   Saturday the 14th, and every one of them is for the first delivery even
   though two Mondays fall in between. */
is('before the service starts, everything lands on the first shipment',
  openShipMonday('2026-11-14', 10, null, HOL, '2026-11-23'), '2026-11-23');
is('including a Monday that would otherwise be its own week',
  openShipMonday('2026-11-16', 8, null, HOL, '2026-11-23'), '2026-11-23');
is('and the pin lets go once the first week is reached',
  openShipMonday('2026-11-24', 9, null, HOL, '2026-11-23'), '2026-11-30');
is('the setting is read from cfg when not passed',
  openShipMonday('2026-11-16', 8, { egg: { firstShip: '2026-11-23' } }, HOL), '2026-11-23');

/* ------------------------- the day it all moves ------------------------- */

is('eggs ship on the Monday', shipDay('2026-11-30', {}), '2026-11-30');
is('or the Tuesday when the Monday is a holiday', shipDay('2026-11-23', HOL), '2026-11-24');
is('and arrive the day after they ship', arrivalDay('2026-11-30', {}), '2026-12-01');
is('which a holiday moves too', arrivalDay('2026-11-23', HOL), '2026-11-25');

/* ---------------------------- the deadlines ------------------------------ */

is('requests close at 9 on the shipping Monday',
  requestDeadline('2026-11-30', null, {}), { date: '2026-11-30', hour: 9 });
is('and on the Tuesday when the Monday is a holiday',
  requestDeadline('2026-11-23', null, HOL), { date: '2026-11-24', hour: 9 });
is('9 unless 設定 says otherwise',
  requestDeadline('2026-11-30', { egg: { deadlineHour: 15 } }, {}),
  { date: '2026-11-30', hour: 15 });
is('midnight is a real hour and is kept',
  requestDeadline('2026-11-30', { egg: { deadlineHour: 0 } }, {}).hour, 0);
is('nonsense falls back to 9 rather than closing the window',
  requestDeadline('2026-11-30', { egg: { deadlineHour: 99 } }, {}).hour, 9);
is('so does a string that is not a number',
  requestDeadline('2026-11-30', { egg: { deadlineHour: 'morning' } }, {}).hour, 9);

is('open all the week before', requestsOpen('2026-11-30', '2026-11-26', 9, null, {}), true);
is('open on the deadline morning', requestsOpen('2026-11-30', '2026-11-30', 8, null, {}), true);
is('shut at 9 exactly', requestsOpen('2026-11-30', '2026-11-30', 9, null, {}), false);
is('shut after it', requestsOpen('2026-11-30', '2026-11-30', 10, null, {}), false);
is('shut on the Tuesday', requestsOpen('2026-11-30', '2026-12-01', 9, null, {}), false);
is('a holiday Monday is still open all day',
  requestsOpen('2026-11-23', '2026-11-23', 23, null, HOL), true);
is('and shuts at 9 on the Tuesday',
  requestsOpen('2026-11-23', '2026-11-24', 9, null, HOL), false);
is('an earlier deadline shuts earlier',
  requestsOpen('2026-11-30', '2026-11-30', 8, { egg: { deadlineHour: 7 } }, {}), false);

/* 「受け取りは基本その週の金曜まで」; a Monday that slipped to Tuesday does
   not move it, because the week still ends on the Friday. */
is('collect by the Friday of the shipping week',
  pickupDeadline('2026-11-30'), '2026-12-04');
is('or the Thursday when that Friday is a holiday',
  pickupDeadline('2026-11-30', { '2026-12-04': '休' }), '2026-12-03');
is('a holiday on another day changes nothing',
  pickupDeadline('2026-11-30', { '2026-12-02': '休' }), '2026-12-04');
is('a shifted shipping day does not shift the pickup',
  pickupDeadline('2026-11-23', HOL), '2026-11-27');

is('a normal week reads out whole',
  weekInfo('2026-11-30', null, {}),
  { ship: '2026-11-30', shipDay: '2026-11-30', arrive: '2026-12-01',
    deadline: { date: '2026-11-30', hour: 9 }, pickup: '2026-12-04', shifted: false });

/* The first delivery, exactly as her 初回の受付スタート！ card prints it:
   締切 11/24（火）朝9:00, 発送 11/24, 到着 11/25, 受け取り期限 11/27. */
is('and the first week matches the card she is handing out',
  weekInfo('2026-11-23', null, HOL),
  { ship: '2026-11-23', shipDay: '2026-11-24', arrive: '2026-11-25',
    deadline: { date: '2026-11-24', hour: 9 }, pickup: '2026-11-27', shifted: true });

/* ----------------------------- the draw --------------------------------- */

const req = (id, employeeId, want, at) => ({ id, employeeId, want, at });
/* Keyed by request id and sorted, so a comparison is about who got what and
   never about the order the rows happened to come back in. */
const got = (rows) => Object.fromEntries(
  rows.map((r) => [r.id, r.got]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
);
const total = (rows) => rows.reduce((s, r) => s + r.got, 0);

/* Four people want seven packs between them and there are only four. */
const four = [
  req('r1', 'e1', 1, '2026-10-20T09:00:00Z'),
  req('r2', 'e2', 3, '2026-10-20T10:00:00Z'),
  req('r3', 'e3', 2, '2026-10-21T09:00:00Z'),
  req('r4', 'e4', 1, '2026-10-22T09:00:00Z'),
];

is('先着順 fills in order of asking',
  got(allocate({ requests: four, packs: 4, rule: 'fcfs' })),
  { r1: 1, r2: 3, r3: 0, r4: 0 });

/* Running out mid-request gives them what is left rather than nothing —
   a pack unhanded-out is a pack wasted. */
is('and the request it runs out on takes the remainder',
  got(allocate({ requests: four, packs: 3, rule: 'fcfs' })),
  { r1: 1, r2: 2, r3: 0, r4: 0 });

is('1人1パック優先 gives everybody one before anybody gets two',
  got(allocate({ requests: four, packs: 4, rule: 'onEach' })),
  { r1: 1, r2: 1, r3: 1, r4: 1 });

is('and only then hands out the extras, in order',
  got(allocate({ requests: four, packs: 6, rule: 'onEach' })),
  { r1: 1, r2: 2, r3: 2, r4: 1 });

is('a round that nobody can take ends the loop rather than spinning',
  got(allocate({ requests: four, packs: 99, rule: 'onEach' })),
  { r1: 1, r2: 3, r3: 2, r4: 1 });

/* 前回落選者優先 — e3 and e4 missed out last week, so they go first even
   though they asked later. */
is('last week’s misses go first',
  got(allocate({ requests: four, packs: 3, rule: 'missedFirst', missedLastWeek: ['e3', 'e4'] })),
  { r1: 0, r2: 0, r3: 2, r4: 1 });

is('and among themselves they are still in order of asking',
  got(allocate({ requests: four, packs: 2, rule: 'missedFirst', missedLastWeek: ['e4', 'e3'] })),
  { r1: 0, r2: 0, r3: 2, r4: 0 });

is('nobody missed last week means plain 先着順',
  got(allocate({ requests: four, packs: 4, rule: 'missedFirst', missedLastWeek: [] })),
  got(allocate({ requests: four, packs: 4, rule: 'fcfs' })));

is('an employee id of a different type still matches',
  got(allocate({ requests: [req('r1', 1, 1, 'a'), req('r2', 2, 1, 'b')], packs: 1, rule: 'missedFirst', missedLastWeek: [2] })),
  { r1: 0, r2: 1 });

/* --------------------------- the lottery -------------------------------- */

/* A draw nobody can check is not a draw. The same week must come out the
   same way however many times it is run, including a month later when
   somebody asks why they missed out. */
const drawA = got(allocate({ requests: four, packs: 3, rule: 'lottery', seed: '2026-10-26' }));
const drawB = got(allocate({ requests: four, packs: 3, rule: 'lottery', seed: '2026-10-26' }));
is('the same week draws the same way, every time', drawA, drawB);

const drawNext = got(allocate({ requests: four, packs: 3, rule: 'lottery', seed: '2026-11-02' }));
is('a different week draws differently', drawA === drawNext, false);

is('a draw never hands out more than was laid',
  total(allocate({ requests: four, packs: 3, rule: 'lottery', seed: '2026-10-26' })), 3);

/* Over many weeks everybody has to come up — a "lottery" that always picks
   the same person is the thing 佐野 is trying to avoid with it. */
const winners = new Set();
for (let w = 0; w < 40; w += 1) {
  for (const r of allocate({ requests: four, packs: 1, rule: 'lottery', seed: `w${w}` })) {
    if (r.got > 0) winners.add(r.id);
  }
}
is('over 40 weeks the single pack reaches everyone', [...winners].sort(), ['r1', 'r2', 'r3', 'r4']);

/* ------------------------- what must never happen ------------------------ */

const rules = ['fcfs', 'onEach', 'lottery', 'missedFirst'];

for (const rule of rules) {
  const out = allocate({ requests: four, packs: 3, rule, seed: 's', missedLastWeek: ['e3'] });
  is(`${rule}: hands out exactly what there is`, total(out), 3);
  is(`${rule}: nobody gets more than they asked for`,
    out.every((r) => r.got <= r.want), true);
  is(`${rule}: nobody gets a negative number of packs`,
    out.every((r) => r.got >= 0), true);
  is(`${rule}: everybody who asked is answered, including the misses`,
    out.length, four.length);

  /* Plenty for everyone is the easy week and must still be right. */
  is(`${rule}: a good week fills every request`,
    got(allocate({ requests: four, packs: 50, rule, seed: 's' })),
    { r1: 1, r2: 3, r3: 2, r4: 1 });

  /* 「10個未満の端数は登録しない」 — some weeks the hens do not deliver. */
  is(`${rule}: no packs means nobody gets any`,
    total(allocate({ requests: four, packs: 0, rule })), 0);
  is(`${rule}: and everybody is still told so`,
    allocate({ requests: four, packs: 0, rule }).length, 4);
  is(`${rule}: nobody asked`, allocate({ requests: [], packs: 20, rule }), []);
}

/* The database will hand us whatever it holds; none of it may crash a draw
   or conjure a pack out of nothing. */
is('a request for zero packs is dropped',
  allocate({ requests: [req('r1', 'e1', 0, 'a')], packs: 5 }).length, 0);
is('a negative request cannot mint packs',
  total(allocate({ requests: [req('r1', 'e1', -4, 'a'), req('r2', 'e2', 2, 'b')], packs: 5 })), 2);
is('a fractional request is floored',
  got(allocate({ requests: [req('r1', 'e1', 2.9, 'a')], packs: 5 })), { r1: 2 });
is('fractional packs are floored too',
  total(allocate({ requests: four, packs: 2.9, rule: 'fcfs' })), 2);
is('nothing at all is not a crash', allocate({}), []);
is('negative packs are no packs', total(allocate({ requests: four, packs: -5 })), 0);

/* Two requests logged in the same second must not re-order between runs:
   the ordering has to come from the data, not from the query planner. */
const sameTime = [
  req('rB', 'e2', 1, '2026-10-20T09:00:00Z'),
  req('rA', 'e1', 1, '2026-10-20T09:00:00Z'),
];
is('a tie is broken by request id, not by row order',
  got(allocate({ requests: sameTime, packs: 1, rule: 'fcfs' })), { rA: 1, rB: 0 });
is('and the same way whichever order they arrive in',
  got(allocate({ requests: [...sameTime].reverse(), packs: 1, rule: 'fcfs' })), { rA: 1, rB: 0 });

/* The caller gets its own rows back, so a draw can be re-run against the
   same request list without the first one having changed it. */
const original = [req('r1', 'e1', 2, 'a')];
allocate({ requests: original, packs: 5 });
is('the request list handed in is not modified', original[0].got, undefined);

/* --------------------------- after the draw ------------------------------ */

const drawn = allocate({ requests: four, packs: 3, rule: 'fcfs' });
is('those who got nothing are next week’s priority', missedFrom(drawn).sort(), ['e3', 'e4']);
is('one person, one entry, however many requests they made',
  missedFrom([{ employeeId: 'e9', got: 0 }, { employeeId: 'e9', got: 0 }]), ['e9']);
is('a full week leaves nobody waiting', missedFrom(allocate({ requests: four, packs: 50 })), []);
is('nothing at all is nobody', missedFrom(null), []);

/* 「自分の申請状況（受付済／確定／落選／受け取り済み）が確認できる」 */
is('before the draw it is only received', statusOf({ got: 0 }), 'received');
is('a confirmed request says so', statusOf({ got: 1, drawnAt: 'x' }), 'confirmed');
is('and a lost one says that', statusOf({ got: 0, drawnAt: 'x' }), 'missed');
is('once collected, collected', statusOf({ got: 1, drawnAt: 'x', pickedUpAt: 'y' }), 'picked');
is('a nonexistent request is not a status', statusOf(null), 'received');

/* 5.5:「期限までに受け取られなかったパックは…『期限切れ』として記録する」.
   The shipment is Monday 2026-10-26, so the deadline is Friday the 30th. */
const won = { got: 1, drawnAt: 'x', ship: '2026-10-26' };

is('on the deadline itself it is still there to collect',
  statusOf(won, '2026-10-30'), 'confirmed');
is('the day after, it has expired', statusOf(won, '2026-10-31'), 'expired');
is('and mid-week it is simply confirmed', statusOf(won, '2026-10-28'), 'confirmed');

/* Turning up late with the packs still on the desk is still collecting
   them, whatever the deadline said. */
is('collected after the deadline is collected, not expired',
  statusOf({ ...won, pickedUpAt: 'y' }, '2026-11-03'), 'picked');

/* A 落選 has nothing to expire — there were never any packs. */
is('a request that won nothing cannot expire',
  statusOf({ got: 0, drawnAt: 'x', ship: '2026-10-26' }, '2026-11-30'), 'missed');
is('nor can one that has not been drawn',
  statusOf({ got: 0, ship: '2026-10-26' }, '2026-11-30'), 'received');

/* 金曜が休みなら木曜. A holiday on the Friday pulls the whole thing forward. */
is('a holiday on the Friday expires it a day earlier',
  statusOf(won, '2026-10-30', { '2026-10-30': '休' }), 'expired');
is('and the Thursday is then the last day to collect',
  statusOf(won, '2026-10-29', { '2026-10-30': '休' }), 'confirmed');

/* Callers that do not know what day it is must not expire anything. */
is('with no date, nothing ever expires', statusOf(won), 'confirmed');
is('a row with no week cannot be judged either', statusOf({ got: 1, drawnAt: 'x' }, '2027-01-01'), 'confirmed');

if (fails.length) {
  console.error(`\n  ${fails.length} of ${n} failed:\n`);
  fails.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`  ${n} checks — weeks, deadlines, and four ways to be told no`);
