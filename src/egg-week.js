/* ============================================================================
   モラエッグ Phase 1 — 発送週と割当

   佐野:「締切は毎週月曜の朝9時（月曜が祝日の場合は火曜の9時）」「締切日に丹波
   から発送し、翌日事務所に到着」「受け取りは基本その週の金曜まで」

   A week is named after the Monday the eggs ship. Everything else hangs off
   that one date: requests close at 9am on it, the eggs go out the same day,
   they arrive the next, and the Friday of that week is when uncollected
   packs expire.

   This replaced an earlier rule — deadline the Friday BEFORE, at 17:00 —
   and the change is sharper than it sounds. Under the old one the week
   being requested for was always next week's; under this one, between
   midnight and 9am on a Monday, it is today's, and the eggs somebody asks
   for at 08:55 are on a van by lunchtime.

   Dates are plain YYYY-MM-DD strings, as they are in submission-window.js
   and for the same reason — the browser reads the laptop's clock and the
   server reads Tokyo's, and a Date would let the two disagree about which
   day it is. Strings in this format also sort and compare correctly.

   ---------------------------------------------------------------------------
   The allocation is the part worth being careful about. There is never
   enough: about 210 eggs a week against however many people ask, so most
   weeks somebody is told no. Which somebody is decided here, and it has to
   be decidable twice — the same inputs must always produce the same result,
   or nobody can check a draw after the fact. The allocation itself moved
   to src/egg-allot.js on 2026/11/03, when the company settled its own
   rules; what is left here is the calendar those rules run on — which
   Monday ships, when requests close, and when an uncollected pack
   expires.
   ========================================================================= */

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const at = (s) => new Date(`${s}T00:00:00Z`);
const shift = (s, days) => iso(new Date(at(s).getTime() + days * DAY));

/** A day some number of days from another, as YYYY-MM-DD. */
export const shiftDay = shift;

/** 0 Sunday … 6 Saturday, read in UTC so it never drifts with the host. */
export const dowOf = (s) => at(s).getUTCDay();

/** The Monday of the week `s` falls in. Sunday belongs to the week before. */
export function mondayOf(s) {
  const d = dowOf(s);
  return shift(s, d === 0 ? -6 : 1 - d);
}

/**
 * The Monday eggs next ship for, given today.
 *
 * 佐野:「来週月曜発送分の申請を受け付けます」 — so the week being requested
 * for is next week's, not this one, right up until this week's deadline has
 * passed. Which it has by definition: the deadline is the Friday before the
 * Monday, so from Saturday onwards the next Monday is already shipping and
 * the one being requested for is the one after.
 */
/* The default hour, and the default day of the week eggs ship. Both are
   settings, but a schedule with no answer when the setting is missing is
   a schedule that silently picks midnight on a Sunday. */
const DEFAULT_HOUR = 9;

/** The configured deadline hour, or 9. */
function hourOf(cfg) {
  const h = Number(cfg?.egg?.deadlineHour);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : DEFAULT_HOUR;
}

/**
 * 締切日 — the Monday of the shipping week, pushed to the Tuesday when
 * that Monday is a holiday.
 *
 * 佐野:「締切は毎週月曜の朝9時（月曜が祝日の場合は火曜の9時）」, and
 * 「祝日の月曜は、締切・発送・到着が1日後ろへ」 — so one shift moves all
 * three, which is why they are all worked out from this one day rather
 * than each from the Monday.
 *
 * Only the Monday is checked. A run of holidays from Monday would push
 * further, but 振替休日 lands on a Monday after a Sunday holiday and the
 * Tuesday is then a working day; a Monday AND Tuesday both closed is the
 * new year shutdown, when nothing is being harvested anyway. An office
 * that does shut can be given a 休業日 in 設定, which is merged in here.
 */
export function shipDay(shipMonday, holidays = {}, cfg = null) {
  /* 「日付を変更」: an administrator's date for this one week beats both
     the Monday and the holiday rule. It is stored against the Monday that
     names the week, so the week keeps its name however far the day moves
     — otherwise a shipment pushed to the Wednesday would look like a
     different week to every row already filed under the Monday. */
  const set = weekPlan(shipMonday, cfg).ship;
  if (set) return set;
  return holidays[shipMonday] ? shift(shipMonday, 1) : shipMonday;
}

/**
 * What an administrator has said about one week, if anything.
 *
 * 仕様書 4.6:「通常／日付を変更／お休み」 and a notice to go with it.
 * Normal is the absence of an entry rather than a stored word, so a
 * schedule nobody has touched is an empty object and every week in it
 * is ordinary.
 */
export function weekPlan(shipMonday, cfg) {
  const row = cfg?.egg?.weeks?.[shipMonday];
  const none = {
    type: 'normal', ship: null, deadline: null, arrive: null, pickup: null, note: '',
  };
  if (!row) return none;
  const d = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const note = String(row.note || '');
  if (row.off === true) return { ...none, type: 'off', note };
  /* 仕様書 4.8（2026/11/05）:「『日付を変更』では締切・発送・到着・受け取り
     期限を入力する」. Four dates, each optional: an administrator moving
     only the shipping day should not have to retype the other three, and
     whatever they leave blank is worked out the ordinary way. */
  const out = {
    ...none,
    ship: d(row.ship),
    deadline: d(row.deadline),
    arrive: d(row.arrive),
    pickup: d(row.pickup),
    note,
  };
  const changed = out.ship || out.deadline || out.arrive || out.pickup;
  return { ...out, type: changed ? 'changed' : 'normal' };
}

