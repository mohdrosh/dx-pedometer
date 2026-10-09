/* ============================================================================
   運賃表 — the company's own table of approved fares.

   A commute is one route and one price, the same every day until the
   operator changes its fares. So the honest place for that number is not a
   lookup repeated forty times a month — it is a table 総務 approves once,
   which is exactly what the paper 通勤費申請 has always been. Entered here,
   it costs nothing, works with no network, and the figure on a claim is one
   the company itself signed off rather than one the claimant remembered.

   What it cannot do is anticipate a journey nobody planned: a business trip
   to a client's site is a route that was never in the table. That is what
   the route planner in fare.js is for, and the two sit side by side — the
   table first, because it is free and it is approved.

   Stored under the key `fares`, readable by everyone and writable only by
   the committee.
   ========================================================================= */

/* Station names arrive with 全角 spaces, a trailing 駅, and the usual ヶ/ケ
   and ノ/の confusions. Two people typing the same station should match. */
export const normStation = (s) => String(s ?? '')
  .normalize('NFKC')
  .replace(/\s+/g, '')
  .replace(/駅$/, '')
  .replace(/[ヶヵケカ]/g, 'ケ')
  .replace(/[ノの之]/g, 'ノ')
  .toLowerCase();

const yen = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** One row of the table, cleaned up. Returns null if it is not a fare. */
export function cleanRow(r) {
  const from = String(r?.from ?? '').trim();
  const to = String(r?.to ?? '').trim();
  const fare = yen(r?.fare);
  if (!from || !to || fare == null) return null;
  return {
    from, to, fare,
    line: String(r?.line ?? '').trim(),
    note: String(r?.note ?? '').trim().slice(0, 40),
  };
}

/**
 * Every approved fare for a pair of stations, either direction.
 *
 * Both directions, because a table saying 姫路→三ノ宮 ¥960 is also saying
 * what the journey home costs; making 総務 type each commute twice would
 * invite the two halves to disagree.
 *
 * More than one is normal and is the point: JR and 地下鉄 between the same
 * two stations are different journeys at different prices, so both are
 * offered and the person says which they took.
 */
export function matches(table, from, to) {
  const a = normStation(from);
  const b = normStation(to);
  if (!a || !b) return [];
  return (table || [])
    .map(cleanRow).filter(Boolean)
    .filter((r) => {
      const ra = normStation(r.from); const rb = normStation(r.to);
      return (ra === a && rb === b) || (ra === b && rb === a);
    })
    /* As travelled, not as filed: a row stored 姫路→三ノ宮 answering a
       三ノ宮→姫路 journey comes back the way round it was asked. */
      .map((r) => (normStation(r.from) === a ? r : { ...r, from: r.to, to: r.from }))
    .sort((x, y) => x.fare - y.fare);
}

/**
 * A pasted table. One route per line; 総務 will have it in Excel, and
 * copying a block of cells out of Excel gives tab-separated text.
 *
 *   姫路  三ノ宮  JR神戸線  960
 *   新長田,三ノ宮,神戸市営地下鉄,240,定期代が出るまで
 *
 * A header line is skipped if it looks like one. Lines that are not a fare
 * are reported rather than dropped, so nobody discovers later that three of
 * their hundred rows never arrived.
 */
export function parsePaste(text) {
  const rows = []; const bad = [];
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cell = line.split(/\t|,|、|\s{2,}/).map((c) => c.trim()).filter((c) => c !== '');
    if (cell.length < 3) { bad.push({ line: i + 1, text: line }); return; }

    /* 運賃 is the one that is a number; everything before it is where and
       how, which means a table with or without a 路線 column both read. */
    const fareAt = cell.findIndex((c, j) => j >= 2 && yen(c) != null && /^[¥￥\d,，]+円?$/.test(c));
    if (fareAt < 0) {
      /* A header: 発駅 着駅 路線 運賃 — no number anywhere. */
      if (i === 0 && !cell.some((c) => yen(c) != null)) return;
      bad.push({ line: i + 1, text: line });
      return;
    }
    const got = cleanRow({
      from: cell[0], to: cell[1],
      line: fareAt > 2 ? cell.slice(2, fareAt).join(' ') : '',
      fare: cell[fareAt], note: cell.slice(fareAt + 1).join(' '),
    });
    if (got) rows.push(got); else bad.push({ line: i + 1, text: line });
  });
  return { rows, bad };
}

/** Same pair and same line is the same route — replace rather than stack. */
export function mergeRows(table, incoming) {
  const key = (r) => `${normStation(r.from)}|${normStation(r.to)}|${r.line}`;
  const flip = (r) => `${normStation(r.to)}|${normStation(r.from)}|${r.line}`;
  const out = (table || []).map(cleanRow).filter(Boolean);
  let added = 0; let updated = 0;
  incoming.forEach((r) => {
    const at = out.findIndex((x) => key(x) === key(r) || key(x) === flip(r));
    if (at < 0) { out.push(r); added += 1; } else { out[at] = r; updated += 1; }
  });
  return { table: out, added, updated };
}
