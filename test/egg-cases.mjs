/* タマゴ需要調査 — what may be answered, when, and how it is counted.
   The anonymity rule is the one worth testing hardest: a tally must be
   countable from rows that carry an employee id without the id reaching
   the result. */

import {
  EGG_OFFICES, EGG_RULES, EGG_NAMES, EGG_PURPOSES, NOT_NOW,
  EGG_TERMS_JA, REASON_MAX,
  cleanVote, eggWindow, eggOpen, eggOffices, tally,
  cleanRequest, eggMaxPacks, eggTerms, consentOk, requestTotals,
} from '../src/egg.js';

let n = 0;
const fails = [];
const is = (what, got, want) => {
  n += 1;
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) fails.push(`${what}\n    got  ${a}\n    want ${b}`);
};

/* ---------------------------- the answer -------------------------------- */

is('a real office and a real rule are accepted',
  cleanVote({ office: '大阪', rule: 'lottery' }), { office: '大阪', rule: 'lottery' });

is('今は不要 is an answer, not a refusal',
  cleanVote({ office: NOT_NOW, rule: 'fcfs' }), { office: NOT_NOW, rule: 'fcfs' });

is('an office nobody ships to is refused',
  cleanVote({ office: '札幌', rule: 'fcfs' }), null);

is('a rule that is not one of the four is refused',
  cleanVote({ office: '大阪', rule: 'whoever-asks-nicely' }), null);

is('a missing rule is refused rather than defaulted',
  cleanVote({ office: '大阪' }), null);

is('nothing at all is refused',
  cleanVote(null), null);

is('surrounding space is not a different office',
  cleanVote({ office: '  三田 ', rule: ' fcfs ' }), { office: '三田', rule: 'fcfs' });

is('an office added in 設定 is accepted',
  cleanVote({ office: '丹波', rule: 'fcfs' }, [...EGG_OFFICES, '丹波']),
  { office: '丹波', rule: 'fcfs' });

is('and the spec offices still are not, once 設定 narrows the list',
  cleanVote({ office: '京都', rule: 'fcfs' }, ['本社', '大阪']), null);

/* ---------------------------- the window -------------------------------- */

const win = { egg: { from: '2026-10-20', to: '2026-10-31' } };

is('open on the first day', eggOpen(win, '2026-10-20'), true);
is('open on the last day', eggOpen(win, '2026-10-31'), true);
is('open in the middle', eggOpen(win, '2026-10-25'), true);
is('shut the day before', eggOpen(win, '2026-10-19'), false);
is('shut the day after', eggOpen(win, '2026-11-01'), false);

/* A survey that opens itself because nobody set a date would start deciding
   where a van drives on the strength of a missing config key. */
is('no window at all is shut, not open', eggOpen({}, '2026-10-25'), false);
is('half a window is shut', eggOpen({ egg: { from: '2026-10-20' } }, '2026-10-25'), false);
is('a malformed date is shut',
  eggOpen({ egg: { from: '20/10/2026', to: '31/10/2026' } }, '2026-10-25'), false);
is('an unset window reads as none', eggWindow({}), null);
is('a set window reads back', eggWindow(win), { from: '2026-10-20', to: '2026-10-31' });

/* The year boundary is where string comparison would betray us if the format
   ever slipped; it does not, because the format is fixed. */
is('across the new year',
  eggOpen({ egg: { from: '2026-12-28', to: '2027-01-05' } }, '2027-01-01'), true);

/* ---------------------------- the offices ------------------------------- */

is('the spec list is the fallback', eggOffices({}), EGG_OFFICES);
is('設定 overrides it', eggOffices({ egg: { offices: ['大阪', '本社'] } }), ['大阪', '本社']);
is('an empty list falls back rather than offering nothing',
  eggOffices({ egg: { offices: [] } }), EGG_OFFICES);

/* ----------------------------- the count -------------------------------- */

/* Rows as the table really holds them: every one carries the employee it
   belongs to, because without it nobody could change their answer. */
const rows = [
  { employeeId: '2407036', office: '大阪', rule: 'lottery' },
  { employeeId: '0208', office: '大阪', rule: 'lottery' },
  { employeeId: '1011009', office: '本社', rule: 'lottery' },
  { employeeId: '2407039', office: '新長田', rule: 'onEach' },
  { employeeId: '2510004', office: NOT_NOW, rule: 'fcfs' },
];
const t = tally(rows);

