/* モラエッグ Phase 1 — 発送週、締切、そして割当。

   The allocation is the part that tells somebody no, so it is the part worth
   pinning down: the same inputs must always produce the same answer, nobody
   may be handed more than they asked for, and the packs handed out may never
   exceed the packs that were laid. */

import {
  dowOf, mondayOf, openShipMonday, shipDay, deadlineDay, arrivalDay,
  requestDeadline, requestsOpen,
  pickupDeadline, weekInfo, missedFrom, statusOf, dueShip, weekPlan, weekOff,
  harvestWindow,
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

/* 2026/11/12: the courier collects around 11:00, so a 9am deadline
   cannot be shipped the same day. The deadline is the fixed point now
   and the van goes the morning after it. */
is('the deadline is the Monday', deadlineDay('2026-11-30', {}), '2026-11-30');
is('or the Tuesday when the Monday is a holiday', deadlineDay('2026-11-23', HOL), '2026-11-24');
is('eggs ship the day after the deadline', shipDay('2026-11-30', {}), '2026-12-01');
is('which the holiday moves too', shipDay('2026-11-23', HOL), '2026-11-25');
is('and arrive the day after they ship', arrivalDay('2026-11-30', {}), '2026-12-02');
is('holiday and all', arrivalDay('2026-11-23', HOL), '2026-11-26');

/* 「東京はさらに1日後」 — an office's own number of extra nights. */
is('東京 is a night behind the rest', arrivalDay('2026-11-23', HOL, null, 1), '2026-11-27');
is('and on an ordinary week too', arrivalDay('2026-11-30', {}, null, 1), '2026-12-03');
is('0 is the same date as everybody else', arrivalDay('2026-11-30', {}, null, 0), '2026-12-02');
is('a nonsense offset is read as none', arrivalDay('2026-11-30', {}, null, 'soon'), '2026-12-02');

/* Shipping lands on a Tuesday now, and a Tuesday can itself be a
   holiday — nobody collects a parcel then, so it steps forward. */
{
  const TUE = { '2026-12-08': '祝' };
  is('a holiday on the shipping day pushes it', shipDay('2026-12-07', TUE), '2026-12-09');
  is('and the arrival with it', arrivalDay('2026-12-07', TUE), '2026-12-10');
  is('but not the deadline', deadlineDay('2026-12-07', TUE), '2026-12-07');
}
/* Nor over a weekend: a Friday deadline would otherwise ship on the
   Saturday to an office nobody is in. */
is('a weekend is stepped over', shipDay('2026-12-04', {}), '2026-12-07');

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

/* 「11/14 参加登録の受付開始、11/21 初回リクエストの受付開始」 — a week
   apart, so being signed up is not the same as being able to ask. */
const LAUNCH = { egg: { requestsFrom: '2026-11-21', deadlineHour: 9 } };
is('nothing is open before requests start, whatever the deadline says',
  requestsOpen('2026-11-23', '2026-11-14', 10, LAUNCH, HOL), false);
is('not on the day before either',
  requestsOpen('2026-11-23', '2026-11-20', 23, LAUNCH, HOL), false);
is('open on the day requests start',
  requestsOpen('2026-11-23', '2026-11-21', 0, LAUNCH, HOL), true);
is('and the deadline still closes it',
  requestsOpen('2026-11-23', '2026-11-24', 9, LAUNCH, HOL), false);
is('with no start date set, only the deadline decides',
  requestsOpen('2026-11-23', '2026-11-14', 10, { egg: { deadlineHour: 9 } }, HOL), true);

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
  { ship: '2026-11-30', shipDay: '2026-12-01', arrive: '2026-12-02', arriveBy: null,
    deadline: { date: '2026-11-30', hour: 9 }, pickup: '2026-12-04', shifted: false,
    plan: 'normal', note: '' });

/* The first delivery, exactly as 佐野 wrote it on 2026/11/12:
   締切 11/24（火）朝9:00, 発送 11/25, 到着 11/26（東京は 11/27）,
   受け取り期限 11/27. */
is('and the first week matches the card she is handing out',
  weekInfo('2026-11-23', null, HOL),
  { ship: '2026-11-23', shipDay: '2026-11-25', arrive: '2026-11-26', arriveBy: null,
    deadline: { date: '2026-11-24', hour: 9 }, pickup: '2026-11-27', shifted: true,
    plan: 'normal', note: '' });
