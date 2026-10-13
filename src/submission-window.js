/* ============================================================================
   提出期間 — which month may be submitted, and when.

   健康対策委員会 asked whether 提出期間の制限 restricts submission to the
   target month. It does, and this is the rule that says so:

     a period runs 21日 → 20日 and is named after the month it ends in;
     its window opens on the 21st, the day after it closes, and runs to the
     1st of the month after that.

   So 2026年10月度 covers 9/21–10/20 and may be submitted between 10/21 and
   11/1. Exactly one month is open at any time, and the months either side
   of it are shut — which is what 対象月のみ提出可能 means.

   Dates are plain YYYY-MM-DD strings rather than Date objects, because the
   rule is about the calendar day in Japan, not about an instant: the screen
   reads the browser's clock and the server reads Tokyo's, and a Date would
   let those two disagree about which day it is. Strings in this format also
   compare correctly with < and >.

   Both the screen and the server use this. The screen disables the button;
   the server refuses the write. The screen is not a guard.
   ========================================================================= */

const pad2 = (n) => String(n).padStart(2, '0');

/** The first and last day a period may be submitted, inclusive. */
export function submissionWindow(y, m) {
  return {
    from: `${y}-${pad2(m)}-21`,
    to: m === 12 ? `${y + 1}-01-01` : `${y}-${pad2(m + 1)}-01`,
  };
}

/**
 * Is `todayIso` inside the window for 年y 月m度?
 * @param {number} y    the year the period is named after
 * @param {number} m    the month the period is named after, 1-12
 * @param {string} todayIso  today, as YYYY-MM-DD
 */
export function inSubmissionWindow(y, m, todayIso) {
  const { from, to } = submissionWindow(y, m);
  return todayIso >= from && todayIso <= to;
}