is('every answer is counted', t.answers, 5);
is('今は不要 is counted', t.notNow, 1);

is('offices rank by how many want them',
  t.offices.slice(0, 3).map((o) => `${o.office}:${o.count}`),
  ['大阪:2', '本社:1', '新長田:1']);

is('an office nobody chose is still in the chart',
  t.offices.find((o) => o.office === '姫路'), { office: '姫路', count: 0 });

is('今は不要 is not among the destinations',
  t.offices.some((o) => o.office === NOT_NOW), false);

is('rules are counted and keep their order',
  t.rules.map((r) => `${r.id}:${r.count}`),
  ['fcfs:1', 'onEach:1', 'lottery:3', 'missedFirst:0']);

is('the rule with the most votes wins', t.topRule, 'lottery');

/* --------------------------- 問3 サイト名 -------------------------------- */
/* 佐野:「いちばん票の多い名前をサイト名にします」 */

is('a name rides along with the answer',
  cleanVote({ office: '大阪', rule: 'fcfs', name: 'moratama' }),
  { office: '大阪', rule: 'fcfs', name: 'moratama' });

is('a name nobody offered is dropped, not accepted',
  cleanVote({ office: '大阪', rule: 'fcfs', name: 'eggsellent' }),
  { office: '大阪', rule: 'fcfs' });

/* Answers given before this question existed are still good answers. */
is('an answer with no name is still valid',
  cleanVote({ office: '大阪', rule: 'fcfs' }), { office: '大阪', rule: 'fcfs' });

const named = tally([
  { employeeId: 'a', office: '大阪', rule: 'fcfs', name: 'moratama' },
  { employeeId: 'b', office: '本社', rule: 'fcfs', name: 'moratama' },
  { employeeId: 'c', office: '東京', rule: 'lottery', name: 'moraeggbin' },
  { employeeId: 'd', office: '京都', rule: 'lottery' },
]);
is('the three names are counted and keep their order',
  named.names.map((n) => `${n.id}:${n.count}`),
  ['moratama:2', 'moraeggbin:1', 'tambatayori:0']);
is('the most voted name wins', named.topName, 'moratama');
is('an answer without a name counts for the other questions', named.answers, 4);

is('no votes, no name', tally([]).topName, null);
is('a tie decides nothing', tally([
  { employeeId: 'a', office: '大阪', rule: 'fcfs', name: 'moratama' },
  { employeeId: 'b', office: '大阪', rule: 'fcfs', name: 'moraeggbin' },
]).topName, null);
is('all three are always in the chart', tally([]).names.length, 3);
is('every name on the screen can be voted for',
  EGG_NAMES.every((n) => cleanVote({ office: '大阪', rule: 'fcfs', name: n.id }).name === n.id), true);

/* ------------------------------ comments -------------------------------- */
/* 佐野:「投票するときに、意見があれば一緒に書いてもらってください」 */

is('a comment rides along with the answer',
  cleanVote({ office: '大阪', rule: 'fcfs', comment: '2パック欲しい日があります' }),
  { office: '大阪', rule: 'fcfs', comment: '2パック欲しい日があります' });

is('no comment means no comment, not an empty one',
  cleanVote({ office: '大阪', rule: 'fcfs' }), { office: '大阪', rule: 'fcfs' });
is('whitespace alone is no comment',
  cleanVote({ office: '大阪', rule: 'fcfs', comment: '   \n  ' }), { office: '大阪', rule: 'fcfs' });

is('newlines are collapsed so one comment cannot be a wall',
  cleanVote({ office: '大阪', rule: 'fcfs', comment: 'あ\n\nい   う' }).comment, 'あ い う');

is('a very long comment is cut rather than refused',
  cleanVote({ office: '大阪', rule: 'fcfs', comment: 'あ'.repeat(500) }).comment.length, 200);

is('a comment cannot rescue an invalid answer',
  cleanVote({ office: '札幌', rule: 'fcfs', comment: 'お願いします' }), null);

const withNotes = tally([
  { employeeId: 'a', office: '大阪', rule: 'fcfs', comment: '2パック欲しい' },
  { employeeId: 'b', office: '姫路', rule: 'lottery' },
  { employeeId: 'c', office: '本社', rule: 'fcfs', comment: '受取時間を遅めに' },
]);
is('comments are collected', withNotes.comments, ['2パック欲しい', '受取時間を遅めに']);
is('and answers without one are not counted as blank comments',
  withNotes.comments.length, 2);