/** 「お休み」 — a week with no shipment at all. */
export function weekOff(shipMonday, cfg) {
  return weekPlan(shipMonday, cfg).type === 'off';
}

/** 申請締切 — the shipping day, at the configured hour. */
export function requestDeadline(shipMonday, cfg, holidays = {}) {
  /* A deadline of its own beats the shipping day, which is otherwise
     also the deadline. The hour is the schedule's either way — 「月曜9時」
     is the rule, and what a changed week moves is the day. */
  const own = weekPlan(shipMonday, cfg).deadline;
  return { date: own || shipDay(shipMonday, holidays, cfg), hour: hourOf(cfg) };
}

/**
 * The days whose eggs go out on this shipping Monday.
 *
 * 仕様書 4.2:「『今週の取れ高』は、前回の締切から今回の締切までに入力された
 * パック数とする」 — counted deadline to deadline, not Monday to Monday.
 *
 * In an ordinary week those are the same seven days and this looks like
 * a long way round. They come apart exactly when a Monday is a holiday
 * and the deadline moves to the Tuesday: the eggs laid on that Monday
 * belong to the shipment that goes out the next morning, and a window
 * that stopped on the Sunday would leave them out of the count people
 * are looking at and out of the number the shed confirms. The first
 * shipment of all, 11/23, is such a week.
 *
 * Inclusive of both ends: `to` is the day before this week's deadline,
 * because the deadline day's own eggs are counted on the day they are
 * registered, which is after the van has gone.
 */
export function harvestWindow(shipMonday, cfg, holidays = {}) {
  const from = requestDeadline(shift(shipMonday, -7), cfg, holidays).date;
  const to = shift(requestDeadline(shipMonday, cfg, holidays).date, -1);
  /* A schedule edited into knots must not ask the database for a range
     that runs backwards, which returns nothing and reads as "no eggs". */
  return to < from ? { from, to: from } : { from, to };
}

/**
 * The shipping week whose request deadline has just passed, or null.
 *
 * 仕様書 5「締切後に配分を確定する」 is a job for the clock, and the clock
 * cannot ask openShipMonday which week to decide: by the time the deadline
 * has passed that has already rolled on to the next one, which is the
 * whole point of it. So the question is asked the other way round — of the
 * three Mondays this day could possibly be a deadline for, which one is
 * it? Three, because a public holiday moves a deadline by a day in either
 * direction, and a Monday holiday pushes the first week's deadline into
 * the Tuesday that belongs to the same shipping Monday.
 *
 * `firstShip` keeps it quiet before Moraegg starts: there is no week to
 * decide until the first one.
 */
export function dueShip(todayIso, nowHour, cfg, holidays = {}, firstShip = null) {
  const monday = mondayOf(todayIso);
  for (const ship of [shift(monday, -7), monday, shift(monday, 7)]) {
    if (firstShip && ship < String(firstShip)) continue;
    if (weekOff(ship, cfg)) continue;
    const due = requestDeadline(ship, cfg, holidays);
    if (due.date === todayIso && Number(nowHour) >= due.hour) return ship;
  }
  return null;
}

/** 到着日 — 「丹波から発送、翌日事務所に到着」. */
export function arrivalDay(shipMonday, holidays = {}, cfg = null) {
  return weekPlan(shipMonday, cfg).arrive || shift(shipDay(shipMonday, holidays, cfg), 1);
}

/**
 * The Monday naming the shipping week that is currently open for requests.
 *
 * The deadline used to fall on the Friday BEFORE the shipping Monday, so
 * the week being requested for was always the next one. It is now the
 * shipping Monday's own 9am, which means for the first hours of a Monday
 * the open week is THIS week — the eggs being asked for go out the same
 * morning. From 9am (or the Tuesday, when the Monday is a holiday) it
 * rolls to the Monday after.
 *
 * `firstShip` pins the answer until that week arrives: before Moraegg
 * starts, every request taken belongs to the first delivery, whatever
 * Monday happens to be nearer.
 */
export function openShipMonday(todayIso, nowHour, cfg, holidays = {}, firstShip = null) {
  const thisMonday = mondayOf(todayIso);
  const open = requestsOpen(thisMonday, todayIso, nowHour, cfg, holidays)
    ? thisMonday
    : shift(thisMonday, 7);
  const first = firstShip || cfg?.egg?.firstShip;
  let week = first && open < String(first) ? String(first) : open;
  /* 「お休み」 weeks are stepped over rather than refused: somebody asking
     during the new year shutdown is asking for the week it ends, and
     being told 「受付は終了しました」 for a week that was never going to
     ship is an answer to a question nobody asked. Bounded, so a schedule
     with every week switched off cannot spin. */
  for (let i = 0; i < 12 && weekOff(week, cfg); i += 1) week = shift(week, 7);
  return week;
}

