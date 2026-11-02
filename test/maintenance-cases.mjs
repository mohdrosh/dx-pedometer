/* The notice 佐野 asked for on 11/2, for a maintenance on 11/4 11:00–14:00.
   What is being guarded: it appears before, changes during, disappears
   after, and a window somebody typed wrong never traps the app inside it. */
import { maintenanceState, windowText } from '../src/maintenance.js';
let n = 0; let bad = 0;
const is = (what, got, want) => {
  n += 1;
  const a = JSON.stringify(got); const b = JSON.stringify(want);
  if (a !== b) { bad += 1; console.log(`  XX  ${what}\n        got  ${a}\n        want ${b}`); }
};
const W = { maintenance: { on: true, from: '2026-11-04T11:00', to: '2026-11-04T14:00' } };
const st = (now, cfg = W) => maintenanceState(cfg, now).state;

is('the day before, it is a notice', st('2026-11-03T09:00'), 'notice');
is('the morning of, still a notice', st('2026-11-04T10:59'), 'notice');
is('on the minute it starts, it is under way', st('2026-11-04T11:00'), 'during');
is('an hour in, still under way', st('2026-11-04T12:30'), 'during');
is('a minute before the end, still under way', st('2026-11-04T13:59'), 'during');
/* 14:00 is the end, not part of it — a notice that outlives the work
   tells people the app is down while they are using it. */
is('on the minute it ends, it is gone', st('2026-11-04T14:00'), 'none');
is('and the day after', st('2026-11-05T09:00'), 'none');

is('switched off, nothing shows',
  st('2026-11-04T12:00', { maintenance: { ...W.maintenance, on: false } }), 'none');
is('no settings at all, nothing shows', st('2026-11-04T12:00', {}), 'none');
is('no settings object at all', st('2026-11-04T12:00', null), 'none');

/* The failure that would be worst: a typo that leaves every screen
   announcing a maintenance that never ends. */
is('an end before the start is ignored, not obeyed forever',
  st('2026-11-04T12:00', { maintenance: { on: true, from: '2026-11-04T14:00', to: '2026-11-04T11:00' } }), 'none');
is('an empty time is ignored',
  st('2026-11-04T12:00', { maintenance: { on: true, from: '', to: '2026-11-04T14:00' } }), 'none');
is('so is a half-written date',
  st('2026-11-04T12:00', { maintenance: { on: true, from: '2026-11-04', to: '2026-11-04T14:00' } }), 'none');

/* 「終了時刻をすぐ直してください」 — the work runs over and the end time is
   pushed back. The app has to follow it without a deploy. */
const later = { maintenance: { ...W.maintenance, to: '2026-11-04T16:00' } };
is('pushing the end time back keeps it under way', st('2026-11-04T15:00', later), 'during');
is('and the original end time no longer stops it', st('2026-11-04T14:30', later), 'during');
is('while the old window would already have finished', st('2026-11-04T14:30'), 'none');

const got = maintenanceState(W, '2026-11-03T09:00');
is('the notice carries both times', [got.from, got.to], ['2026-11-04T11:00', '2026-11-04T14:00']);

is('written the way people read it',
  windowText('2026-11-04T11:00', '2026-11-04T14:00'), '11月4日（水） 11:00 〜 14:00');
/* Running past midnight has to say which day it ends, or 「〜02:00」 reads
   as two in the morning of the day it started. */
is('a window that crosses midnight says so',
  windowText('2026-11-04T22:00', '2026-11-05T02:00'), '11月4日（水） 22:00 〜 11/05 02:00');
is('and in English', windowText('2026-11-04T11:00', '2026-11-04T14:00', 'en'),
  '4 November, 11:00–14:00 JST');

console.log(bad ? `\n  ${bad} of ${n} failed\n` : `  ${n} checks — the notice appears, changes, and goes away\n`);
process.exit(bad ? 1 : 0);