/* The comment must not travel beside the office and the rule that were
   chosen with it: on eight offices that trio is often a single person. */
is('a comment carries no office or rule with it',
  withNotes.comments.every((c) => typeof c === 'string'), true);

/* ------------------------- anonymity, as a test ------------------------- */

/* The rows going in carry an employee id. If one ever comes out the other
   side, this fails — which is the point of writing it down. */
/* The system attaches nothing to a comment. What somebody chooses to type
   into one is their own business — the screen asks them not to identify
   themselves, and no amount of code can stop them if they insist. */
const rowsWithNotes = rows.map((r, i) => ({ ...r, comment: `ご意見${i + 1}` }));
const printedNotes = JSON.stringify(tally(rowsWithNotes));
is('comments come through', tally(rowsWithNotes).comments.length, 5);
is('and carry no employee id with them',
  rows.some((r) => printedNotes.includes(r.employeeId)), false);

const printed = JSON.stringify(tally(rows));
is('no employee id survives the count',
  rows.some((r) => printed.includes(r.employeeId)), false);
is('the word employeeId is nowhere in a tally',
  printed.includes('employeeId'), false);

/* ------------------------------ the edges ------------------------------- */

is('nobody has answered yet', tally([]).answers, 0);
is('and there is no winning rule on no votes', tally([]).topRule, null);
is('offices are all present on no votes',
  tally([]).offices.length, EGG_OFFICES.length);

is('a tie has no winner until somebody picks one',
  tally([
    { employeeId: 'a', office: '大阪', rule: 'fcfs' },
    { employeeId: 'b', office: '大阪', rule: 'lottery' },
  ]).topRule, null);

/* A row written before somebody renamed an office in 設定 is skipped rather
   than counted under a name that no longer exists. */
is('a row for a deleted office is not counted',
  tally([
    { employeeId: 'a', office: '京都', rule: 'fcfs' },
    { employeeId: 'b', office: '大阪', rule: 'fcfs' },
  ], ['大阪']).answers, 1);

is('nothing at all counts as nothing', tally(null).answers, 0);

is('every rule the screen offers can be voted for',
  EGG_RULES.every((r) => cleanVote({ office: '大阪', rule: r.id })), true);

/* ======================= Phase 1 ======================================== */

/* ------------------------------ 申請 ------------------------------------ */

const ok = (v, cfg) => cleanRequest(v, EGG_OFFICES, cfg);

is('one pack for yourself needs no explanation',
  ok({ office: '大阪', packs: 1, purpose: 'private' }),
  { ok: true, value: { office: '大阪', packs: 1, purpose: 'private' } });

is('2パック以上は理由必須',
  ok({ office: '大阪', packs: 2, purpose: 'work' }), { ok: false, error: 'reason' });

is('and with a reason it goes through',
  ok({ office: '大阪', packs: 2, purpose: 'work', reason: 'お客様へお渡しするため' }),
  { ok: true, value: { office: '大阪', packs: 2, purpose: 'work', reason: 'お客様へお渡しするため' } });

is('a reason of spaces is no reason',
  ok({ office: '大阪', packs: 3, purpose: 'work', reason: '   ' }), { ok: false, error: 'reason' });

/* A reason on a single pack is welcome but never demanded. */
is('one pack may carry a reason anyway',
  ok({ office: '大阪', packs: 1, purpose: 'private', reason: '久しぶりに' }).value.reason, '久しぶりに');

is('今は不要 is a survey answer, not a place to ship to',
  ok({ office: NOT_NOW, packs: 1, purpose: 'private' }), { ok: false, error: 'office' });
is('an office nobody ships to is refused',
  ok({ office: '札幌', packs: 1, purpose: 'private' }), { ok: false, error: 'office' });
is('a purpose that is neither is refused',
  ok({ office: '大阪', packs: 1, purpose: 'maybe' }), { ok: false, error: 'purpose' });
is('a missing purpose is not defaulted to 私用',
  ok({ office: '大阪', packs: 1 }), { ok: false, error: 'purpose' });

is('zero packs is not a request', ok({ office: '大阪', packs: 0, purpose: 'private' }), { ok: false, error: 'packs' });
is('nor is a negative one', ok({ office: '大阪', packs: -2, purpose: 'private' }), { ok: false, error: 'packs' });
is('nor is a word', ok({ office: '大阪', packs: 'いくつか', purpose: 'private' }), { ok: false, error: 'packs' });
is('half a pack is not a thing',
  ok({ office: '大阪', packs: 1.5, purpose: 'private' }).value.packs, 1);
