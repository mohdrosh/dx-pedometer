/* ============================================================================
   届 — which notices a month needs.

   The timesheet already knows which days need one: its 届 column says 要
   when a day carries a 勤怠状況 or a deduction. So a notice is not something
   anyone fills in twice — it is derived from the month that is already
   entered, and the only thing a person has to add is the reason.

   The form covers a period, not a day. A week of 有給休暇 is one 届 from the
   14th to the 25th, which is exactly how the filled example reads, so
   consecutive days of the same kind are grouped into one notice.

   This half is plain arithmetic over the month and runs in the browser too,
   so the screen can list the notices before anyone asks for a file. The
   filling of the form itself lives in todoke.js, which needs exceljs and the
   template on disk and so only ever runs on the server.
   ========================================================================= */

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
export { DOW_JA };

/* 種別 — the eight boxes, and which 勤怠状況 ticks each. 直行 and 直帰 are
   absent on purpose: a day out of the office start to finish needs no
   notice, which is what the form's own 直行・直帰 check says. */
export const KIND = {
  欠勤: { cell: 'F18', from: ['欠勤'] },
  振替休日: { cell: 'K18', from: ['振替休日'] },
  休日出勤: { cell: 'Q18', from: ['休日出勤'] },
  その他: { cell: 'W18', from: ['振替予定休日出勤'] },
  遅刻: { cell: 'F20', from: ['遅刻', '遅刻（電車遅延）'] },
  早退: { cell: 'K20', from: ['早退'] },
  有給休暇: { cell: 'Q20', from: ['有給休暇'] },
  '特別休暇（慶弔）': { cell: 'W20', from: ['特別休暇'] },
};

const kindFor = (status) => Object.keys(KIND).find((k) => KIND[k].from.includes(status)) || null;

/**
 * Which notices a month needs, as runs of consecutive days.
 *
 * @param {array} rows  the month, as computeMonth returns it
 * @returns [{ kind, status, from, to, days, partial }]
 *   `partial` marks 遅刻 and 早退, where the notice covers part of a day
 *   rather than the whole of it and the times matter.
 */
export function noticesFor(rows) {
  const out = [];
  let run = null;

  const close = () => { if (run) out.push(run); run = null; };

  rows.forEach((r) => {
    /* 早退 rides in the second dropdown and is its own notice, separate from
       whatever the first one says. */
    const statuses = [r.status1, r.status2].filter(Boolean);
    const kinds = statuses.map((s) => ({ s, k: kindFor(s) })).filter((x) => x.k);

    if (!kinds.length) { close(); return; }

    /* A day with two notices on it cannot continue a run — write each out. */
    if (kinds.length > 1) {
      close();
      kinds.forEach(({ s, k }) => out.push(makeRun(r, s, k)));
      return;
    }

    const { s, k } = kinds[0];
    if (run && run.kind === k && isNextDay(run.to.iso, r.iso)) {
      run.to = r; run.days += 1;
      return;
    }
    close();
    run = makeRun(r, s, k);
  });
  close();
  return out;
}

const makeRun = (r, status, kind) => ({
  kind, status, from: r, to: r, days: 1,
  partial: kind === '遅刻' || kind === '早退',
});

const isNextDay = (a, b) => {
  const d = new Date(`${a}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10) === b;
};

/** 届_有給休暇_20260914_2407036.xlsx */
export const todokeFilename = (notice, id) =>
  `届_${notice.kind}_${notice.from.iso.replace(/-/g, '')}_${id}.xlsx`;
