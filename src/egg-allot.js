/* ============================================================================
   モラエッグ 配分 — the company's rules, 2026/11/03.

   This replaces the four rules the survey was going to choose between
   (先着順 / 1人1パック優先 / 抽選 / 前回落選者優先). The company decided
   instead, and what they decided is not one of the four: it is a sequence.

     5  成立判定   an office gets a delivery once its requests reach the
                  minimum — 3 packs, provisional, possibly 5
     6  東京の特例   Tokyo is reachable only by courier, so a business
                  request sends a box even below the minimum
     7  配分順     business first and in full, then one personal pack each
                  in priority-point order, then second packs in the same
                  order
     8  余り      leftovers go to Head Office as 「ご自由にどうぞ」, so the
                  total shipped always equals what Tamba laid
     9  優先ポイント  carried by the person, not the office

   Two things are worth saying about the shape of it.

   The order in 7 is global, not per office. 「成立した事業所の申請合計が取れ
   高を超えた場合」 — the comparison is against every confirmed office at
   once, so a 仕事用 request in 姫路 outranks a 私用 first pack in 大阪.

   And a draw only ever happens inside one point value. People are sorted
   by points, and the shuffle is applied within each group — so a draw can
   never move somebody ahead of a person who has waited longer. The seed
   makes it reproducible: 「抽選の対象になったことは個別に知らせない」 means
   nobody is told, which makes being able to re-run a week and get the same
   answer the only way the committee can ever check one.
   ========================================================================= */

import { hashText } from './egg.js';

export const HQ = '本社（神戸）';
export const TOKYO = '東京';

/** The eight, in the order 佐野's dictionary lists them. */
export const OFFICES = [
  HQ, TOKYO, '大阪', '三田', '姫路', '京都', '新長田', '尼崎技術研修所',
];

export const MIN_PACKS = 3;     /* 暫定。会社に確認中 — 3 か 5 */

