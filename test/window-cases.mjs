/* 提出期間 — the rule 健康対策委員会 asked for: 対象月のみ提出可能.
   Run: node test/window-cases.mjs                                         */
import assert from 'node:assert/strict';
import { inSubmissionWindow, submissionWindow } from '../src/submission-window.js';

let n = 0;
const ok = (what, got, want) => { n += 1; assert.equal(got, want, `${what}: got ${got}, wanted ${want}`); };

/* 2026年10月度 covers 9/21–10/20, so it is submitted 10/21 → 11/1. */
const w = submissionWindow(2026, 10);
ok('window opens the day after the period closes', w.from, '2026-10-21');
ok('window closes on the 1st of the month after', w.to, '2026-11-01');

/* Exactly one month open on any given day — the point of the whole rule. */
const openOn = (iso) => [9, 10, 11]
  .filter((m) => inSubmissionWindow(2026, m, iso))
  .map((m) => `26${String(m).padStart(2, '0')}`);

ok('mid-period, nothing is open', String(openOn('2026-10-13')), '');
ok('the 21st opens the month that just closed', String(openOn('2026-10-21')), '2610');
ok('still open on the last day', String(openOn('2026-11-01')), '2610');
ok('shut again the day after', String(openOn('2026-11-02')), '');
ok('never two at once', String(openOn('2026-09-25')), '2609');

/* The boundaries themselves are inclusive at both ends. */
ok('the 20th is too early', inSubmissionWindow(2026, 10, '2026-10-20'), false);
ok('the 21st is in', inSubmissionWindow(2026, 10, '2026-10-21'), true);
ok('the 1st is in', inSubmissionWindow(2026, 10, '2026-11-01'), true);
ok('the 2nd is out', inSubmissionWindow(2026, 10, '2026-11-02'), false);

/* December rolls the year, which is where an off-by-one would hide. */
const dec = submissionWindow(2026, 12);
ok('December window opens', dec.from, '2026-12-21');
ok('December window closes in the new year', dec.to, '2027-01-01');
ok('open on new year\'s day', inSubmissionWindow(2026, 12, '2027-01-01'), true);
ok('shut on the 2nd of January', inSubmissionWindow(2026, 12, '2027-01-02'), false);
ok('January period is separate', inSubmissionWindow(2027, 1, '2027-01-21'), true);

console.log(`  ${n} checks — 対象月のみ, and only inside its window`);
