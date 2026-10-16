/* ============================================================================
   モラエッグ Phase 1 — 発送週と割当

   佐野:「毎週月曜に丹波から受取事務所へ発送し、社員はその週のうちに事務所へ
   取りに行く」「締切は前週の金曜17時」「受け取り期限はその週の金曜日（金曜が
   休みの場合は木曜日）」

   A week is named after the Monday the eggs ship. Everything else hangs off
   that one date: the Friday before it is when requests close, the Friday
   after it is when uncollected packs expire.

   Dates are plain YYYY-MM-DD strings, as they are in submission-window.js
   and for the same reason — the browser reads the laptop's clock and the
   server reads Tokyo's, and a Date would let the two disagree about which
   day it is. Strings in this format also sort and compare correctly.

   ---------------------------------------------------------------------------
   The allocation is the part worth being careful about. There is never
   enough: about 210 eggs a week against however many people ask, so most
   weeks somebody is told no. Which somebody is decided here, and it has to
   be decidable twice — the same inputs must always produce the same result,
   or nobody can check a draw after the fact and 「抽選」 becomes something
   people have to take on trust. So the lottery is seeded on the shipping
   week rather than on Math.random, and running it again a month later
   reproduces it exactly.
   ========================================================================= */

import { hashText } from './egg.js';

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
export function nextShipMonday(todayIso) {
  const thisMonday = mondayOf(todayIso);
  const d = dowOf(todayIso);
  /* Saturday and Sunday are past this week's deadline and before its
     Monday, so they are already working on the week after next. */
  return shift(thisMonday, d === 0 || d === 6 ? 14 : 7);
}

/** 申請締切 — the Friday before the shipping Monday, at the configured hour. */
export function requestDeadline(shipMonday, cfg) {
  const h = Number(cfg?.egg?.deadlineHour);
  return {
    date: shift(shipMonday, -3),
    hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : 17,
  };
}

/**
 * May requests for this shipping week still be made or changed?
 *
 * 「申請の変更・取り消しは締切まで可能」. The hour matters on the day itself
 * and nowhere else, so it is only consulted then.
 */
export function requestsOpen(shipMonday, nowIso, nowHour, cfg) {
  const { date, hour } = requestDeadline(shipMonday, cfg);
  if (nowIso < date) return true;
  if (nowIso > date) return false;
  return Number(nowHour) < hour;
}

/**
 * 受け取り期限 — the Friday of the shipping week, or the Thursday when that
 * Friday is a holiday. `holidays` is the map the rest of the app already
 * carries, keyed by YYYY-MM-DD.
 */
export function pickupDeadline(shipMonday, holidays = {}) {
  const friday = shift(shipMonday, 4);
  return holidays[friday] ? shift(shipMonday, 3) : friday;
}

/** Everything about one shipping week, for a screen to print. */
export function weekInfo(shipMonday, cfg, holidays) {
  return {
    ship: shipMonday,
    deadline: requestDeadline(shipMonday, cfg),
    pickup: pickupDeadline(shipMonday, holidays),
  };
}

/* ------------------------------ the draw -------------------------------- */

/* A lottery nobody can check is not a lottery, it is an assurance. Seeding
   it on the shipping week means the same week always draws the same way:
   re-run it in a month and it comes out as it did, which is what lets
   somebody ask why they missed out and be shown. */
function rng(seed) {
  let a = parseInt(hashText(seed), 36) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(list, seed) {
  const out = [...list];
  const rand = rng(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* Ties are broken by request id, never by the order rows came back from the
   database — two runs must not differ because a query planner changed. */
const byTime = (a, b) => String(a.at).localeCompare(String(b.at))
  || String(a.id).localeCompare(String(b.id));

/**
 * Hand out `packs` between `requests` under one of the four rules.
 *
 * Each request is {id, employeeId, want, at}; the result is the same list
 * with `got` on it, so a caller can write the outcome back without having
 * to match anything up again. Nobody is given more than they asked for, the
 * total handed out never exceeds what was harvested, and a request that
 * gets nothing is still in the result with got:0 — 落選 is an answer and
 * somebody has to be told it.
 *
 *   fcfs         申請が早い順に確定
 *   onEach       まず全員に1パック、余りを2パック目以降へ
 *   lottery      締切後にランダムで確定（週でシード、再現できる）
 *   missedFirst  前週に落選した人を優先
 */
export function allocate({ requests = [], packs = 0, rule = 'fcfs', missedLastWeek = [], seed = '' }) {
  const rows = requests
    .map((r) => ({ ...r, want: Math.max(0, Math.floor(Number(r.want) || 0)), got: 0 }))
    .filter((r) => r.want > 0);

  let left = Math.max(0, Math.floor(Number(packs) || 0));
  if (!rows.length || left <= 0) return rows;

  if (rule === 'onEach') {
    /* Round by round: one pack to everybody who still wants one, then round
       again. 公平感が高い, and the cost 佐野 noted is real — somebody asking
       for three for a customer waits through two rounds to get them. */
    const order = [...rows].sort(byTime);
    let gave = true;
    while (left > 0 && gave) {
      gave = false;
      for (const r of order) {
        if (left <= 0) break;
        if (r.got < r.want) { r.got += 1; left -= 1; gave = true; }
      }
    }
    return rows;
  }

  let order;
  if (rule === 'lottery') {
    order = shuffled([...rows].sort(byTime), seed);
  } else if (rule === 'missedFirst') {
    const missed = new Set((missedLastWeek || []).map(String));
    const first = rows.filter((r) => missed.has(String(r.employeeId))).sort(byTime);
    const rest = rows.filter((r) => !missed.has(String(r.employeeId))).sort(byTime);
    order = [...first, ...rest];
  } else {
    order = [...rows].sort(byTime);
  }

  /* Filled in order, and the person the eggs run out on takes what is left
     rather than nothing — a half-filled request is closer to what they
     asked for than a refusal, and it wastes no packs. */
  for (const r of order) {
    if (left <= 0) break;
    const give = Math.min(r.want, left);
    r.got = give;
    left -= give;
  }
  return rows;
}

/** Who asked and got nothing — next week's 前回落選者, by employee. */
export function missedFrom(allocated) {
  return [...new Set((allocated || []).filter((r) => r.got === 0).map((r) => String(r.employeeId)))];
}

/** What a request's status reads as once a draw has run. */
export function statusOf(row) {
  if (row?.pickedUpAt) return 'picked';
  if (row?.got > 0) return 'confirmed';
  if (row?.drawnAt) return 'missed';
  return 'received';
}