/* Same generator as the shipping-week draw: seeded, so a week replays. */
function rng(seed) {
  let a = parseInt(hashText(String(seed)), 36) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Ties broken by request id, never by the order rows came out of the
   database — two runs must not differ because a query planner changed. */
const byId = (a, b) => String(a.id).localeCompare(String(b.id));

/**
 * Sort people fairly: most points first, and a seeded shuffle only ever
 * among people on the same number of points.
 */
function inPointOrder(rows, points, seed) {
  const groups = new Map();
  for (const r of rows) {
    const p = Math.max(0, Number(points?.[String(r.employeeId)]) || 0);
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(r);
  }
  const out = [];
  for (const p of [...groups.keys()].sort((a, b) => b - a)) {
    const g = [...groups.get(p)].sort(byId);
    const rand = rng(`${seed}:${p}`);
    for (let i = g.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
    out.push(...g);
  }
  return out;
}

/**
 * Work out a week.
 *
 * requests: {id, employeeId, office, packs, purpose:'private'|'work', hqOk}
 * points:   {employeeId: n} as they stand BEFORE this week
 *
 * Returns the rows with `got` and the office each person actually collects
 * from, a line per office for the result table, and the points as they
 * stand after.
 */
export function allot({
  requests = [], harvest = 0, minPacks = MIN_PACKS, points = {},
  tokyoRule = true, seed = '', offices = OFFICES,
} = {}) {
  const rows = requests
    .map((r) => ({
      ...r,
      want: Math.max(0, Math.floor(Number(r.packs) || 0)),
      work: r.purpose === 'work',
      office: String(r.office || ''),
      got: 0,
      /* Where they will actually collect. Changes only for somebody moved
         to Head Office when their own office falls short. */
      at: String(r.office || ''),
      moved: false,
    }))
    .filter((r) => r.want > 0);

  const laid = Math.max(0, Math.floor(Number(harvest) || 0));
  const min = Math.max(1, Math.floor(Number(minPacks) || MIN_PACKS));

  /* ---- 5 & 6: which offices get a delivery at all ---------------------- */
  const asked = new Map();
  for (const name of offices) asked.set(name, { packs: 0, work: 0, rows: [] });
  for (const r of rows) {
    if (!asked.has(r.office)) asked.set(r.office, { packs: 0, work: 0, rows: [] });
    const o = asked.get(r.office);
    o.packs += r.want;
    if (r.work) o.work += r.want;
    o.rows.push(r);
  }

  const state = new Map();
  for (const [name, o] of asked) {
    if (o.packs === 0) { state.set(name, 'none'); continue; }
    if (o.packs >= min) { state.set(name, 'go'); continue; }
    if (name === TOKYO) {
      /* 「仕事用の申請があれば3パック未満でも送る」, and Tokyo's personal
         requests ride along in the same box. */
      state.set(name, tokyoRule && o.work > 0 ? 'tokyo' : 'skip');
      continue;
    }
    /* 「仕事用の申請がある事業所が3パック未満の場合は、見送りにせず、管理者
       が個別に調整する」 — not skipped, not automatic either. Flagged for a
       person to decide, and treated as running until they do. */
    state.set(name, o.work > 0 ? 'adjust' : 'skip');
  }

  const ships = (name) => ['go', 'tokyo', 'adjust'].includes(state.get(name));

  /* ---- people at an office that fell short ----------------------------- */
  const missedBySkip = new Set();
  for (const r of rows) {
    if (ships(r.office)) continue;
    if (r.hqOk && r.office !== HQ) {
      /* 「本社受け取りにチェックした人：本社で受け取る分に回す」 */
      r.at = HQ; r.moved = true;
    } else {
      missedBySkip.add(r.id);
    }
  }

  /* Everyone still in the running: at an office that ships, or moved. */
  const live = rows.filter((r) => !missedBySkip.has(r.id));

  /* ---- 7: business first, in full -------------------------------------- */
  let left = laid;
  for (const r of live.filter((x) => x.work).sort(byId)) {
    const give = Math.min(r.want, left);
    r.got = give; left -= give;
  }

  /* ---- 7.2: one personal pack each, in priority order ------------------ */
  const personal = inPointOrder(live.filter((r) => !r.work), points, seed);
  for (const r of personal) {
    if (left <= 0) break;
    r.got = 1; left -= 1;
  }
  /* ---- 7.3: second packs onward, same order ---------------------------- */
  for (const r of personal) {
    if (left <= 0) break;
    const more = Math.min(r.want - r.got, left);
    if (more > 0) { r.got += more; left -= more; }
  }

  /* ---- 8: whatever is left goes to Head Office ------------------------- */
  const extra = Math.max(0, left);

  /* ---- 9: points ------------------------------------------------------- */
  const next = { ...points };
  for (const r of rows) {
    const id = String(r.employeeId);
    const now = Math.max(0, Number(next[id]) || 0);
    if (r.work) continue;             /* business is never short-changed */
    /* Back to zero is stored as absent rather than as 0. The map would
       otherwise accumulate a row per person per week forever, and "no
       entry means no points" is the same statement in less space. */
    if (r.got > 0) delete next[id];
    else next[id] = now + 1;          /* missed, or their office was skipped */
  }

  /* ---- the result table ------------------------------------------------ */
  const shippedTo = new Map();
  for (const r of rows) {
    if (r.got <= 0) continue;
    shippedTo.set(r.at, (shippedTo.get(r.at) || 0) + r.got);
  }
  const lines = [...asked.keys()].map((name) => {
    const requested = shippedTo.get(name) || 0;
    const plus = name === HQ ? extra : 0;
    return {
      office: name,
      status: state.get(name) || 'none',
      asked: asked.get(name).packs,
      work: asked.get(name).work,
      requested,
      extra: plus,
      packs: requested + plus,
      /* 「配分の結果、成立していた事業所が3パックを下回った場合は、管理者が
         調整する」 — said, not fixed: the rule is a person's call. */
      underMin: state.get(name) === 'go' && requested > 0 && requested < min,
    };
  }).filter((l) => l.asked > 0 || l.packs > 0);

  const shipped = lines.reduce((a, l) => a + l.packs, 0);
  return {
    rows, lines, extra, shipped, harvest: laid, minPacks: min,
    points: next,
    /* Anything a person has to look at before the van leaves. */
    needsAdmin: lines.some((l) => l.status === 'adjust' || l.underMin),
  };
}