is('nothing at all is refused rather than crashing', cleanRequest(null), { ok: false, error: 'office' });

/* About 21 packs are laid in a week, so one person asking for 500 is a
   typo or a joke and either way must not reach the draw. */
is('more than anyone could collect is refused',
  ok({ office: '大阪', packs: 500, purpose: 'work', reason: 'x' }), { ok: false, error: 'tooMany' });
is('the cap is 10 by default', eggMaxPacks(null), 10);
is('設定 can raise it', eggMaxPacks({ egg: { maxPacks: 20 } }), 20);
is('but not to nonsense', eggMaxPacks({ egg: { maxPacks: 0 } }), 10);
is('and the cap is enforced against the configured value',
  ok({ office: '大阪', packs: 15, purpose: 'work', reason: 'x' }, { egg: { maxPacks: 20 } }).ok, true);

is('a very long reason is cut rather than refused',
  ok({ office: '大阪', packs: 2, purpose: 'work', reason: 'あ'.repeat(600) }).value.reason.length, REASON_MAX);
is('newlines in a reason are collapsed',
  ok({ office: '大阪', packs: 2, purpose: 'work', reason: 'お客様\n\n用' }).value.reason, 'お客様 用');

is('every purpose the screen offers can be requested',
  EGG_PURPOSES.every((p) => ok({ office: '大阪', packs: 1, purpose: p.id }).ok), true);

/* ------------------------------ 同意 ------------------------------------- */

const terms = eggTerms(null);

is('the terms are the four from the spec', terms.ja, EGG_TERMS_JA);
is('and come with a version to record against', typeof terms.version, 'string');
is('the same text is always the same version', eggTerms(null).version, terms.version);

is('somebody who agreed to this text may request',
  consentOk({ version: terms.version }, null), true);
is('somebody who never agreed may not', consentOk(null, null), false);
is('an empty consent row is not a consent', consentOk({ version: '' }, null), false);

/* 「管理者が文面を改定した場合は、全員に再度同意を求める」 — nobody has to
   remember to bump a number, because the version is the text. */
const revised = { egg: { termsJa: `${EGG_TERMS_JA}\n受け取り場所は変更できません。` } };
is('revised terms are a different version',
  eggTerms(revised).version === terms.version, false);
is('so yesterday’s consent no longer counts',
  consentOk({ version: terms.version }, revised), false);
is('and agreeing again counts',
  consentOk({ version: eggTerms(revised).version }, revised), true);

/* Fixing a typo in the English must not put 171 people through the screen. */
is('the English wording does not invalidate a consent',
  consentOk({ version: terms.version }, { egg: { termsEn: 'Collect at your office.' } }), true);

is('blank config falls back to the spec text rather than to nothing',
  eggTerms({ egg: { termsJa: '   ' } }).ja, EGG_TERMS_JA);

/* --------------------------- 申請の合計 ---------------------------------- */

const asked = [
  { employeeId: 'e1', office: '大阪', packs: 1, purpose: 'private' },
  { employeeId: 'e2', office: '大阪', packs: 3, purpose: 'work' },
  { employeeId: 'e3', office: '本社', packs: 2, purpose: 'private' },
];
const tot = requestTotals(asked);

is('packs are totalled, not requests', tot.packs, 6);
is('and the people are counted too', tot.people, 3);
/* Kept in the spec's order rather than ranked: this one is a table the
   office contacts read down every week, and rows that swap places between
   loads are harder to read than rows that do not. */
is('split by office, in a fixed order',
  tot.offices.filter((o) => o.count).map((o) => `${o.office}:${o.count}`), ['本社:2', '大阪:4']);
is('every office stays in the table even on nought',
  tot.offices.length, EGG_OFFICES.length);
is('split by purpose',
  tot.purposes.map((p) => `${p.id}:${p.count}`), ['private:3', 'work:3']);
is('nobody asked', requestTotals([]).packs, 0);
is('nothing at all is nothing', requestTotals(null).people, 0);
is('a row with no packs is not a person waiting',
  requestTotals([{ employeeId: 'e1', office: '大阪', packs: 0, purpose: 'private' }]).people, 0);

if (fails.length) {
  console.error(`\n  ${fails.length} of ${n} failed:\n`);
  fails.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`  ${n} checks — anonymous, one answer each, counted as counts only`);
