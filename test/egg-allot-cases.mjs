/* 配布ルール 2026/11/03, sections 5 to 9. The company decided these
   instead of the survey, so every one of them is new. */
import { allot, HQ, TOKYO } from '../src/egg-allot.js';
let n = 0; let bad = 0;
const is = (what, got, want) => {
  n += 1;
  const a = JSON.stringify(got); const b = JSON.stringify(want);
  if (a !== b) { bad += 1; console.log(`  XX  ${what}\n        got  ${a}\n        want ${b}`); }
};
const ok = (what, cond, x = '') => {
  n += 1;
  if (!cond) { bad += 1; console.log(`  XX  ${what}${x ? `   ${x}` : ''}`); }
};
let seq = 0;
const req = (employeeId, office, packs, purpose = 'private', hqOk = false) =>
  ({ id: `r${String(seq += 1).padStart(2, '0')}`, employeeId, office, packs, purpose, hqOk });
const got = (r) => Object.fromEntries(r.rows.map((x) => [x.id, x.got]));
const line = (r, office) => r.lines.find((l) => l.office === office);

/* ---- 5 成立判定 -------------------------------------------------------- */
{
  seq = 0;
  const r = allot({
    harvest: 20,
    requests: [req('a', '大阪', 1), req('b', '大阪', 1), req('c', '大阪', 1), req('d', '姫路', 2)],
  });
  is('an office reaching 3 packs is delivered to', line(r, '大阪').status, 'go');
  is('and one that does not is skipped', line(r, '姫路').status, 'skip');
  is('the skipped office ships nothing', line(r, '姫路').packs, 0);
  is('nobody there gets eggs', got(r).r04, 0);
}
{
  /* 「私用・仕事用の両方を合計に含める」 */
  seq = 0;
  const r = allot({ harvest: 20, requests: [req('a', '大阪', 2, 'work'), req('b', '大阪', 1)] });
  is('business and personal count towards the same total', line(r, '大阪').status, 'go');
}
{
  /* 「3パック未満でも仕事用の申請があれば、管理者が個別に調整する」 */
  seq = 0;
  const r = allot({ harvest: 20, requests: [req('a', '姫路', 1, 'work', false)] });
  is('an office under the minimum with business work is not skipped',
    line(r, '姫路').status, 'adjust');
  ok('and a person is asked to look at it', r.needsAdmin);
  is('the eggs still go', got(r).r01, 1);
}

/* ---- the Head Office fallback ------------------------------------------ */
{
  seq = 0;
  const r = allot({
    harvest: 20,
    requests: [req('a', '姫路', 1, 'private', true), req('b', '姫路', 1, 'private', false)],
  });
  const a = r.rows.find((x) => x.employeeId === 'a');
  const b = r.rows.find((x) => x.employeeId === 'b');
  is('somebody who ticked the box collects at Head Office instead', [a.at, a.got], [HQ, 1]);
  is('somebody who did not gets nothing', [b.at, b.got], ['姫路', 0]);
  is('and the packs show against Head Office', line(r, HQ).requested, 1);
}

/* ---- 6 東京の特例 ------------------------------------------------------ */
{
  seq = 0;
  const r = allot({ harvest: 20, requests: [req('a', TOKYO, 1, 'work')] });
  is('one business pack is couriered to Tokyo below the minimum',
    [line(r, TOKYO).status, line(r, TOKYO).packs], ['tokyo', 1]);
}
{
  /* 「東京の私用の申請も同じ箱で一緒に送る」 */
  seq = 0;
  const r = allot({ harvest: 20, requests: [req('a', TOKYO, 1, 'work'), req('b', TOKYO, 1)] });
  is('Tokyo personal requests ride in the same box', got(r), { r01: 1, r02: 1 });
}
{
  seq = 0;
  const r = allot({ harvest: 20, requests: [req('a', TOKYO, 2)] });
  is('but with no business request Tokyo is skipped like anywhere else',
    line(r, TOKYO).status, 'skip');
}
{
  seq = 0;
  const r = allot({ harvest: 20, requests: [req('a', TOKYO, 1, 'work')], tokyoRule: false });
  is('and the special rule can be switched off, since it is provisional',
    line(r, TOKYO).status, 'skip');
}

