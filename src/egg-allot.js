/* ============================================================================
   モラエッグ 配分 — the company's rules, 2026/11/03.

   This replaces the four rules the survey was going to choose between
   (先着順 / 1人1パック優先 / 抽選 / 前回落選者優先). The company decided
   instead, and what they decided is not one of the four: it is a sequence.

     5  成立判定   an office gets a delivery once its requests reach its
                  own minimum — 本社 1, 姫路・京都 2, the rest 4
     6  仕事用     a business request ships from one pack, at any office
     7  配分順     business first and in full, then one personal pack each
                  in priority-point order, then second packs
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

import { hashText, EGG_OFFICES, HQ_OFFICE, TOKYO_OFFICE } from './egg.js';

/* One list, defined in egg.js. Head Office is matched by name when the
   leftovers are added to it, so a second copy that drifted by one
   character would quietly lose every spare egg. */
export const HQ = HQ_OFFICE;
export const TOKYO = TOKYO_OFFICE;
export const OFFICES = EGG_OFFICES;

/* The fallback for an office with no minimum of its own. Every one of
   the seven has one (仕様書 4.10), so this is only ever reached by a
   caller that passes none — the tests, and an office created after this
   list was written. */
export const MIN_PACKS = 4;

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
  guarantees = {}, seed = '', offices = OFFICES, officeMin = {},
} = {}) {
  const laid = Math.max(0, Math.floor(Number(harvest) || 0));
  const min = Math.max(1, Math.floor(Number(minPacks) || MIN_PACKS));
  /* An office may carry a minimum of its own —「0なら毎週発送」— which is
     how 本社 ships whatever it has. Only a number actually stored counts. */
  const minFor = (name) => {
    const own = officeMin?.[name];
    return own === null || own === undefined || own === '' ? min : Math.max(0, Math.floor(Number(own) || 0));
  };
  /* 次回保証（2026/11/25）。事業所が最低パック数に届かなかったために見送り
     になった人に付き、次にリクエストしたとき、事業所の最低パック数に関係
     なくその人に1パックを送る。持っているかどうかだけを見る印である。 */
  const held = (r) => guarantees?.[String(r.employeeId)] === true;

  const base = requests
    .map((r) => ({
      ...r,
      want: Math.max(0, Math.floor(Number(r.packs) || 0)),
      work: r.purpose === 'work',
      office: String(r.office || ''),
    }))
    .filter((r) => r.want > 0);

  /* 1パックずつ回す。「1人にまとめて配らない」（手順3-5）。一周して誰にも
     渡らなくなったら終わり——欲しい数に達した人しか残っていないということ
     なので、それ以上回しても同じ周を繰り返すだけである。 */
  const roundRobin = (list, from) => {
    let n = from;
    for (let spin = true; n > 0 && spin;) {
      spin = false;
      for (const r of list) {
        if (n <= 0) break;
        if (r.want > r.got) { r.got += 1; n -= 1; spin = true; }
      }
    }
    return n;
  };

  /* 仕事用だけで足りないときの順番。優先ポイントは私用のものなので、
     ここは同点のひと組として混ぜる（「同じ条件は抽選」手順3-1）。 */
  const inWorkOrder = (rows) => {
    const g = [...rows].sort(byId);
    const rand = rng(`${seed}:work`);
    for (let i = g.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
    return g;
  };

  /* 手順1〜3 のひと回し。手順4 がもう一つ事業所を見送りにして、やり直しを
     求めることがある——継ぎ足しではなく、まっさらからもう一度組み直せる
     ように、丸ごと関数にしてある。`forced` は既に見送りと決まった事業所。 */
  const round = (forced) => {
    const rows = base.map((r) => ({ ...r, got: 0, at: r.office, moved: false }));

    const tally = (list) => ({
      packs: list.reduce((a, r) => a + r.want, 0),
      work: list.reduce((a, r) => a + (r.work ? r.want : 0), 0),
      held: list.filter((r) => !r.work && held(r)).length,
    });

    const asked = new Map();
    for (const name of offices) asked.set(name, tally([]));
    for (const name of new Set(rows.map((r) => r.office))) {
      asked.set(name, tally(rows.filter((r) => r.office === name)));
    }

    /* ---- 手順1 事業所の対象判定 ---------------------------------------- */
    const decide = (name, o) => {
      if (forced.has(name)) return 'skip';
      if (o.packs === 0) return 'none';
      if (o.packs >= minFor(name)) return 'go';
      /* 最低パック数に届かなくても送れるのは、「仕事用」と「次回保証」が
         ある場合だけです（前提, 2026/11/25）。 */
      if (o.work > 0) return 'work';
      if (o.held > 0) return 'kept';
      return 'skip';
    };
    const state = new Map();
    for (const [name, o] of asked) state.set(name, decide(name, o));
    const ships = (name) => ['go', 'work', 'kept'].includes(state.get(name));

    /* 対象にならなかった事業所の人。「本社で受け取ります」にチェックした人
       は本社のリクエストとして扱い、していない人は今回は見送り。 */
    const skipped = new Set();
    for (const r of rows) {
      if (ships(r.office)) continue;
      if (r.hqOk && r.office !== HQ) { r.at = HQ; r.moved = true; } else skipped.add(r.id);
    }

    /* 本社は、移ってきた人を数に入れてからもう一度判定する——移った人は
       「本社のリクエストとして扱う」のだから、本社の合計に入る。 */
    const atHq = () => rows.filter((r) => r.at === HQ && !skipped.has(r.id));
    if (!forced.has(HQ) && atHq().length) state.set(HQ, decide(HQ, tally(atHq())));
    /* 本社が成立しなければ、移ってきた人もそこで見送りになる。 */
    if (!ships(HQ)) {
      for (const r of rows) {
        if (r.moved) { skipped.add(r.id); r.at = r.office; r.moved = false; }
      }
    }

    const live = rows.filter((r) => !skipped.has(r.id) && ships(r.at));
    let left = laid;

    /* ---- 手順3-1 仕事用:全員に申請どおり ------------------------------- */
    const work = inWorkOrder(live.filter((r) => r.work));
    const wantWork = work.reduce((a, r) => a + r.want, 0);
    if (wantWork <= left) {
      for (const r of work) { r.got = r.want; left -= r.want; }
    } else {
      /* 仕事用だけで足りないときは、まず1件1パックずつ。 */
      for (const r of work) { if (left <= 0) break; r.got = 1; left -= 1; }
      left = roundRobin(work, left);
    }

    const personal = inPointOrder(live.filter((r) => !r.work), points, seed);

    /* ---- 手順3-2 次回保証のある人:1人1パックずつ ----------------------- */
    for (const r of personal) {
      if (left <= 0) break;
      if (r.got > 0 || !held(r)) continue;
      r.got = 1; left -= 1;
    }

    /* ---- 手順3-3 私用の1パック目:1人1パックずつ ------------------------ */
    for (const r of personal) {
      if (left <= 0) break;
      if (r.got > 0) continue;
      r.got = 1; left -= 1;
    }

    /* ---- 手順3-4 最低パック数の穴埋め ---------------------------------- */
    /* 「割り当てが最低パック数に届いていない事業所のうち、残りのパックで
       最低パック数に届く事業所には、その事業所の人に2パック目以降を配って
       最低パック数まで埋めます。足りないパック数が少ない事業所から順に」。 */
    const packsAt = (name) => rows.reduce((a, r) => a + (r.at === name ? r.got : 0), 0);
    const shortfalls = [...state.keys()]
      .filter((nm) => ships(nm))
      .map((nm) => ({ nm, need: minFor(nm) - packsAt(nm) }))
      .filter((x) => x.need > 0)
      .sort((a, b) => a.need - b.need || String(a.nm).localeCompare(String(b.nm)));
    for (const { nm, need } of shortfalls) {
      if (left <= 0) break;
      if (need > left) continue;                 /* 残りでは届かない */
      const there = personal.filter((r) => r.at === nm && r.want > r.got);
      const room = there.reduce((a, r) => a + (r.want - r.got), 0);
      /* 届かせられないなら一つも渡さない。半端に配っても手順4で見送りに
         なるだけで、そのぶんのパックが宙に浮く。 */
      if (room < need) continue;
      let give = need;
      for (const r of there) {
        while (give > 0 && r.want > r.got) { r.got += 1; give -= 1; left -= 1; }
        if (give <= 0) break;
      }
    }

    /* ---- 手順3-5 私用の2パック目以降:1パックずつ、同じ順番で ----------- */
    left = roundRobin(personal, left);

    /* ---- 手順5 余りは本社へ -------------------------------------------- */
    /* 本社は余りの行き先なので、その箱はどのみち本社へ向かう。自分の
       リクエストを断りながら同じ部屋へ余りを積むのは、最低パック数が
       言いたいことではない——車を2パックのために出さないための数である。 */
    if (left > 0 && !ships(HQ)) {
      const home = inPointOrder(rows.filter((r) => r.office === HQ), points, seed);
      let served = 0;
      for (const r of home) {
        if (left <= 0) break;
        const give = Math.min(r.want, left);
        if (give > 0) { r.got = give; left -= give; served += give; skipped.delete(r.id); }
      }
      if (served > 0) state.set(HQ, 'go');
    }

    return { rows, state, asked, skipped, left };
  };

  /* ---- 手順4 最低パック数の再確認 -------------------------------------- */
  /* 「配分の結果、最低パック数を下回った事業所は、今回は見送りにします。
     複数ある場合は、割り当てが最も少ない事業所から1つずつ見送り、そのたびに
     手順3からやり直します」。ただし仕事用か次回保証のある事業所は見送りに
     しない（変更, 2026/11/25）。 */
  const forced = new Set();
  let out = round(forced);
  for (let guard = 0; guard <= offices.length + 2; guard += 1) {
    const packsAt = (name) => out.rows.reduce((a, r) => a + (r.at === name ? r.got : 0), 0);
    const spared = (name) => out.rows.some(
      (r) => r.at === name && !out.skipped.has(r.id) && (r.work || held(r)),
    );
    const bad = [...out.state.keys()]
      .filter((nm) => ['go', 'work', 'kept'].includes(out.state.get(nm)))
      .filter((nm) => !forced.has(nm) && !spared(nm))
      .map((nm) => ({ nm, packs: packsAt(nm) }))
      .filter((x) => x.packs < minFor(x.nm))
      .sort((a, b) => a.packs - b.packs || String(a.nm).localeCompare(String(b.nm)));
    if (!bad.length) break;
    forced.add(bad[0].nm);
    out = round(forced);
  }

  const { rows, state, asked, skipped } = out;
  const extra = Math.max(0, out.left);

  /* ---- 手順6 優先ポイントと次回保証の更新（私用のみ） ------------------ */
  const nextPoints = { ...points };
  const nextGuarantees = { ...guarantees };
  for (const r of rows) {
    if (r.work) continue;                        /* 仕事用は対象外 */
    const id = String(r.employeeId);
    const now = Math.max(0, Number(nextPoints[id]) || 0);
    if (r.got > 0) {
      /* 0 は行として持たない。「入っていない＝0」は同じことを短く言う。 */
      delete nextPoints[id];
      /* 「次回保証で受け取ったら、次回保証は外します」。 */
      delete nextGuarantees[id];
      continue;
    }
    nextPoints[id] = now + 1;
    /* 事業所が最低パック数に届かなかったために見送りになった人には次回保証。
       卵が足りなかっただけの人（事業所は発送された）には付けない——
       既に持っている人のものは、使えていないのだから残る。 */
    if (skipped.has(r.id)) nextGuarantees[id] = true;
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
      /* 手順4 はシステムが自動でやるようになった（2026/11/25）ので、この印は
         もう「人が調整してください」ではない。

         最低パック数を下回ったまま残る事業所は、ふつう仕事用か次回保証が
         あるために残した事業所であり、それは規則どおりの結果である——毎週
         赤く出しては、本当に見てほしい週に誰も読まなくなる。だから 'go' の
         ままで下回っている場合だけを印にする:手順4 が解消しきれなかった
         ということなので、そのときは人が見るに値する。 */
      underMin: state.get(name) === 'go'
        && requested > 0 && requested < minFor(name),
    };
  }).filter((l) => l.asked > 0 || l.packs > 0);

  const shipped = lines.reduce((a, l) => a + l.packs, 0);
  return {
    rows, lines, extra, shipped, harvest: laid, minPacks: min,
    points: nextPoints,
    guarantees: nextGuarantees,
    /* 自動で見送りにした事業所。画面と手紙が「なぜ」を言えるように。 */
    droppedOffices: [...forced],
    needsAdmin: lines.some((l) => l.underMin),
  };
}