is('and 東京 reads a day later on it',
  weekInfo('2026-11-23', null, HOL, [{ name: '東京', arriveDays: 1 }, { name: '本社（神戸）' }])
    .arriveBy,
  { '東京': '2026-11-27', '本社（神戸）': '2026-11-26' });

/* ------------------- 通常 / 日付を変更 / お休み --------------------------- */
/* 仕様書 4.6. Three kinds of week, set by an administrator against the
   Monday that names the week — so a shipment moved to the Wednesday is
   still filed under the same Monday as every request already made for
   it. */

const CFG9 = { egg: { deadlineHour: 9 } };
const OFF = { egg: { deadlineHour: 9, weeks: { '2026-12-28': { off: true, note: '年末年始のため、今週はお休みです。' } } } };
const MOVED = { egg: { deadlineHour: 9, weeks: { '2026-12-07': { ship: '2026-12-09', note: '今週は水曜発送です。' } } } };

is('an untouched week is an ordinary one', weekPlan('2026-12-07', CFG9),
  { type: 'normal', ship: null, deadline: null, arrive: null, pickup: null, note: '' });
is('a week switched off says so', weekPlan('2026-12-28', OFF).type, 'off');
is('and carries her notice', weekPlan('2026-12-28', OFF).note, '年末年始のため、今週はお休みです。');
is('a moved week names its day', weekPlan('2026-12-07', MOVED),
  { type: 'changed', ship: '2026-12-09', deadline: null, arrive: null, pickup: null,
    note: '今週は水曜発送です。' });

/* 仕様書 4.8（2026/11/05）: all four dates, each on its own. */
{
  const ALL = { egg: { deadlineHour: 9, weeks: { '2026-12-07': {
    deadline: '2026-12-08', ship: '2026-12-09', arrive: '2026-12-10', pickup: '2026-12-12',
  } } } };
  is('a changed week can move its deadline',
    requestDeadline('2026-12-07', ALL, {}), { date: '2026-12-08', hour: 9 });
  is('its shipping day', shipDay('2026-12-07', {}, ALL), '2026-12-09');
  is('its arrival', arrivalDay('2026-12-07', {}, ALL), '2026-12-10');
  is('and its pickup deadline', pickupDeadline('2026-12-07', {}, ALL), '2026-12-12');
  is('and the week reads out as all four',
    weekInfo('2026-12-07', ALL, {}),
    { ship: '2026-12-07', shipDay: '2026-12-09', arrive: '2026-12-10', arriveBy: null,
      deadline: { date: '2026-12-08', hour: 9 }, pickup: '2026-12-12', shifted: true,
      plan: 'changed', note: '' });
}
{
  /* Only one of the four moved: the other three are still worked out the
     ordinary way, so nobody has to retype dates that have not changed. */
  const ONE = { egg: { deadlineHour: 9, weeks: { '2026-12-07': { arrive: '2026-12-11' } } } };
  is('moving the arrival alone leaves the shipping day', shipDay('2026-12-07', {}, ONE), '2026-12-08');
  is('and moves only the arrival', arrivalDay('2026-12-07', {}, ONE), '2026-12-11');
  is('with the pickup deadline still the Friday', pickupDeadline('2026-12-07', {}, ONE), '2026-12-11');
  is('and the week counts as changed', weekPlan('2026-12-07', ONE).type, 'changed');
}

is('the administrator’s date beats the Monday', shipDay('2026-12-07', {}, MOVED), '2026-12-09');
is('and beats the holiday rule too',
  shipDay('2026-12-07', { '2026-12-07': 'x' }, MOVED), '2026-12-09');
/* Moving the shipping day no longer moves the deadline with it: they
   came apart on 2026/11/12 and 日付を変更 has a field for each. */
is('a moved shipping day leaves the deadline where it was',
  requestDeadline('2026-12-07', MOVED, {}), { date: '2026-12-07', hour: 9 });
is('the arrival still follows the van', arrivalDay('2026-12-07', {}, MOVED), '2026-12-10');
/* 受け取りは「その週の金曜まで」, which a moved shipping day does not change:
   the week still ends on the Friday. */
is('but the pickup deadline is still the Friday', pickupDeadline('2026-12-07', {}), '2026-12-11');

is('nothing is taken for a week that is off',
  requestsOpen('2026-12-28', '2026-12-20', 9, OFF, {}), false);