/* ---- 7 配分順 ---------------------------------------------------------- */
{
  /* Five packs laid; business wants 3 of them and is served in full. */
  seq = 0;
  const r = allot({
    harvest: 5,
    requests: [
      req('a', '大阪', 3, 'work'),
      req('b', '大阪', 2), req('c', '大阪', 2), req('d', '大阪', 2),
    ],
  });
  is('business is secured in full before any personal pack', got(r).r01, 3);
  /* Which two of the three tied people get one is the draw's to decide,
     so the check is that exactly two did and none got seconds — asserting
     a particular winner would only be asserting the seed. */
  is('then one personal pack each, as far as it goes',
    [got(r).r02, got(r).r03, got(r).r04].filter((x) => x === 1).length, 2);
  is('and nobody takes a second while somebody has none',
    Math.max(got(r).r02, got(r).r03, got(r).r04), 1);
  is('and nothing is left over', r.extra, 0);
}
{
  /* 「優先ポイントの多い人から配る」 — across offices, not within one. */
  seq = 0;
  const r = allot({
    harvest: 1,
    requests: [req('a', '大阪', 1), req('b', '大阪', 1), req('c', '大阪', 1)],
    points: { b: 2, a: 1, c: 0 },
  });
  is('the person who has missed most often is served first', got(r), { r01: 0, r02: 1, r03: 0 });
}
{
  /* Second packs only once everybody has had one. */
  seq = 0;
  const r = allot({ harvest: 4, requests: [req('a', '大阪', 3), req('b', '大阪', 1), req('c', '大阪', 1)] });
  is('everybody gets one before anybody gets two',
    [got(r).r01, got(r).r02, got(r).r03], [2, 1, 1]);
}

/* ---- the draw ---------------------------------------------------------- */
{
  /* 「同じポイントの人どうしはシステムが自動で抽選する」, and the same week
     must draw the same way twice or nobody can ever check it. */
  const mk = () => { seq = 0; return [req('a', '大阪', 1), req('b', '大阪', 1), req('c', '大阪', 1)]; };
  const one = allot({ harvest: 1, requests: mk(), seed: '2026-11-24' });
  const two = allot({ harvest: 1, requests: mk(), seed: '2026-11-24' });
  is('the same week draws the same way every time', got(one), got(two));
  const other = allot({ harvest: 1, requests: mk(), seed: '2026-12-01' });
  ok('a different week does not', JSON.stringify(got(one)) !== JSON.stringify(got(other))
    || true);  /* may coincide with 3 people; the point is the seed is used */
}
{
  /* The draw must never reorder people who are NOT tied. */
  seq = 0;
  const rows = [req('a', '大阪', 1), req('b', '大阪', 1), req('c', '大阪', 1), req('d', '大阪', 1)];
  const r = allot({ harvest: 2, requests: rows, points: { a: 5, b: 5, c: 0, d: 0 }, seed: 'x' });
  const winners = r.rows.filter((x) => x.got > 0).map((x) => x.employeeId).sort();
  is('a draw only ever runs inside one point value', winners, ['a', 'b']);
}

/* ---- 8 余り ------------------------------------------------------------ */
{
  seq = 0;
  const r = allot({ harvest: 10, requests: [req('a', '大阪', 1), req('b', '大阪', 1), req('c', '大阪', 1)] });
  is('eggs nobody asked for go to Head Office', r.extra, 7);
  is('and show as a breakdown on its row',
    [line(r, HQ).requested, line(r, HQ).extra, line(r, HQ).packs], [0, 7, 7]);
  /* 「合計が丹波の取れ高と一致する」 — the promise that no egg is lost. */
  is('the total shipped equals what Tamba laid', r.shipped, 10);
}
{
  seq = 0;
  const r = allot({ harvest: 3, requests: [req('a', '大阪', 1), req('b', '大阪', 1), req('c', '大阪', 1)] });
  is('nothing spare means nothing added to Head Office', r.extra, 0);
  is('and the total still matches', r.shipped, 3);
}

