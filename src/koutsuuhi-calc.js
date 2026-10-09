/* ============================================================================
   交通費精算書 — what the form adds up, and how many forms it takes.

   The sheet splits every journey two ways and the distinction is the whole
   point of the form, so it is worth saying plainly. The note the form itself
   carries on 通勤経路 reads:

     通勤交通費：通勤にかかる実費相当額
     立替交通費：業務上で必要な移動にかかる経費

   — the first is getting to work, the second is travelling for work and
   being paid back. One ○ in the 通勤経路 column is what separates them, and
   the form's two SUMIFs key off exactly that.

   Plain arithmetic, so the screen and the server both use it.
   ========================================================================= */

/** The form has 25 ruled lines (rows 16–40). A month of round trips does not
    fit on one, which is why the office has always taken a second sheet. */
export const ROWS_PER_SHEET = 25;
export const MAX_SHEETS = 4;
export const MAX_ROWS = ROWS_PER_SHEET * MAX_SHEETS;

export const travelKey = (pk, id) => `tr:${pk}:${id}`;

const yen = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** A row is worth writing out once it names where it went. */
export const filled = (r) => !!(r && (r.from || r.to || yen(r.fare)));

/** How many copies of the form this many journeys need. */
export const sheetCount = (rows = []) =>
  Math.max(1, Math.ceil(rows.filter(filled).length / ROWS_PER_SHEET));

/** The journeys that go on sheet `page` (0-based). */
export const sheetRows = (rows = [], page = 0) =>
  rows.filter(filled).slice(page * ROWS_PER_SHEET, (page + 1) * ROWS_PER_SHEET);

/**
 * @param {array} rows  [{ date, from, fromH, fromM, to, toH, toM, line,
 *                         commute, fare }]
 * @returns { commute, advance, total } in yen — AF41, AF42, AF43
 */
export function totals(rows = []) {
  let commute = 0; let advance = 0;
  rows.filter(filled).forEach((r) => {
    if (r.commute) commute += yen(r.fare); else advance += yen(r.fare);
  });
  return { commute, advance, total: commute + advance };
}

/** Journeys whose fare nobody checked — the ones a lookup-only policy
    refuses. A row with no fare at all is simply unfinished, not unchecked,
    and is caught by the ordinary "nothing entered" rule instead. */
export const unverified = (rows = []) =>
  rows.filter(filled).filter((r) => yen(r.fare) > 0 && r.fareSource !== 'lookup');

/** ¥1,280 */
export const yenFmt = (n) => `¥${Number(n || 0).toLocaleString('ja-JP')}`;

/* ------------------------- the commute, once ----------------------------- */

/** Enough of a 通勤経路 to generate a journey from. */
export const routeReady = (r) => !!(r && r.from && r.to);

/** The outward leg, then the return — the pair almost every working day is. */
export function roundTrip(route, date) {
  if (!routeReady(route)) return [];
  const leg = (from, to) => ({
    date, from, to, line: route.line || '', commute: true,
    fare: yen(route.fare) || null,
    /* A commute generated from a looked-up route is itself looked up; one
       generated from a fare somebody typed is not, and the claim should
       keep saying so rather than launder it into something checked. */
    fareSource: route.fareSource === 'lookup' ? 'lookup' : 'manual',
  });
  return [leg(route.from, route.to), leg(route.to, route.from)];
}

/** A journey already on the sheet for this day, either way round. */
export const hasRoute = (rows, route, date) => rows.some(
  (r) => r.date === date
    && ((r.from === route.from && r.to === route.to)
      || (r.from === route.to && r.to === route.from)),
);

/**
 * The days of a period someone was actually at work, read out of the
 * timesheet they have already filled in. A day with times on it is a day
 * they travelled; a day of 有給休暇 or 欠勤 is not, and the timesheet
 * already says which is which — so the commute never has to be re-answered.
 */
export const AWAY = ['有給休暇', '欠勤', '振替休日', '特別休暇'];

export function workedDays(kt, isoList) {
  const days = kt?.days || {};
  return isoList.filter((iso) => {
    const d = days[iso];
    if (!d) return false;
    if (AWAY.includes(d.status1)) return false;
    return d.inH != null || d.status1 === '休日出勤' || d.status1 === '振替予定休日出勤';
  });
}

/** Routes used before, offered back rather than retyped. Most recent first. */
export function frequentRoutes(...lists) {
  const seen = new Map();
  lists.flat().filter(filled).forEach((r) => {
    if (!r.from || !r.to) return;
    const k = `${r.from}|${r.to}|${r.line || ''}|${yen(r.fare)}`;
    seen.set(k, { from: r.from, to: r.to, line: r.line || '', fare: yen(r.fare) || null, commute: !!r.commute });
  });
  return [...seen.values()].reverse().slice(0, 8);
}
