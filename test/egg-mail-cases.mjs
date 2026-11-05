/* The three letters that go out at 最終確定 (仕様書 4.11).

   They are checked rather than eyeballed because an email is the one
   screen in this project nobody can fix after the fact: 171 copies are
   already in 171 inboxes. What matters is that the facts in them are the
   week's facts, and that the letter to somebody who missed out never
   reads like the letter to somebody who did. */
import { requesterMail, contactMail, adminMail, jpDate } from '../src/egg-mail.js';

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

/* ---- dates ------------------------------------------------------------- */
is('a date reads the way every screen prints it', jpDate('2026-11-25'), '11月25日（水）');
is('and a missing one is simply absent', jpDate(null), '');
is('as is a malformed one', jpDate('tomorrow'), '');

/* ---- to somebody who got eggs ------------------------------------------ */
{
  const m = requesterMail({
    name: '佐野 ちいほ', got: 2, office: '本社（神戸）',
    arrive: '2026-11-25', pickup: '2026-11-27',
  });
  ok('the subject says how many', m.subject.includes('2パック'), m.subject);
  ok('it is recognisable as モラエッグ', m.subject.startsWith('モラエッグ'), m.subject);
  ok('it greets them by name', m.body.includes('佐野 ちいほ さん'));
  for (const [what, text] of [
    ['where to collect', '本社（神戸）'],
    ['how many', '2パック'],
    ['when it arrives', '11月25日（水）'],
    ['the pickup deadline', '11月27日（金）'],
  ]) ok(`it says ${what}`, m.body.includes(text), m.body);
  ok('and never tells them they missed out', !m.body.includes('お届けできません'), m.body);
}

/* ---- to somebody who did not ------------------------------------------- */
{
  const m = requesterMail({ name: '山田', got: 0, missed: true });
  ok('the subject does not promise eggs', !/\dパック/.test(m.subject), m.subject);
  ok('it says so plainly', m.body.includes('今回はお届けできませんでした'), m.body);
  /* 配布ルール 9:「次回優先して割り当てる旨をメールで知らせる」 */
  ok('and that next week prefers them', m.body.includes('次回'), m.body);
  ok('with no dates to turn up on', !m.body.includes('受け取り期限'), m.body);
}
{
  /* got:0 without the flag is the same person — a week where the
     allocation simply reached nobody. The letter must not depend on the
     caller remembering to pass `missed`. */
  const m = requesterMail({ name: '山田', got: 0 });
  ok('nought packs is the same letter, flag or no flag',
    m.body.includes('今回はお届けできませんでした'), m.body);
}

/* ---- to an office contact ---------------------------------------------- */
{
  const m = contactMail({ office: '大阪', packs: 6, arrive: '2026-11-25', people: 4 });
  ok('the subject names the office and the count',
    m.subject.includes('大阪') && m.subject.includes('6パック'), m.subject);
  ok('the body gives the arrival date', m.body.includes('11月25日（水）'), m.body);
  ok('and says how many people are coming', m.body.includes('4名'), m.body);
  /* 「荷物の受け取りは各事業所に任せる」 — so the one thing asked of them
     is the arrival tick, and the letter says where to do it. */
  ok('it asks for the arrival to be confirmed', m.body.includes('到着の確認'), m.body);
  ok('nobody is named to the contact', !m.body.includes('さん'), m.body);
}
{
  const m = contactMail({ office: '京都', packs: 2, arrive: '2026-11-25' });
  ok('a count of people is left out when it is not known',
    !m.body.includes('受け取る方'), m.body);
}

/* ---- to the administrators --------------------------------------------- */
{
  const m = adminMail({
    ship: '2026-11-24',
    harvest: 20,
    shipped: 20,
    extra: 7,
    missed: 1,
    lines: [
      { office: '本社（神戸）', packs: 8, requested: 1, extra: 7, status: 'go' },
      { office: '大阪', packs: 4, requested: 4, extra: 0, status: 'go' },
      { office: '東京', packs: 1, requested: 1, extra: 0, status: 'work' },
      { office: '三田', packs: 0, asked: 2, requested: 0, extra: 0, status: 'skip' },
    ],
  });
  ok('the subject dates the shipment', m.subject.includes('11月24日（火）'), m.subject);
  ok('the harvest and the total are both there',
    m.body.includes('取れ高：20パック') && m.body.includes('発送合計：20パック'), m.body);
  /* 配布ルール 8:「本社の行に『リクエスト○＋余り○』と内訳を表示」 */
  ok('本社 shows its split', m.body.includes('リクエスト1＋余り7'), m.body);
  ok('an office shipped for business says why', m.body.includes('（仕事用のため発送）'), m.body);
  ok('a skipped office says that', m.body.includes('（見送り）'), m.body);
  ok('and the people who missed out are counted', m.body.includes('1名'), m.body);
}
{
  /* An office nobody asked at is not worth a line in a letter. */
  const m = adminMail({
    ship: '2026-11-24',
    lines: [{ office: '京都', packs: 0, asked: 0, requested: 0, extra: 0, status: 'none' }],
  });
  ok('an office with nothing at all is left out', !m.body.includes('京都'), m.body);
}

/* ---- nothing at all ----------------------------------------------------- */
{
  /* Called with no arguments at all, which is what a bug upstream looks
     like. It must not throw: the week is already confirmed by the time
     these run, and an exception here would take the response with it. */
  ok('every letter survives being called empty', !!requesterMail().subject
    && !!contactMail().subject && !!adminMail().subject);
}

console.log(bad ? `\n  ${bad} of ${n} failed\n` : `  ${n} checks — the three letters say the week's facts\n`);
process.exit(bad ? 1 : 0);
