/* ============================================================================
   交通費精算書 — what the form adds up.

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

/** The form has 25 ruled lines (rows 16–40) and no more. */
export const MAX_ROWS = 25;

export const travelKey = (pk, id) => `tr:${pk}:${id}`;

const yen = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** A row is worth writing out once it names where it went. */
export const filled = (r) => !!(r && (r.from || r.to || yen(r.fare)));

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

/** ¥1,280 */
export const yenFmt = (n) => `¥${Number(n || 0).toLocaleString('ja-JP')}`;