/* The old name, kept because callers that do not know the hour still
   want an answer. It reads the week after this one, which is what the
   name always meant. */
export function nextShipMonday(todayIso) {
  return shift(mondayOf(todayIso), 7);
}

/**
 * May requests for this shipping week still be made or changed?
 *
 * 「申請の変更・取り消しは締切まで可能」. The hour matters on the day itself
 * and nowhere else, so it is only consulted then.
 */
export function requestsOpen(shipMonday, nowIso, nowHour, cfg, holidays = {}) {
  /* 「11/21（土）初回リクエストの受付開始」 — sign-up opens a week before
     requests do, so being registered is not the same as being able to
     ask. Before that date nothing is open, whatever the deadline says. */
  const from = cfg?.egg?.requestsFrom;
  if (from && nowIso && String(nowIso) < String(from)) return false;
  /* 「お休み」: nothing ships, so nothing is taken for it. */
  if (weekOff(shipMonday, cfg)) return false;
  const { date, hour } = requestDeadline(shipMonday, cfg, holidays);
  if (nowIso < date) return true;
  if (nowIso > date) return false;
  return Number(nowHour) < hour;
}

/**
 * 受け取り期限 — the Friday of the shipping week, or the Thursday when that
 * Friday is a holiday. 佐野:「受け取りは基本その週の金曜まで」; a Monday that
 * slipped to Tuesday does not move it, because the week still ends on the
 * Friday. `holidays` is the map the rest of the app already carries,
 * keyed by YYYY-MM-DD.
 */
export function pickupDeadline(shipMonday, holidays = {}, cfg = null) {
  const own = weekPlan(shipMonday, cfg).pickup;
  if (own) return own;
  const friday = shift(shipMonday, 4);
  return holidays[friday] ? shift(shipMonday, 3) : friday;
}

/** Everything about one shipping week, for a screen to print. */
export function weekInfo(shipMonday, cfg, holidays) {
  const plan = weekPlan(shipMonday, cfg);
  return {
    ship: shipMonday,
    shipDay: shipDay(shipMonday, holidays, cfg),
    arrive: arrivalDay(shipMonday, holidays, cfg),
    deadline: requestDeadline(shipMonday, cfg, holidays),
    pickup: pickupDeadline(shipMonday, holidays, cfg),
    shifted: shipDay(shipMonday, holidays, cfg) !== shipMonday,
    /* What an administrator said about this week, so a screen can print
       「今週はお休みです」 and her notice without asking a second time. */
    plan: plan.type,
    note: plan.note,
  };
}

/* allocate() lived here until 2026/11/03: four rules (先着順 / 1人1パック
   優先 / 抽選 / 前回落選者優先) that the 需要調査 was going to choose
   between. The company settled the question itself, and what they settled
   is none of the four but a sequence — 仕事用 in full, then one personal
   pack each in 優先ポイント order, then second packs. That lives in
   src/egg-allot.js, and this is the note saying where it went. */

/** Who asked and got nothing — next week's 前回落選者, by employee. */
export function missedFrom(allocated) {
  return [...new Set((allocated || []).filter((r) => r.got === 0).map((r) => String(r.employeeId)))];
}

/**
 * What a request's status reads as.
 *
 * 5.2:「自分の申請状況（受付済／確定／落選／受け取り済み）が確認できる」, and
 * 5.5:「期限までに受け取られなかったパックは、その事務所の判断で扱う。システム
 * では『期限切れ』として記録するのみ」 — so there is a fifth state, and it is
 * the one the office contact needs to see to know which packs are now theirs
 * to deal with.
 *
 * Expiry is worked out from the deadline rather than written by a nightly
 * job. A job is a thing that can fail silently over a long weekend and
 * leave a week looking collectable when it is not; a date comparison
 * cannot. Collecting late still counts — somebody who turns up on Monday
 * with the packs still on the desk has collected them, whatever the
 * deadline said, so pickedUpAt is checked first.
 *
 * Called without a date nothing ever expires, which is what the older
 * callers that do not know today's date should see.
 */
export function statusOf(row, todayIso = null, holidays = {}, final = true) {
  if (row?.pickedUpAt) return 'picked';
  /* 配布ルール 10（2026/11/05）: the allocation runs when the Tamba staff
     confirm the shipping count, and is not an answer to anybody until
     they have checked it and pressed 最終確定. Between the two it is
     「確認中」 — a real state, because a person who read 落選 on Monday
     morning and 確定 at noon would rightly never trust the screen again.
     Both sides of a drawn week are affected, so this sits above the
     got-check rather than beside it. */
  if (row?.drawnAt && !final) return 'checking';
  if (row?.got > 0) {
    const by = row.ship ? pickupDeadline(mondayOf(row.ship), holidays) : null;
    return todayIso && by && String(todayIso) > by ? 'expired' : 'confirmed';
  }
  if (row?.drawnAt) return 'missed';
  return 'received';
}