is('while the weeks around it are untouched',
  requestsOpen('2026-12-21', '2026-12-20', 9, OFF, {}), true);
/* Somebody asking during the shutdown is asking for the week it ends. */
is('a week that is off is stepped over, not refused',
  openShipMonday('2026-12-28', 10, OFF, {}), '2027-01-04');
is('and the clock has no deadline to keep for it',
  dueShip('2026-12-28', 9, OFF, {}), null);

/* A schedule with everything switched off must not spin. */
const ALLOFF = { egg: { weeks: Object.fromEntries(
  Array.from({ length: 40 }, (_, i) => [`2027-0${1 + Math.floor(i / 28)}-01`, { off: true }]),
) } };
is('a hopeless schedule still answers', typeof openShipMonday('2026-12-07', 10, ALLOFF, {}), 'string');

/* --------------- which days' eggs go out on a given Monday ---------------- */
/* 仕様書 4.2:「前回の締切から今回の締切までに入力されたパック数」. */
is('an ordinary week is the seven days before it',
  harvestWindow('2026-11-30', CFG9, {}), { from: '2026-11-23', to: '2026-11-29' });
/* 勤労感謝の日 on Monday 11/23 pushes that week's deadline to the Tuesday,
   so the eggs laid on the Monday go out with it. A Monday-to-Monday
   window would have left them uncounted on the very first shipment. */
is('a holiday Monday is counted into the week it ships with',
  harvestWindow('2026-11-23', CFG9, HOL), { from: '2026-11-16', to: '2026-11-23' });
is('and the week after it starts where that one ended',
  harvestWindow('2026-11-30', CFG9, HOL), { from: '2026-11-24', to: '2026-11-29' });
/* No day is counted twice, and none is missed, across a holiday. */
{
  const a = harvestWindow('2026-11-23', CFG9, HOL);
  const b = harvestWindow('2026-11-30', CFG9, HOL);
  is('the two weeks meet exactly', new Date(b.from) - new Date(a.to), 86400000);
}

/* ------------------- which week the clock has to decide ------------------ */
/* 仕様書 5「締切後に配分を確定する」. The run is unattended, so the only
   thing standing between a quiet Monday and a week decided twice — or
   never — is this answer. */

is('before the hour, nothing is due', dueShip('2026-11-30', 8, CFG9, {}), null);
is('on the hour, this Monday is', dueShip('2026-11-30', 9, CFG9, {}), '2026-11-30');
is('and it stays due for the rest of the day',
  dueShip('2026-11-30', 17, CFG9, {}), '2026-11-30');
is('a Tuesday in an ordinary week is nobody’s deadline',
  dueShip('2026-12-01', 23, CFG9, {}), null);

/* 勤労感謝の日 on Monday 11/23 moves that week's deadline to the Tuesday —
   and the Tuesday still belongs to the Monday that names the week. */
is('a holiday Monday is not its own deadline', dueShip('2026-11-23', 23, CFG9, HOL), null);
is('the Tuesday after it decides that same week',
  dueShip('2026-11-24', 9, CFG9, HOL), '2026-11-23');

/* Nothing exists before the first delivery, however the calendar falls. */
is('nothing is due before Moraegg starts',
  dueShip('2026-11-16', 9, CFG9, {}, '2026-11-23'), null);
is('and the first week is due on its own deadline',
  dueShip('2026-11-24', 9, CFG9, HOL, '2026-11-23'), '2026-11-23');

/* allocate()'s 70-odd checks were deleted on 2026/11/03 with the function
   they covered: the four rules the 需要調査 was going to choose between.
   The company settled the question itself, and the sequence they settled
   on is tested in test/egg-allot-cases.mjs. */

/* --------------------------- after the draw ------------------------------ */

const drawn = [
  { id: 'r1', employeeId: 'e1', got: 1 }, { id: 'r2', employeeId: 'e2', got: 2 },
  { id: 'r3', employeeId: 'e3', got: 0 }, { id: 'r4', employeeId: 'e4', got: 0 },
];
is('those who got nothing are next week’s priority', missedFrom(drawn).sort(), ['e3', 'e4']);
is('one person, one entry, however many requests they made',
  missedFrom([{ employeeId: 'e9', got: 0 }, { employeeId: 'e9', got: 0 }]), ['e9']);
is('a full week leaves nobody waiting',
  missedFrom(drawn.map((r) => ({ ...r, got: 1 }))), []);
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
