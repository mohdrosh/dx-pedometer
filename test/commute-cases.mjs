/* 通勤経路 — what survives being written to a person's record, and in what
   shape. The fares here end up on a claim, so a wrong one costs money and a
   missing one only costs a question.
   Run: node test/commute-cases.mjs                                        */
import assert from 'node:assert/strict';
import { cleanCommute } from '../src/db.js';

let n = 0;
const ok = (what, got, want) => {
  n += 1;
  assert.deepEqual(got, want, `${what}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
};
const one = (x) => cleanCommute([x])[0];

/* The shape the import and the form both produce. */
ok('a leg as 佐野\'s sheet writes it',
  one({ carrier: 'JR西日本', from: '立花', to: '三ノ宮', oneWay: 320, pass: 9660 }),
  { carrier: 'JR西日本', from: '立花', to: '三ノ宮', oneWay: 320, pass: 9660 });

ok('yen signs and separators come off',
  one({ carrier: 'JR', from: 'a', to: 'b', oneWay: '¥320', pass: '9,660円' }),
  { carrier: 'JR', from: 'a', to: 'b', oneWay: 320, pass: 9660 });

/* Number('') is 0. A blank fare is not a free journey. */
ok('a blank fare stays blank, not ¥0',
  one({ carrier: 'JR', from: 'a', to: 'b', oneWay: '', pass: null }),
  { carrier: 'JR', from: 'a', to: 'b', oneWay: null, pass: null });

ok('an unreadable fare stays blank, not ¥0',
  one({ carrier: 'JR', from: 'a', to: 'b', oneWay: 'abc', pass: '-' }),
  { carrier: 'JR', from: 'a', to: 'b', oneWay: null, pass: null });

ok('a negative fare is refused', one({ carrier: 'JR', from: 'a', to: 'b', oneWay: '-5' }).oneWay, null);
ok('an absurd fare is refused', one({ carrier: 'JR', from: 'a', to: 'b', oneWay: '99999999' }).oneWay, null);
ok('a fractional fare rounds', one({ carrier: 'JR', from: 'a', to: 'b', oneWay: '320.4' }).oneWay, 320);

/* Rows that say nothing are dropped; a row with only stations is kept,
   because the missing fare is the thing somebody needs to go and find. */
ok('an empty row is dropped', cleanCommute([{ carrier: '', from: '', to: '', oneWay: '', pass: '' }]), []);
ok('stations with no fare are kept',
  cleanCommute([{ carrier: '地下鉄', from: '長田', to: '新長田', oneWay: '', pass: '' }]).length, 1);
ok('a fare with no stations is kept', cleanCommute([{ oneWay: 210 }]).length, 1);

/* Whatever arrives, it is a list of legs or it is nothing. */
ok('not a list', cleanCommute('JR 立花→三ノ宮'), []);
ok('null', cleanCommute(null), []);
ok('undefined', cleanCommute(undefined), []);
ok('a list of rubbish', cleanCommute([null, 7, 'x']), []);
ok('six legs is the limit', cleanCommute(Array(20).fill({ carrier: 'JR' })).length, 6);
ok('a long carrier is cut, not refused', one({ carrier: 'x'.repeat(200) }).carrier.length, 40);
ok('fields missing entirely', one({}), undefined);   // nothing to say — dropped

console.log(`  ${n} checks — a fare is right, blank, or refused; never silently ¥0`);