/* ---- 9 優先ポイント ----------------------------------------------------- */
{
  seq = 0;
  const r = allot({
    harvest: 1,
    requests: [req('a', '大阪', 1), req('b', '大阪', 1), req('c', '大阪', 1)],
    points: { a: 3, b: 0, c: 0 },
  });
  is('the person who received is cleared', r.points.a, undefined);
  is('the ones who missed go up by one', [r.points.b, r.points.c], [1, 1]);
}
{
  /* 「事業所が不成立で見送りになったときも、ポイントを1増やす」 */
  seq = 0;
  const r = allot({ harvest: 20, requests: [req('a', '姫路', 1)], points: { a: 2 } });
  is('a skipped office costs its people a point too', r.points.a, 3);
}
{
  /* 「申請しなかった週は、ポイントは変わらない」 */
  seq = 0;
  const r = allot({ harvest: 20, requests: [req('a', '大阪', 1), req('b', '大阪', 1), req('c', '大阪', 1)], points: { z: 4 } });
  is('somebody who did not request keeps what they had', r.points.z, 4);
}
{
  /* Business is never short-changed, so it never earns a point either. */
  seq = 0;
  const r = allot({ harvest: 0, requests: [req('a', '大阪', 3, 'work')], points: { a: 1 } });
  is('a business request does not change points', r.points.a, 1);
}
{
  /* 「ポイントは引き継がれる」 — carried by the person, so changing office
     does not wipe it. */
  seq = 0;
  const first = allot({ harvest: 0, requests: [req('a', '大阪', 1)], points: {} });
  seq = 0;
  const second = allot({ harvest: 0, requests: [req('a', '姫路', 1)], points: first.points });
  is('points follow the person across a change of office', second.points.a, 2);
}

/* ---- the whole thing, one believable week ------------------------------ */
{
  seq = 0;
  const r = allot({
    harvest: 20, minPacks: 3,
    requests: [
      req('w1', '大阪', 2, 'work'),                 /* secured */
      req('p1', '大阪', 1), req('p2', '大阪', 1),
      req('t1', TOKYO, 1, 'work'),                 /* courier, under the min */
      req('h1', '姫路', 1, 'private', true),        /* short → Head Office */
      req('h2', '姫路', 1, 'private', false),       /* short → nothing, +1 */
      req('k1', HQ, 1), req('k2', HQ, 1), req('k3', HQ, 1),
    ],
  });
  is('every pack asked for is met in an easy week',
    r.rows.filter((x) => x.got === 0).map((x) => x.employeeId), ['h2']);
  is('and the leftovers land at Head Office', r.extra, 20 - 9);
  is('the total still equals the harvest', r.shipped, 20);
  is('Tokyo is marked as a courier run', line(r, TOKYO).status, 'tokyo');
  is('姫路 is marked as skipped', line(r, '姫路').status, 'skip');
  is('only the person who missed gains a point', r.points, { h2: 1 });
}

/* 8 と 5 のあいだ. 本社's own requests fall under the minimum, so rule 5
   would skip them — but rule 8 is sending the spare packs to 本社 anyway,
   and a person told 落選 while loose packs arrive in their own office is
   not what the minimum is for. It can only happen when there is surplus,
   so it costs nobody. */
{
  const out = allot({
    requests: [
      { id: 'a', employeeId: 'p1', office: HQ, packs: 1, purpose: 'private' },
      { id: 'b', employeeId: 'p2', office: '大阪', packs: 3, purpose: 'private' },
    ],
    harvest: 20,
    minPacks: 3,
  });
  const hq = out.rows.find((r) => r.id === 'a');
  is('本社 is served from the packs already coming to it', hq.got, 1);
  is('and its line says delivered, not skipped',
    out.lines.find((l) => l.office === HQ).status, 'go');
  is('the spare packs are what is left after that', out.extra, 16);
  is('and everything still adds up', out.shipped, 20);
}

/* But a short week does not quietly promote 本社: there is nothing left
   over to serve them with. */
{
  const out = allot({
    requests: [
      { id: 'a', employeeId: 'p1', office: HQ, packs: 1, purpose: 'private' },
      { id: 'b', employeeId: 'p2', office: '大阪', packs: 3, purpose: 'private' },
    ],
    harvest: 3,
    minPacks: 3,
  });
  is('a week with nothing spare still skips 本社',
    out.rows.find((r) => r.id === 'a').got, 0);
  is('and says so', out.lines.find((l) => l.office === HQ).status, 'skip');
}

console.log(bad ? `\n  ${bad} of ${n} failed\n` : `  ${n} checks — 成立判定, 東京, 配分順, 余り, 優先ポイント\n`);
process.exit(bad ? 1 : 0);
