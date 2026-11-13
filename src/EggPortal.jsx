/* ============================================================================
   モラエッグ Phase 1 — 配布の運用

   毎週月曜、丹波から事務所へ。社員は申請して、その週のうちに受け取りに行く。
   足りない週がほとんどなので、誰に渡すかを決める仕組みが要る。

   Four screens in one tab, and which of them a person sees is decided by
   what they are, not by a menu:

     配布    everybody — consent, request, and how the week is going
     丹波    the registrars in the shed — one button per pack
     事務所  the office contacts — who is coming, and ticking them off
     管理    administrators — offices, the rule, the draw

   The arithmetic is all in src/egg-week.js and src/egg.js, and the
   authorization is all in the routes. What is here is the part the rules
   do not cover: making a week legible at a glance, so that somebody opening
   this on a phone in a corridor can see whether there are enough eggs and
   whether they are owed one.
   ========================================================================= */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { S, apiRoot } from './storage';
import { EGG_TERMS_JA, HQ_OFFICE, TOKYO_OFFICE } from './egg.js';
import { mg, packs, art, ART_V } from './moraegg-text.js';
import {
  mondayOf, shiftDay, shipDay, deadlineDay, arrivalDay, weekPlan,
} from './egg-week.js';
import { PUBLIC_HOLIDAYS } from './holidays.js';

/* ---------------------------------------------------------------------------
   仕様書 6:「画面の文言は、文言辞書の日本語をそのまま使う。日本語が正で、
   英語は日本語からの訳である」.

   L below predates her dictionary. Rather than leave two Japanese
   wordings for the same thing in two files, every L key that she has
   written a string for is listed here and answered from hers — one table
   to read down when checking a screen against the dictionary, and no
   call site that has to remember which source it belongs to.

   What is left in L is what she has not written: the role screens (丹波,
   事務所, 管理), which are for the handful of people running this rather
   than for the 171 reading it.
   --------------------------------------------------------------------- */
const HERS = {
  /* 今週のスケジュール */
  schedHead: 'sched',
  stepDeadline: 'sDeadline',
  stepShip: 'sShip',
  stepArrive: 'sArrive',
  stepPickup: 'sPick',
  monHoliday: 'holiday',
  ruleLine: 'r1',
  /* 事務所対決 */
  race: 'battle',
  harvestNow: 'harvest',
  byDay: 'daily',
  coopNews: 'news',
  pack: 'pack',
  /* 申請 */
  agreeTick: 'agree',
  st_checking: 'checking',
  request: 'reqTitle',
  howMany: 'packs',
  eggsEach: 'packHint',
  why: 'purpose',
  reason: 'reason',
  /* Two different sentences in her dictionary, and they were one here:
     reasonReq is the hint beside the box, reasonErr is what comes back
     when it was left empty. */
  reasonNeeded: 'reasonReq',
  reasonBad: 'reasonErr',
  send: 'send',
  update: 'change',
  cancel: 'cancel',
  sent: 'sentTitle',
  dropped: 'canceled',
  canChange: 'sentText',
  /* 丹波. 「事務所」「管理」 she has not written, but the harvest screen is
     the Tamba staff's and she wrote all of it. */
  farmHead: 'tToday',
  /* 保存する, hers. The local table had 保存 — a word shorter and not
     the one she wrote. */
  save: 'save',
  addPack: 'tPlus',
  undo: 'tMinus',
  weekTotal: 'tWeek',
  farmNote: 'tHint',
  weekSum: 'tTotal',
  weekAsked: 'tReq',
  fixDay: 'tFix',
  fixNote: 'tFixNote',
  fixAdmin: 'tAdmin',
};

const L = {
  /* 週 */
  ship: ['発送日', 'Ships'],
  deadline: ['申請締切', 'Requests close'],
  pickupBy: ['受取期限', 'Collect by'],
  lastWeek: ['先週', 'Last week'],
  thisWeek: ['今週', 'This week'],
  nextWeek: ['来週', 'Next week'],
  closed: ['申請の受付は終了しました', 'Requests for this week have closed'],
  /* It used to read 「発送日の翌日から」, which was true while the van
     went on the deadline day: the next round opened the morning after
     it. Since 2026/11/12 the van goes a day later than the deadline, so
     「発送日の翌日」 is two days late — the next week opens the moment
     this one's deadline passes. */
  closedNote: ['次回の受付は、締切が過ぎるとすぐに始まります。',
    'The next round opens as soon as this deadline passes.'],

  /* 同意 */
  terms: ['受け取りの条件', 'Pickup terms'],
  termsNote: ['申請の前に、下記をご確認ください。', 'Please read this before requesting.'],
  agree: ['同意して申請へ進む', 'Agree and continue'],
  /* 6.2.1:「同意画面でチェックを入れて『同意する』を押すと申請可能になる」 */
  agreeTick: ['上記の条件に同意します', 'I agree to the terms above'],
  agreed: ['同意済み', 'Agreed'],
  agreedOn: ['{d} に同意', 'Agreed {d}'],
  reagree: ['条件が改定されました。もう一度ご確認ください。',
    'The terms have been revised. Please read them again.'],

  /* 申請 */
  request: ['申請', 'Request'],
  where: ['受け取る事業所', 'Collect at'],
  howMany: ['パック数', 'Packs'],
  pack: ['パック', 'packs'],
  eggsEach: ['1パック10個', '10 eggs a pack'],
  why: ['目的', 'Purpose'],
  reason: ['理由', 'Reason'],
  reasonNeeded: ['2パック以上は理由をご記入ください', 'Two or more packs need a reason'],
  reasonPh: ['例：お客様へお渡しするため', 'e.g. to give to a customer'],
  send: ['申請する', 'Request'],
  update: ['申請を変更する', 'Change my request'],
  cancel: ['申請を取り消す', 'Cancel my request'],
  sending: ['送信中…', 'Sending…'],
  sent: ['申請を受け付けました', 'Your request is in'],
  dropped: ['申請を取り消しました', 'Your request is cancelled'],
  failed: ['送信できませんでした', 'Could not send that'],
  canChange: ['締切までは何度でも変更・取り消しができます。',
    'You can change or cancel this any time before the deadline.'],
  noOffice: ['配布先の事業所がまだ設定されていません。',
    'No office is receiving eggs yet.'],

  /* 状況 */
  mine: ['あなたの申請', 'Your request'],
  /* 受付済 read 'Received' in English until 2026/11/13, when the button
     for 受け取りました became 'Received' to match 佐野's slides. Two
     different things called the same word, one of them a status saying
     「we have your request」 and the other a button saying 「I have the
     eggs」, is worse than either wording on its own. 'Submitted' is what
     this one actually means. */
  st_received: ['受付済', 'Submitted'],
  /* 仕様書 4.7: between the allocation and 最終確定. Her word for it. */
  st_checking: ['確認中', 'Being checked'],
  st_confirmed: ['確定', 'Confirmed'],
  st_missed: ['落選', 'Not this week'],
  /* And the state the button leaves behind takes the button's word:
     pressing 'Received' and being told 'Collected' reads like two
     different systems answering. */
  st_picked: ['受け取り済み', 'Received'],
  /* 5.5:「期限までに受け取られなかったパックは、その事務所の判断で扱う。
     システムでは『期限切れ』として記録するのみ」 */
  st_expired: ['期限切れ', 'Expired'],
  expiredNote: ['受け取り期限を過ぎました。事業所にお問い合わせください。',
    'The pickup deadline has passed. Please ask your office.'],
  expiredOffice: ['期限切れのパックは事業所でご判断ください。',
    'Expired packs are for the office to deal with.'],
  gotPacks: ['{n}パック確定', '{n} packs confirmed'],
  missedNote: ['今回は行き渡りませんでした。来週の抽選では優先されます。',
    'Not enough to go round this week. You get priority next week.'],
  /* 「Received」 and not 「I collected it」: 佐野's English slides for the
     11/14 meeting name the buttons, and 171 people will read the slide
     before they ever see the screen. The deck is the thing that cannot
     be edited after it is printed, so the screen matches the deck. */
  collect: ['受け取りました', 'Received'],
  history: ['これまでの申請', 'Your past requests'],
  whereTo: ['受け取り場所', 'Where to collect'],

  /* 佐野の例:「最低パック数を超えたら『今週はこの事務所にタマゴが届きます！』、
     届かなかったら残念賞のメッセージ」 */
  comingTo: ['今週、{o}に卵が届きます！', 'Eggs are coming to {o} this week!'],
  comingShort: ['届きます！', 'Delivery!'],
  comingSub: ['{n}パックの申請が集まりました。受け取りをお忘れなく。',
    '{n} packs requested. Don\u2019t forget to collect yours.'],
  almost: ['あと{n}パックで{o}に届きます', '{n} more packs and {o} gets a delivery'],
  almostSub: ['最低{m}パックから発送します。お誘いあわせのうえどうぞ。',
    'We ship once {m} packs are requested. Spread the word.'],
  missed: ['{o}は今週お休みです', 'No delivery to {o} this week'],
  missedSub: ['申請が{m}パックに届きませんでした。来週またよろしくお願いします。',
    'Requests fell short of {m} packs. Please try again next week.'],
  thisWeekTo: ['今週の行き先', 'Where the eggs are going'],
  coopNews: ['丹波の鶏舎だより', 'News from the coop'],
  printables: ['印刷して使えます', 'Ready to print'],
  printLabel: ['たまごパックのラベル', 'Carton label'],
  printLabelNote: ['採卵日を手書きできます', 'Write the lay date by hand'],
  printSeal: ['丹波のたまごシール', 'Tamba eggs sticker'],
  printSealNote: ['パックのふたに', 'For the lid of the carton'],
  printThanks: ['ありがとうカード', 'Thank-you card'],
  printThanksNote: ['おすそわけに添えて', 'To tuck in with a gift'],
  /* 2026/11/11: one sheet instead of three pictures. */
  printSet: ['ラベル・シール・ありがとうカード', 'Label, sticker and thank-you card'],
  printSetNote: ['A4の1枚にまとまっています。印刷して、点線で切り取ってお使いください。',
    'All three on one A4 sheet. Print it and cut along the dashed lines.'],
  printSetBtn: ['PDFをダウンロード', 'Download the PDF'],

  /* 合計と対決グラフ */
  race: ['丹波の取れ高　対　みんなのリクエスト', "Tamba's harvest vs everyone's requests"],
  harvestNow: ['今週の丹波の取れ高', "Tamba's harvest this week"],
  raceHead: ['事業所対決', 'Office vs office'],
  raceNote: ['リクエストが集まるほどバーが伸びます。最低パック数に届いた事業所に発送します。',
    'The bars grow as requests come in. Offices that reach their minimum get a delivery.'],
  minNeed: ['あと{n}パック', '{n} to go'],
  noMin: ['最低数なし', 'no minimum'],
  packsShort: ['{n}パック', '{n} packs'],
  ofHarvest: ['取れ高の{n}%', '{n}% of the harvest'],
  overHarvest: ['取れ高を超えています', 'More asked for than laid'],
  schedHead: ['モラエッグの1週間', 'A week of Moraegg'],
  stepDeadline: ['締切', 'Deadline'],
  stepShip: ['発送', 'Ships'],
  stepArrive: ['到着', 'Arrives'],
  stepPickup: ['受け取り', 'Collect'],
  monHoliday: ['月曜が祝日のため、1日後ろにずれています', 'The Monday is a holiday, so everything moves back a day'],
  ruleLine: ['締切は毎週月曜の朝9時（月曜が祝日の場合は火曜の9時）',
    'The deadline is 9:00 every Monday — Tuesday when the Monday is a holiday'],
  harvested: ['収穫', 'Harvested'],
  wanted: ['申請', 'Requested'],
  enough: ['足りています', 'Enough to go round'],
  short: ['あと{n}パック足りません', '{n} packs short'],
  exactly: ['ちょうど足ります', 'Exactly enough'],
  byDay: ['日ごとの取れ高', 'Laid, day by day'],
  /* byPurpose（目的の内訳）was here. Its one caller went on 2026/11/09
     with the row it labelled. requestTotals still counts the split and
     still sends it, so an administrator's screen can pick it up without
     the server changing; no screen reads it today. */
  byOffice: ['事業所の内訳', 'By office'],
  people: ['人', 'people'],
  noneYet: ['まだ申請がありません', 'No requests yet'],

  /* 丹波 */
  farm: ['丹波'],
  farmHead: ['収穫の登録', 'Register the harvest'],
  addPack: ['＋1パック', '+1 pack'],
  undo: ['取り消す', 'Undo'],
  todayIs: ['本日', 'Today'],
  weekTotal: ['今週の累計', 'This week so far'],
  farmNote: ['10個そろったら1パックです。端数は登録しません。',
    'A pack is 10 eggs. Part-packs are not registered.'],
  /* 2026/11/06: six entries were added here for fixDay, fixNote,
     weekSum, weekAsked, fixAdmin and reasonBad, on the belief that they
     resolved to nothing and the 丹波 screen was printing key names.

     They were not broken. All six are in HERS, which is read before this
     table, and all six of her keys exist — the screen had been showing
     her Japanese the whole time. The check that found them read only the
     first 400 characters of HERS and so missed its last ten entries,
     which is exactly where those keys live. Dead code, removed.

     The one real case that sweep found was `pickup`, which has no HERS
     entry and was printing the word "pickup" in the request form. That
     one was a bug and is fixed where it is used.

     Keeping the note because the mistake is worth not repeating: a
     lookup with two tables in front of it has to be checked against
     both, in full. */

  /* Refusals, which she has not written: both are about a correction
     arriving too late or too early to mean anything. */
  fixShut: ['この週は配分が確定したため、修正できません。',
    'This week has been decided, so the count can no longer be changed.'],
  fixAhead: ['これからの日は登録できません。', 'A day that has not happened yet cannot be registered.'],
  shipDone: ['この週はすでに最終確定しています。', 'This week has already been confirmed.'],

  /* 事務所 */
  office: ['事業所', 'Office'],
  arrivals: ['到着の確認', 'Confirm arrival'],
  arrived: ['到着しました', 'They have arrived'],
  arrivedOn: ['{d} 確認済み', 'Confirmed {d}'],
  toCollect: ['受け取りに来る方', 'Coming to collect'],
  nobody: ['この週の受け取りはありません', 'Nothing to hand out this week'],
  handed: ['お渡し済み', 'Handed over'],
  hand: ['お渡しした', 'Handed over'],
  packsFor: ['{n}パック', '{n} packs'],

  /* 管理 */
  admin: ['管理', 'Admin'],
  offices: ['配布先の事業所', 'Receiving offices'],
  officeName: ['事業所名', 'Office'],
  address: ['住所・受取場所', 'Address'],
  contact: ['担当者', 'Contact'],
  activeQ: ['受付中', 'Open'],
  minPacks: ['最低パック数（0なら毎週発送）', 'Minimum packs (0 ships every week)'],
  notice: ['お知らせ', 'Announcement'],
  noticePh: ['例：11/18（水）〜11/20（金）はシステムの最終確認を行うため、一時的にアクセスできないことがあります。',
    'e.g. the site may be briefly unavailable while we finish checking it.'],
  noticeNote: ['配布状況のいちばん上に表示されます。空欄にすると消えます。',
    'Shown at the top of 配布状況. Clear the box to take it down.'],
  noticeUntil: ['表示する最終日', 'Show until'],
  add: ['追加', 'Add'],
  save: ['保存', 'Save'],
  saved: ['保存しました', 'Saved'],
  remove: ['削除', 'Remove'],
  closedOffice: ['申請があるため、受付を止めました', 'It has requests, so it was closed instead'],
  rule: ['割当ルール', 'Allocation rule'],
  /* 2026/11/03: the company settled the rules, so there is no rule to
     pick any more. What is left are the two numbers inside them that the
     committee is still confirming. */
  rules2: ['配分のきまり', 'Allocation'],
  minSet: ['成立の最低パック数', 'Minimum packs'],
  minSetNote: ['この数に届かない事業所は見送りです。ただし東京は仕事用の申請があれば発送し、ほかの事業所に仕事用の申請があるときは管理者が個別に調整します。',
    'An office below this is skipped — except Tokyo, which ships on a business request, and any office with a business request, which an administrator settles case by case.'],
  tokyoSet: ['東京の特例', 'Tokyo exception'],
  tokyoOn: ['仕事用なら3パック未満でも宅急便で発送する', 'Ship by courier on a business request, even below the minimum'],
  result: ['今週の結果', 'This week'],
  resAt: ['受け取り場所', 'Collected at'],
  resPacks: ['パック', 'Packs'],
  resSplit: ['リクエスト{a}＋余り{b}', '{a} requested + {b} spare'],
  resMoved: ['本社受け取りに移動：{n}名', 'Moved to Head Office: {n}'],
  resAdjust: ['要調整', 'Needs adjusting'],
  resUnder: ['最低数を下回りました', 'Below the minimum'],
  resSkip: ['見送り', 'Skipped'],
  resTokyo: ['仕事用のため発送', 'Shipped for business'],
  resNone: ['リクエストなし', 'No requests'],
  resMiss: ['今回は受け取れない方：{n}名（優先ポイント+1）', 'Not this week: {n} — priority point +1 each'],
  resSpare: ['本社へ余り{n}パック（ご自由にどうぞ）', '{n} spare to Head Office — help yourself'],
  resNeeds: ['管理者の調整が必要な事業所があります。', 'An office needs an administrator to settle it.'],
  deadlineHour: ['締切時刻', 'Deadline hour'],
  firstShip: ['初回発送週（月曜）', 'First shipping week (Monday)'],
  firstShipNote: ['この日より前に出された申請は、すべて初回分として受け付けます。空欄なら通常どおり毎週。',
    'Requests made before this date all count towards the first delivery. Leave blank for the ordinary weekly cycle.'],
  maxPacks: ['1人あたりの上限', 'Per-person cap'],
  /* 2026/11/09: the two dates that decide whether the site is open at
     all were settings only the server could change, so opening the site
     early — to look at it, or to let the committee try it before the
     21st — meant a deploy. They are dates like 初回発送週 beside them. */
  reqFrom: ['リクエスト開始日', 'Requests open from'],
  reqFromNote: ['この日からリクエストを受け付けます。今日の日付にすると、すぐに受付が始まります。空欄ならいつでも受付。',
    'Requests are accepted from this date. Set it to today to open them now; leave it blank to accept them always.'],
  signFrom: ['参加登録の開始日', 'Sign-up opens from'],
  signFromNote: ['この日から参加登録ができます。空欄ならいつでも登録できます。',
    'Sign-up is possible from this date. Leave it blank to allow it always.'],
  /* 「抽選」 is no longer what happens: a draw only decides the order
     inside one point value, and the week itself is decided by the
     company's sequence. So the button says what it does. */
  draw: ['配分を確定', 'Decide the week'],
  drawAgain: ['もう一度確定', 'Decide it again'],
  drawn: ['{d}：取れ高{n}パックのうち{s}パックを配分しました',
    '{d}: {s} of {n} harvested packs allocated'],
  drawNote: ['締切の時刻になれば自動で確定します。このボタンはそれを前倒しで実行するもので、受け取りが始まるまでは何度でもやり直せます。',
    'This happens on its own at the deadline. The button runs the same thing early, and it can be re-run until somebody collects.'],
  drawDone: ['確定しました', 'Decided'],
  termsEdit: ['受け取り条件の文面', 'Pickup terms'],
  termsWarn: ['文面を変更すると、全員にもう一度同意していただく必要があります。',
    'Changing this asks everybody to agree again.'],
};

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/* 11月25日（水）— her form when the date is inside a sentence, as
   against the 11/25（水） the cards and tables use. */
const mdLong = (iso, lang) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return lang === 'ja'
    ? `${+m}月${+d}日（${DOW_JA[dow(iso)]}）`
    : `${+m}/${+d}`;
};

const md = (iso, lang) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return lang === 'ja'
    ? `${+m}/${+d}（${DOW_JA[dow(iso)]}）`
    : `${+m}/${+d}`;
};

/* 日ごとの取れ高 was a seven-column staircase chart here: each day stacked
   on the days before it, with a dashed line across at the week's requests.
   It carried one fact — the running total — that the card above now states
   as a number, a bar and a percentage, and it took a section of its own to
   do it. The per-day figures that were the rest of it are a row inside that
   card now. 丹波's own screen still lists the days, because that screen is
   where they are typed in.

/* ---------------------------------------------------------------------------
   事務所対決 — the offices racing each other for the week's harvest.

   佐野:「事務所ごとのリクエスト数と丹波の取れ高を、対決のように見せてほしい」.
   One harvest, several offices wanting a share of it, and a minimum each
   office has to reach before a van is worth sending: that is already a
   race, it was just being reported as two lists of numbers.

   Every bar is drawn against the same scale — the harvest, or the largest
   request when that is bigger — because bars that each fill their own row
   compare nothing. The minimum sits on the bar as a notch rather than in a
   column beside it, so "how far is this office from a delivery" is a
   distance you can see instead of a subtraction you have to do.
--------------------------------------------------------------------------- */
/**
 * 丹波の取れ高 vs みんなのリクエスト — the week in one line.
 *
 * It was the header of the office table, sharing a card with seven bars,
 * and it is the question most people open the page to ask: is there
 * enough, and how much is left. Its own card, the two numbers either side
 * of her VS badge, and underneath the one sentence that says what the
 * difference means — 「{n}パック余裕があります」, 「ちょうど同じです」, or the
 * shortfall, which also says what happens next.
 */
function HarvestVs({ offices, packs, lang, t, harvest = [], week0 = null, today = null }) {
  const mgs = (k, vars) => mg(k, lang, vars);
  const got = Math.max(0, Number(packs) || 0);
  const asked = (offices || []).reduce((a, o) => a + Math.max(0, Number(o.asked) || 0), 0);
  const short = asked > got && got > 0;
  /* 残り{n}% was here, in front of the sentence. 佐野, 2026/11/11:
     「残り○%は分かりにくいので、あと○パック余裕があります だけに」 —
     a share of a number people do not hold in their head, beside the
     count that says the same thing in packs. The bar is the share now,
     and the sentence is the words. */
  const used = got > 0 ? Math.min(100, (asked / got) * 100) : 0;
  /* Neither eggs nor requests: a week that has not started rather than
     a week that came out even. 「残り0%・取れ高とリクエストがぴったり
     同じです」 was arithmetically true of 0 against 0 and said nothing
     anybody could use. */
  const blank = got <= 0 && asked <= 0;
  /* The seven days behind the big number, as a strip rather than the
     staircase chart that used to have a section to itself. Same seven
     days — 丹波 types one figure per day and this is where they land. */
  const days = [];
  if (week0) {
    const base = new Date(`${week0}T00:00:00Z`);
    for (let i = 0; i < 7; i += 1) {
      const iso = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10);
      days.push({ iso, packs: harvest.find((h) => h.day === iso)?.packs || 0 });
    }
  }
  return (
    <div className="card eg-hvs">
      <div className="eg-hvs-row">
        {/* Requests first, harvest second. It was the other way round —
            the harvest is the week's headline and headlines go first —
            but a total belongs at the end of what it totals, and a reader
            coming down the page meets 1 against 14 the way they would
            read it aloud: this much asked for, out of this much there. */}
        <div className="eg-hvs-side">
          <em>{mgs('reqTotal')}</em>
          <b>{asked}</b>
          <span>{t('pack')}</span>
        </div>
        {/* A VS badge, not a mascot: the two numbers are being compared
            and the thing between them should say so. Which way the
            comparison went is the sentence underneath, in her words,
            rather than a picture the reader has to interpret. */}
        <span className="eg-hvs-vs" aria-hidden="true">VS</span>
        <div className="eg-hvs-side">
          <em>{t('harvestNow')}</em>
          <b>{got}</b>
          <span>{t('pack')}</span>
        </div>
      </div>
      {/* One track, the whole week's harvest. What has been asked for
          fills it from the left, so what is left over is the empty part —
          the shape of the answer, under the number that states it. */}
      <div className={`eg-hvs-bar${short ? ' warn' : ''}`}>
        <i style={{ width: `${used}%` }} />
      </div>
      <div className="eg-hvs-foot">
        <p className={short ? 'warn' : ''}>
          {blank ? mgs('noReqYet')
            : short ? mgs('short', { n: String(asked - got) })
              : asked === got ? mgs('even')
                : mgs('spare', { n: String(got - asked) })}
        </p>
      </div>

      {/* 日ごとの取れ高 and 目的の内訳, under the two numbers they add up
          to. Both were a section of their own with a chart in it; as two
          quiet rows here they say the same thing in a tenth of the page,
          and the week's harvest is read in one place instead of two. */}
      {days.length > 0 && (
        <div className="eg-hvs-days">
          <h4>{t('byDay')}</h4>
          <ol>
            {days.map((dd) => (
              <li key={dd.iso} className={`${dd.packs ? '' : 'nil'}${dd.iso === today ? ' today' : ''}`}>
                <em>{DOW_JA[dow(dd.iso)]}</em>
                <b>{dd.packs || '-'}</b>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 目的の内訳（私用／仕事用）was the last row of this card. It is a
          split of the same total the card already states, and what it was
          there to warn about — 仕事用 ships from one pack and goes first
          when the week is short — the 事業所の表 beside this says office by
          office, in 佐野's own 「仕事用のため発送」. Two numbers nobody acts
          on, at the foot of the one card people do. The counts are still
          computed and still on the administrator's 発送の確定 screen. */}
    </div>
  );
}

/**
 * 「姫路・京都・東京2パック、それ以外4パック」 — the offices grouped by
 * the minimum that makes a run to them worth making.
 *
 * The largest group becomes それ以外, the rest are named. An office set
 * to 0 ships every week whatever happens, which is a different thing
 * from a small minimum and is said separately.
 */
function minGroups(rows, lang) {
  const sep = lang === 'ja' ? '、' : ', ';
  const join = lang === 'ja' ? '・' : ', ';
  const by = new Map();
  (rows || []).forEach((r) => {
    const n = Math.max(0, Number(r.min) || 0);
    if (!by.has(n)) by.set(n, []);
    by.get(n).push(r.name);
  });
  if (!by.size) return '';
  const every = by.get(0);
  by.delete(0);
  /* The biggest group is the one not worth naming. */
  const groups = [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  const rest = groups.shift();
  /* 「姫路、京都は2パック」 — 佐野's own wording, 2026/11/13, down to the
     は. She has written this sentence out twice now; matching it exactly
     is cheaper than a third round. */
  const is = lang === 'ja' ? 'は' : ' ';
  const out = groups
    .sort((a, b) => a[0] - b[0])
    .map(([n, names]) => `${names.join(sep)}${is}${packs(n, lang)}`);
  if (rest) out.push(`${mg('minRest', lang)}${is}${packs(rest[0], lang)}`);
  if (every?.length) out.push(`${every.join(join)}${mg('minEvery', lang)}`);
  return out.join(sep);
}

function OfficeRace({ offices, packs, lang, t, img }) {
  const mgs = (k, vars) => mg(k, lang, vars);
  const rows = (offices || []).map((o) => ({
    name: o.name,
    asked: Math.max(0, Number(o.asked) || 0),
    work: Math.max(0, Number(o.work) || 0),
    min: Math.max(0, Number(o.minPacks) || 0),
  }));
  /* One dot per pack, with the お届けライン drawn as a gap between the
     last dot below it and the first one above.

     It was a bar, and the bar measured the week's whole harvest while the
     notch on it measured that office's own minimum — two different scales
     in one row, so nothing in the row could be compared with anything
     else in it. On a week with no harvest and no requests the scale
     collapsed onto the largest minimum and the row became an empty track
     with a tick floating at an arbitrary spot.

     Dots have no scale to get wrong. The numbers here are packs, and a
     pack is a countable thing — 0 to 8 in an ordinary week — so the row
     says 「five, and the line was at four」 without any arithmetic. Enough
     dots are drawn to reach whichever is greater, the request or the
     line, so an office short of its minimum shows the empty places it
     still has to fill. They wrap rather than squeeze if a week is ever
     big enough to need it. */
  const dots = (r) => {
    const out = [];
    for (let i = 1; i <= Math.max(r.asked, r.min, 1); i += 1) {
      if (r.min > 0 && i === r.min + 1) out.push({ line: true, key: `l${i}` });
      out.push({ on: i <= r.asked, key: `d${i}` });
    }
    return out;
  };
  /* Ranked, because a race with the leader in the middle is a list. Ties
     keep the order the offices were registered in. */
  const ranked = [...rows].sort((a, b) => b.asked - a.asked);

  return (
    <div className="eg-vs">
      <ul className="eg-vs-rows">
        {ranked.map((r) => {
          const met = r.min === 0 || r.asked >= r.min;
          /* 配布ルール 6（2026/11/05）: a business request ships from one
             pack at any office, Tokyo included — which is no longer a
             special case, because every office goes by courier now. Said
             here because this is where somebody looks to find out whether
             theirs is coming. */
          const courier = !met && r.work > 0;
          const state = r.asked === 0 ? 'miss'
            : met ? 'go' : courier ? 'free' : 'wait';
          return (
            <li key={r.name} className={state}>
              <span className="eg-vs-n">{r.name}</span>
              <span className="eg-vs-p" aria-hidden="true">
                {dots(r).map((x) => (x.line
                  ? <s key={x.key} />
                  : <b key={x.key} className={x.on ? 'on' : ''} />))}
              </span>
              {/* 佐野's four: お届け決定 / あと{n}パックでお届け /
                  仕事用のため発送 / リクエストなし. Before the count, so
                  the row ends on the number — the sentence takes whatever
                  width is left over and the figures line up down the
                  right-hand edge. */}
              <em className="eg-vs-s">
                {r.asked === 0 ? mgs('cNone')
                  : met ? mgs('cGo')
                    : courier ? mgs('cSp')
                      : mgs('cNear', { n: String(r.min - r.asked) })}
              </em>
              <b className="eg-vs-v">{r.asked}</b>
            </li>
          );
        })}
        {!ranked.length && <li className="muted"><span className="eg-vs-n">{t('noneYet')}</span></li>}
      </ul>
      {/* 最低発送パック数, built from the offices rather than written
          out. 佐野, 2026/11/12: the sentence had the numbers inside it
          —「本社1パック、姫路・京都2パック、それ以外4パック」— and the
          offices had moved on without it; 本社 was on 4 by then and
          東京 on 2. Her heading, the office settings' numbers. */}
      <p className="eg-nn">{mgs('minNoteAll', { g: minGroups(rows, lang) })}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The verdict on an office.

   An office only gets a run if enough packs are asked for, so this is the
   single thing most people open the page to find out. It is a sentence and
   a face, not a colour: the green card and the blue one say different
   things in words before they say anything in paint.
--------------------------------------------------------------------------- */
/**
 * 今週のモラエッグ — her 初回の受付スタート card, built from this week's
 * dates instead of drawn.
 *
 * 2026/11/10. The card was a .webp with 11/24・11/25・11/27 painted into
 * it: right for one week in the year, wrong the moment the first
 * shipment moved, and impossible for the other fifty-one. Everything in
 * it except the robot is type in boxes, so it is type in boxes here, and
 * the four dates are the ones the server will act on.
 *
 * Her layout, kept: the title, the deadline in a white panel with the
 * 祝日 note under it, the three steps as dated chips, the speech bubble
 * and the robot. Only the first round gets 「はじめての卵、お楽しみに！」;
 * every other week the bubble has nothing to say and is left out.
 */
function WeekCard({ d, lang, t, img, first }) {
  const mgs = (k, vars) => mg(k, lang, vars);
  const w = d.week;
  if (!w?.deadline?.date) return null;
  /* 「東京はさらに1日後」: the reader is shown the day their own office
     sees, not the day the run reaches the nearer ones. Somebody who has
     not registered yet has no office, and gets the ordinary date. */
  const myOffice = d.signup?.office || null;
  const arrive = (myOffice && w.arriveBy?.[myOffice]) || w.arrive;
  const rows = [
    ['ship', w.shipDay, mgs('wkShip')],
    ['arrive', arrive, mgs('wkArrive')],
    ['pick', w.pickup, mgs('wkPick')],
  ];
  return (
    <div className="mg-weekcard">
      {/* The robot beside the title rather than under the dates. 佐野's
          bubble, 「はじめての卵、お楽しみに！」, is gone with the row it
          sat in: it said nothing about this week, and it and the robot
          were a third of the card's height between them. */}
      <b className="mg-wc-h">
        <img src={img('basket')} alt="" />
        <span>{mgs(first ? 'wkFirst' : 'wkWeek')}</span>
      </b>
      <div className="mg-wc-due">
        <em>{mgs(first ? 'wkDueFirst' : 'wkDue')}</em>
        <strong>
          {md(w.deadline.date, lang)}
          {' '}
          <span>{mgs('wkTime', { h: String(w.deadline.hour) })}</span>
        </strong>
        {/* 「※23日（月）は祝日のため、火曜日です」 — her note, printed only
            on a week that actually moved. */}
        {w.shifted && <i>{t('monHoliday')}</i>}
      </div>
      <ol className="mg-wc-rows">
        {rows.map(([k, iso, label]) => (
          <li key={k}>
            <span className={`mg-wc-d ${k}`}>{md(iso, lang)}</span>
            <em>{label}</em>
          </li>
        ))}
      </ol>
      {/* 仕様書 4.6:「お知らせ（みんなの画面に表示）」 — whatever an
          administrator wrote about this week, inside the card the week
          is on rather than in one of its own underneath. */}
      {w.note && <p className="mg-wc-note">{w.note}</p>}
    </div>
  );
}

/* Verdict lived here: the green 今週◯◯に卵が届きます banner as its
   own component. It is the top half of MyWeek below now, because the
   banner and the three facts under it were always one answer. */

/**
 * あなたの今週 — the reader's own week, in one card.
 *
 * 2026/11/10. It was four: the green 今週◯◯に卵が届きます banner, the
 * あなたの結果 line, the あなたの申請 row and the 受け取り場所 address,
 * each with its own heading and its own box. Four headings and four
 * borders around about twenty words, all of them answering the same
 * question — am I getting eggs, how many, where do I go, by when — and
 * between them they filled the column while the picture beside it sat
 * over empty cream.
 *
 * One card: the verdict in its own tint across the top, then the facts
 * as a row of labelled values, then the two buttons. 「あなたの結果」
 * (resMine / resMineText) is not in it, because the verdict says the
 * office and the facts row says the packs, which is the whole of that
 * sentence; her strings stay in the dictionary.
 */
function MyWeek({
  d, mine, status, lang, t, img, open, busy, onEdit, onCollect, notYet = false,
}) {
  const mgs = (k, vars) => mg(k, lang, vars);
  /* The reader's own office: the one their request names, or failing
     that the one they registered. It used to fall back to the first
     office with a minimum set, so somebody in 大阪 who had not asked yet
     was told how 本社 was doing. */
  const name = mine?.office || d.signup?.office
    || d.offices.find((o) => o.minPacks > 0)?.name;
  const office = d.offices.find((x) => x.name === name);
  const min = Math.max(0, Number(office?.minPacks) || 0);
  const asked = Math.max(0, Number(office?.asked) || 0);
  /* No minimum means every week is a delivery week for that office, so
     there is no verdict to give — the card is then the facts alone. */
  /* No verdict before the window opens: 「今週お休みです」 on a week
     nobody could ask for is the card answering its own question. */
  /* And none before the week is decided. 佐野, 2026/11/13:「受付が始まって
     いないのに結果が出ているのは少し違和感があります」 — she opened a week
     on its first morning, nobody had asked yet, and the card read 「本社
     （神戸）は今週お休みです・申請がパックに届きませんでした」. Nothing
     had fallen short; nothing had happened at all.

     Zero requests before the draw is 'wait', which says 「あと4パックで
     本社（神戸）に届きます」 — the same sentence the office gets at one
     pack or at three, and true at nought. 'miss' is a result, and a
     result has to wait for the thing that produces it. */
  const over = !!d.decided;
  const state = notYet || !office || !min ? null
    : (min - asked <= 0 ? 'go' : (asked > 0 || !over ? 'wait' : 'miss'));
  const line = state && {
    go: [t('comingTo'), t('comingSub')],
    wait: [t('almost'), t('almostSub')],
    miss: [t('missed'), t('missedSub')],
  }[state];
  const fill = (x) => x.replace('{o}', office?.name || '')
    .replace('{n}', String(state === 'go' ? asked : min - asked))
    .replace('{m}', String(min));
  /* The office they will actually collect from, which for somebody moved
     to 本社 is not the one they asked at. */
  const at = mine && d.offices.find((x) => x.name === (mine.atOffice || mine.office));
  const got = status === 'confirmed' || status === 'picked';
  if (!state && !mine) return null;
  return (
    <div className={`eg-me2${state ? ` ${state}` : ''}`}>
      {state && (
        <div className="eg-me2-top">
          <img src={img(state === 'go' ? 'basket' : state === 'wait' ? 'hug' : 'empty')} alt="" />
          <div>
            <b>{fill(line[0])}</b>
            <p>{fill(line[1])}</p>
          </div>
          {/* 佐野's sticker, as a seal on the corner of the card once the
              week is the reader's to collect. */}
          {got && (
            <img
              src={img(status === 'picked' ? 'thankyou-egg' : 'seal-round')}
              alt="" className="eg-me2-stamp"
            />
          )}
        </div>
      )}

      {mine && (
        <div className="eg-me2-body">
          <div>
            <em>{t('mine')}</em>
            <b>
              <span className={`pill ${status === 'missed' || status === 'expired' ? 'warn'
                : status === 'received' ? '' : 'ok'}`}>{t(`st_${status}`)}</span>
              {got
                ? `${mine.atOffice || mine.office}／${t('gotPacks').replace('{n}', String(mine.got))}`
                : mgs('sumLine', {
                  office: mine.office,
                  n: String(mine.packs),
                  purpose: mgs(mine.purpose === 'work' ? 'pWork' : 'pPersonal'),
                })}
            </b>
          </div>
          {/* Where to walk to, once there is something there to collect.
              Before that it is the office they registered, which they
              already know and which マイ設定 is for. */}
          {got && at?.address && (
            <div className="eg-me2-at">
              <em>{t('whereTo')}</em>
              <b>{at.name}</b>
              <span>{at.address}</span>
            </div>
          )}
          {got && (
            <div>
              <em>{t('pickupBy')}</em>
              <b>{md(d.week.pickup, lang)}</b>
            </div>
          )}
          {/* The buttons end the same row as the facts rather than
              opening one of their own: on a week with a single fact in
              it, a row to themselves was most of the card's height and
              all of its empty space. */}
          {(open || status === 'confirmed') && (
            <div className="eg-acts">
              {open && <button className="btn" onClick={onEdit}>{t('update')}</button>}
              {status === 'confirmed' && (
                <button className="btn primary" disabled={busy} onClick={onCollect}>
                  {t('collect')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {mine && status === 'missed' && <p className="eg-me2-note">{t('missedNote')}</p>}
      {mine && status === 'expired' && <p className="eg-me2-note">{t('expiredNote')}</p>}
    </div>
  );
}

/* ------------------------------ the tab ---------------------------------- */

/* The portal read is owned by the tab above, because the roles it carries
   decide which screens exist at all — fetching it a second time here would
   ask the same question twice to draw one of its own answers. */
/* 仕様書 3 splits what used to be one 配布 screen into two tabs: 配布状況
   is what is happening, リクエスト is what you do about it. They share
   every bit of state — the week, the offices, your own row — so they stay
   one component and this says which half to draw rather than the two
   fetching and deriving the same thing twice. */
export default function EggPortal({ d, reload: load, lang, toast, screen = 'all', onGo = null }) {
  /* Her dictionary, for the lines 仕様書 6 says to use verbatim. The
     older L table in this file still carries the rest; the two are kept
     apart so it is obvious which text she owns. */
  const mgs = (k, vars) => mg(k, lang, vars);
  /* 6.2.1 asks for a tick before the button, so agreeing is a deliberate
     act rather than the thing that happens when you press the only button
     on the screen. */
  const [ticked, setTicked] = useState(false);
  const t = useCallback((k) => (HERS[k] ? mg(HERS[k], lang)
    : L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);
  const img = art;

  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ office: '', packs: 1, purpose: 'private', reason: '' });
  const [editing, setEditing] = useState(false);

  const api = useCallback(async (path, method = 'GET', body) => {
    const res = await fetch(`${apiRoot()}/egg${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let j = null;
    try { j = await res.json(); } catch { /* no body */ }
    return { ok: res.ok, status: res.status, ...(j || {}) };
  }, []);

  /* The form opens on what they asked for last time, or on the first office
     if this is their first request this week. */
  useEffect(() => {
    if (!d) return;
    if (d.mine) {
      setForm({
        office: d.mine.office, packs: d.mine.packs,
        purpose: d.mine.purpose, reason: d.mine.reason || '',
      });
    } else if (d.offices?.length) {
      setForm((f) => (f.office ? f : { ...f, office: d.offices[0].name }));
    }
  }, [d]);

  if (!d) return <div className="pad muted">…</div>;

  const consent = async () => {
    setBusy(true);
    const j = await api('/consent', 'POST', { agree: true, version: d.terms.version });
    setBusy(false);
    if (!j.ok) { toast?.(t('failed')); return; }
    load();
  };

  const sendRequest = async () => {
    setBusy(true);
    const j = await api('/request', 'PUT', form);
    setBusy(false);
    if (!j.ok) {
      toast?.(j.error === 'bad_reason' ? t('reasonBad') : t('failed'));
      return;
    }
    setEditing(false);
    toast?.(t('sent'));
    load();
  };

  const dropRequest = async () => {
    setBusy(true);
    await api('/request', 'DELETE');
    setBusy(false);
    setEditing(false);
    toast?.(t('dropped'));
    load();
  };

  const mine = d.mine;
  /* Worked out on the server, so this screen, the office contact's list and
     anything exported later can never disagree about whether a pack has
     expired — which depends on a date and a holiday list, not on markup. */
  const status = mine?.status || null;

  const showForm = d.open && (!mine || editing);
  const needReason = form.packs >= 2 && !form.reason.trim();

  /* Before the day requests open, nothing about this week has happened
     yet: no request can exist, so no office can have missed its line. */
  const notYet = !!d.dates?.requestsFrom && String(d.today) < String(d.dates.requestsFrom);
  const onStatus = screen === 'all' || screen === 'status';
  const onRequest = screen === 'all' || screen === 'request';

  return (
    <div className={`eg-p2${screen !== 'all' ? ` eg-p2-${screen}` : ''}`}>

      {/* ------------------------------ left ------------------------------ */}
      <div className="eg-p2-l">

        {/* 丹波のめんどりたち sat here, capped at 150px: a thumbnail at the
            top left of a 780px column with half a column of cream beside
            it, above the one card people open this page to read. The
            schedule band below is her artwork too and it fills the column,
            so the page still opens with a picture. The file is still in
            public/moraegg if it wants a home somewhere it fits. */}

        {/* 「今週はこの事務所にタマゴが届きます！」 — the thing most people
            open this page to find out, so it is the first thing on it.

            One card, not one per office. Every office used to get its own,
            which made four stacked announcements of which three were about
            somewhere the reader is not going. The 事務所対決 beside this
            says how all of them are doing; this says how YOURS is. */}
        {/* 受付中: which delivery these requests are for — the first
            line of the column, because it is what the site is doing
            today. 佐野, 2026/11/11. */}
        {onRequest && d.open && (
          <p className="eg-openfor">
            {mgs('openFor', { d: mdLong(d.week.arrive, lang) })}
          </p>
        )}

        {/* あなたの今週: the verdict, the reader's own row, where to
            collect and by when — one card instead of four. */}
        <MyWeek
          d={d} notYet={notYet} mine={onRequest && !editing ? mine : null} status={status}
          lang={lang} t={t} img={img} open={d.open} busy={busy}
          onEdit={() => setEditing(true)}
          onCollect={async () => {
            setBusy(true);
            await api('/pickup', 'POST', { id: mine.id });
            setBusy(false); load();
          }}
        />


        {/* 配布状況 reads down the left: what is happening this week, then
            what it means for you, then the way to act on it. The right
            is the charts, which are for looking at rather than reading.

            These three were on the right until the week they first had
            something to say — the result card made that column 1413px
            against the left's 555, so the page was as long as its least
            useful half and the answer somebody came for was below the
            fold. */}
        {/* 「あと少しで届く事業所があるよ！」 — an office within two packs
            of its line, which is the week a word to a colleague actually
            changes.

            This used to hang under a 「今週のリクエストをする」 button that
            crossed to the リクエスト tab. The tab is gone and so is the
            button; the nudge is not, because it was never about the
            button — it is the one line on this page that asks somebody
            to do something for a colleague rather than for themselves.
            It sits above the form it is nudging towards. */}
        {d.open && !mine && (d.offices || []).some((o) => o.minPacks > 0
          && o.asked > 0 && o.minPacks - o.asked > 0 && o.minPacks - o.asked <= 2) && (
          <div className="eg-go">
            <p className="eg-bub">{mgs('homeBubble')}</p>
          </div>
        )}

        {/* 「今週はお休みです」. About the week people are in, which during
            a shutdown is not the week the form is taking requests for —
            so it says both rather than letting one stand for the other. */}
        {d.thisWeek?.off && (
          <div className="card eg-off">
            <img src={img('empty')} alt="" />
            <div>
              <strong>{mgs('offTitle')}</strong>
              {d.thisWeek.note && <p className="muted sm">{d.thisWeek.note}</p>}
            </div>
          </div>
        )}

        {/* 受け取りの条件: only while the window is open. Agreeing to them
            is the step before a request, so on a closed week it was a
            form card with nothing behind it, sitting under the reader's
            own confirmed packs. */}
        {onRequest && d.open && !d.consented && (
          <>
            <div className="sechead"><span>{t('terms')}</span></div>
            <div className="card eg-terms">
              <p className="muted sm">{d.consentAt ? t('reagree') : t('termsNote')}</p>
              <ul>
                {(lang === 'ja' ? d.terms.ja : d.terms.en).split('\n').map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <label className="check mg-tick">
                <input
                  type="checkbox" checked={ticked}
                  onChange={(e) => setTicked(e.target.checked)}
                />
                <span>{t('agreeTick')}</span>
              </label>
              <button
                className="btn primary" disabled={busy || !ticked} onClick={consent}
              >{t('agree')}</button>
            </div>
          </>
        )}

        {onRequest && d.consented && !d.offices.length && (
          <div className="card"><p className="muted sm">{t('noOffice')}</p></div>
        )}

        {/* Before the first round there is nothing to say about a week
            that has not happened. It used to say two things: 「今週お休み
            です・申請が4パックに届きませんでした」, which is true of any
            week with no requests in it and misleading about one where
            nobody could have made any, and 「申請の受付は終了しました」,
            which is the opposite of what is going on. 佐野, 2026/11/11.
            One card, naming the day it opens. */}
        {/* Not yet open. Shown whether or not the terms have been
            agreed to, because agreeing is the step before requesting and
            there is nothing to request yet: without this the whole
            column was empty for anybody who had not signed up. */}
        {onRequest && notYet && !mine && (
          <div className="card eg-shut">
            <img src={img('about-to-lay')} alt="" />
            <div>
              <strong>{mgs('preOpen', { d: md(d.dates.requestsFrom, lang) })}</strong>
            </div>
          </div>
        )}

        {/* 佐野's announcement. Not tied to a week and not tied to a
            state — a planned outage is news whether or not requests
            happen to be open — so it sits on its own above everything
            the week has to say, and the committee takes it down by
            clearing the field or letting its date pass. */}
        {onRequest && d.notice && (
          <div className="card eg-notice">
            <i aria-hidden="true">！</i>
            <p>{d.notice}</p>
          </div>
        )}

        {onRequest && !notYet && d.consented && !!d.offices.length
          && !d.open && !mine && (
          <div className="card eg-shut">
            <img src={img('empty')} alt="" />
            <div>
              <strong>{t('closed')}</strong>
              <p className="muted sm">{t('closedNote')}</p>
            </div>
          </div>
        )}

        {onRequest && d.consented && !!d.offices.length && showForm && (
          <>
            <div className="sechead"><span>{t('request')}</span></div>
            <div className="card eg-req">
              {/* 仕様書 4.3:「受取場所はマイ設定の登録先を表示する。変更は
                  マイ設定で行う」. It used to be eight buttons here and a
                  different answer every week; the company settled on one
                  registered office, so this reports it rather than asks. */}
              {/* mgs, not t: 受取場所 is in her dictionary and not in the
                  local table, so t() found nothing and the form showed
                  the word "pickup" to every employee. */}
              <div className="eg-q">{mgs('pickup')}</div>
              <div className="eg-req-at">
                <b>{d.signup?.office || '—'}</b>
                <span className="muted sm">{mgs('locChange')}</span>
              </div>

              <div className="eg-row2">
                <div>
                  <div className="eg-q">{t('howMany')} <small>（{t('eggsEach')}）</small></div>
                  <div className="eg-step">
                    <button
                      type="button" className="btn" aria-label="-"
                      disabled={form.packs <= 1}
                      onClick={() => setForm({ ...form, packs: Math.max(1, form.packs - 1) })}
                    >−</button>
                    <b>{form.packs}</b>
                    <button
                      type="button" className="btn" aria-label="+"
                      disabled={form.packs >= d.maxPacks}
                      onClick={() => setForm({ ...form, packs: Math.min(d.maxPacks, form.packs + 1) })}
                    >＋</button>
                  </div>
                </div>
                <div>
                  <div className="eg-q">{t('why')}</div>
                  <div className="eg-opts">
                    {d.purposes.map((p) => (
                      <button
                        key={p.id} type="button"
                        className={`eg-opt${form.purpose === p.id ? ' on' : ''}`}
                        onClick={() => setForm({ ...form, purpose: p.id })}
                      >{lang === 'ja' ? p.ja : p.en}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 「2パック以上は理由必須」 — the field appears when it is
                  needed rather than sitting there asking people who want one
                  pack to justify themselves. */}
              {form.packs >= 2 && (
                <label className="fld"><span>{t('reason')}</span>
                  <input
                    value={form.reason} maxLength={300} placeholder={t('reasonPh')}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  />
                </label>
              )}

              {/* 配布ルール 5:「本社受け取りにチェックした人：本社で受け取る
                  分に回す」. Not offered at Head Office itself, and not at
                  Tokyo — Tokyo has its own rule and is too far to walk to
                  Kobe from. */}
              {d.signup?.office && d.signup.office !== HQ_OFFICE
                && d.signup.office !== TOKYO_OFFICE && (
                <label className="check mg-tick eg-hq">
                  <input
                    type="checkbox" checked={!!form.hqOk}
                    onChange={(e) => setForm({ ...form, hqOk: e.target.checked })}
                  />
                  <span>{mgs('hqOk')}</span>
                </label>
              )}

              {/* 配布ルール 6.1（2026/11/05）:「1パックでも発送できますが、
                  できるだけ2パック以上でお願いします」 — at every office now,
                  not only 東京, and shown while the choice is being made
                  rather than after it. */}
              {form.purpose === 'work' && (
                <p className="eg-tokyo-note">{mgs('workNote')}</p>
              )}

              <div className="eg-acts">
                <button
                  className="btn primary" disabled={busy || needReason}
                  onClick={sendRequest}
                >{busy ? t('sending') : mine ? t('update') : t('send')}</button>
                {mine && <button className="btn ghost" disabled={busy} onClick={dropRequest}>{t('cancel')}</button>}
              </div>
              {needReason && <p className="eg-warn sm">{t('reasonNeeded')}</p>}
              <p className="muted sm">{t('canChange')}</p>
            </div>
          </>
        )}

      </div>

      {/* ------------------------------ right ----------------------------- */}
      {onStatus && (
      <div className="eg-p2-r">
        {/* 今週のモラエッグ: her card, drawn from this week's dates.
            It was two pictures and a card of four dates — 初回の受付
            スタート during the first round, the weekly strip plus the
            dates card otherwise — and the one with dates in it was a
            drawing of a single week. */}
        <WeekCard d={d} lang={lang} t={t} img={img} first={d.firstRound} />

      </div>

      )}

      {/* 丹波の取れ高 and 事業所ごとのリクエスト: the width of the page,
          one under the other, under both columns.

          They were a pair at the foot of the left-hand column, two cards
          of 380px side by side. They are what the page is for — how many
          eggs there are this week, and which offices that reaches — and
          at that size the dots ran out of room while the cream either
          side of the columns stayed empty. Across the page, each row of
          the office table is one line and the harvest reads at a glance
          from the doorway.

          Outside both columns rather than spanning them: a child of the
          grid with no column of its own, which on a phone is simply the
          last thing on the page. */}
      {onStatus && (
        <div className="eg-wide">
          {/* 今週の確定結果 — the company's week, so it belongs with the
              other two cards about the week rather than in the column
              about the reader. First of the three: once the allocation
              has run, what each office is getting is the news, and the
              harvest and the request table behind it are the working. */}
          {d.decided && (
            <>
              <div className="sechead">
                <span>{mgs(d.final ? 'resTitle' : 'resTitleCheck')}</span>
                {!d.final && <span className="eg-chk">{mgs('checking')}</span>}
              </div>
              <div className="card eg-done">
                <p className="muted sm">{mgs(d.final ? 'resLead' : 'resLeadCheck')}</p>
                {!d.final && <p className="eg-chk-msg">{mgs('checkingMsg')}</p>}
                <ul className="eg-res-l">
                  {d.offices.filter((o) => (o.sent || 0) > 0).map((o) => (
                    <li key={o.name}>
                      <b>{o.name}</b>
                      <span className="eg-res-n">{packs(o.sent, lang)}</span>
                      {o.spare > 0 && (
                        <small>
                          {mgs('resHq', { a: String(o.sent - o.spare), b: String(o.spare) })}
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <HarvestVs
            offices={d.offices} packs={d.harvestPacks} lang={lang} t={t}
            harvest={d.harvest} week0={d.week0} today={d.today}
          />
          <div className="card">
            <OfficeRace
              offices={d.offices} packs={d.harvestPacks} lang={lang} t={t} img={img}
            />
          </div>
        </div>
      )}

      {/* ---- the reference cards, in a band of their own -------------

          毎週のルール and 印刷して使えます are the things somebody reads
          once and then knows. They were scattered through the two
          columns above, which put a list of standing rules between the
          reader's own week and the two cards the page is for. Equal
          columns at the foot of the page: still here, and no longer in
          the way. */}
      <div className="eg-ref">
        {/* これまでの申請 — the reader's own past weeks. Reference like
            the two under it: worth having, not worth the top of the
            page or the column beside the week. */}
        {onRequest && !!d.history?.length && (
          <>
            <div className="sechead"><span>{t('history')}</span></div>
            <div className="card">
              <ul className="eg-hist">
                {d.history.map((h) => (
                  <li key={h.ship}>
                    <span>{md(h.ship, lang)}</span>
                    <span>{h.office}</span>
                    <b>{h.got === null ? `${h.packs} ${t('pack')}` : `${h.got}/${h.packs}`}</b>
                    <em>{t(`st_${h.status || 'received'}`)}</em>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* 毎週のルール, the width of the page, above the printables.
            It has been in three places in two days: the right column,
            then the foot of the left one to fill the cream beside the
            week card, and now here — read once and then known, like the
            sheet under it, and out of the way of the week. */}
        {onRequest && (
          <>
            <div className="sechead"><span>{mgs('rules')}</span></div>
            <div className="card">
              {/* Two rules to a row from 760px: four of them are a card
                  two lines deep rather than a column of four. */}
              <ul className="eg-rules eg-r2">
                {['r1', 'r2', 'r3', 'r4'].map((k) => <li key={k}>{mgs(k)}</li>)}
              </ul>
            </div>
          </>
        )}

        {/* 印刷して使えます — one sheet, one button.

            It was three cards, each a link to a .webp: three tabs, three
            print dialogs, and a picture that prints at whatever size the
            browser decides. public/moraegg/print-set.pdf has all three
            at their real sizes, several of each, with dashed lines to
            cut along; tools/print-set.mjs builds it from the same three
            files, so new artwork from 佐野 means re-running that. */}
        {onStatus && (
          <>
            <div className="sechead"><span>{t('printables')}</span></div>
            <div className="card mg-printone">
              <div className="mg-printone-pics">
                {['label-asadore', 'seal-round', 'thankyou-egg'].map((f) => (
                  <img key={f} src={img(f)} alt="" />
                ))}
              </div>
              <div className="mg-printone-t">
                <b>{t('printSet')}</b>
                <span>{t('printSetNote')}</span>
              </div>
              <a
                className="btn primary sm"
                href={`${import.meta.env.BASE_URL}moraegg/print-set.pdf?v=${ART_V}`}
                download="moraegg-print-set.pdf"
              >{t('printSetBtn')}</a>
            </div>
          </>
        )}
      </div>

      {/* 丹波の鶏舎だより was here: a photo collage of the coop, under
          everything useful. It is the one thing on the page nobody opened
          it for, and on a screen that now carries the week, the request
          and the result it was simply length. The artwork still lives in
          public/moraegg if she wants it somewhere else. */}
    </div>
  );
}


/* ---------------------------------------------------------------------------
   5.1 丹波側の登録.

   佐野:「10個入り1パックごとにボタンを押すだけ。スマホ前提」 — so the screen
   is one button the size of a thumb, the day's count beside it, and the
   week under it. 「同日中であれば取り消し・修正ができる」, and only today,
   which is why every other day in the list is a figure and not a control.
--------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   今週の結果 — 仕様書 4.7 と 4.9, in her columns: 事業所 / 発送するパック数 /
   内訳, then 合計, then the list of who is collecting.

   One component on two screens. The Tamba staff check it before pressing
   最終確定 and the committee reads it afterwards, and the two have to be
   the same table — a difference between them would mean one of them was
   looking at something nobody shipped.
   --------------------------------------------------------------------- */
/* `pdf` is off on the 丹波 screen, where 発送の確定 carries the same
   button: two identical 箱に入れる紙 on one page is the sort of thing
   somebody has to stop and compare before pressing either. */
function WeekResult({
  r, lang, t, ship, final = true, withNames = false, pdf = true, title = null,
}) {
  const mgs = (k, vars) => mg(k, lang, vars);
  if (!r?.lines?.length) return null;
  const file = `moraegg-${ship || r.ship || ''}`;
  return (
    <>
      <div className="sechead">
        <span>{title || mgs(final ? 'resTitle' : 'resTitleCheck')}</span>
        {!final && !title && <span className="eg-chk">{mgs('checking')}</span>}
      </div>
      <div className="card eg-res">
        {r.needsAdmin && <p className="eg-warn sm">{t('resNeeds')}</p>}
        <p className="muted sm">{mgs(final ? 'resLead' : 'resLeadCheck')}</p>
        <ul className="eg-res-l eg-res-h">
          {/* 内訳 is not a column of its own: it is the line under each
              office, so labelling it in the header put a stray 「内訳」
              under 事業所 with nothing beneath it. */}
          <li className="head">
            <b>{mgs('resOffice')}</b>
            <span className="eg-res-n">{mgs('resPacks')}</span>
          </li>
          {r.lines.map((l) => (
            <li key={l.office} className={l.underMin ? 'warn' : ''}>
              <b>{l.office}</b>
              <span className="eg-res-n">{packs(l.packs, lang)}</span>
              <small>
                {l.extra > 0
                  ? mgs('resHq', { a: String(l.requested), b: String(l.extra) })
                  : l.status === 'skip' ? mgs('resSkip')
                    : l.status === 'work' ? mgs('resTokyo')
                      : l.status === 'none' ? mgs('cNone')
                        : l.underMin ? t('resUnder') : ''}
              </small>
            </li>
          ))}
          <li className="total">
            <b>{mgs('resTotal')}</b>
            <span className="eg-res-n">{packs(r.shipped || 0, lang)}</span>
            <small>{`${mgs('resHarvest')} ${packs(r.packs || 0, lang)}`}</small>
          </li>
        </ul>
        {r.moved > 0 && <p className="muted sm">{t('resMoved').replace('{n}', String(r.moved))}</p>}
        {/* 「今回は受け取れない方：{n}名（優先ポイント+1）」 was here. 佐野,
            2026/11/10: taken off this card. It read 0名 on every week
            where everybody was served, which is most of them, and a line
            that usually says nothing is a line people stop reading.
            The string stays in the table (resMiss) for whoever wants it
            back, and 優先ポイント itself is unaffected — it is added by
            the allocation, not by this sentence. */}
      </div>

      {withNames && !!r.list?.length && (
        <>
          <div className="sechead"><span>{mgs('shipList')}</span></div>
          <div className="card">
            {/* 「PDFとCSVで印刷・ダウンロードできる」. Both are the server's,
                so what is printed is what was allocated and not what a
                browser still had on screen. */}
            <div className="eg-dl">
              <a className="btn sm" href={`${apiRoot()}/egg/list?ship=${ship || r.ship}`}
                target="_blank" rel="noreferrer">{mgs('pdf')}</a>
              <a className="btn sm" href={`${apiRoot()}/egg/list.csv?ship=${ship || r.ship}`}
                download={`${file}.csv`}>{mgs('csv')}</a>
              {/* 箱に入れる紙. Only once the week is final: the route
                  refuses a week still 確認中, and a button that returns
                  an error is worse than one that is not there yet. */}
              {final && pdf && (
                <a className="btn sm eg-dl-box" href={`${apiRoot()}/egg/list.pdf?ship=${ship || r.ship}`}
                  download={`${file}.pdf`}>{mgs('boxSheet')}</a>
              )}
            </div>
            <ul className="eg-res-who">
              <li className="head">
                <b>{mgs('adminWho')}</b>
                <span>{mgs('resOffice')}</span>
                <span>{mgs('adminPurpose')}</span>
                <em>{mgs('confirmed')}</em>
              </li>
              {r.list.map((x, i) => (
                <li key={`${x.name}-${i}`}>
                  <b>{x.name}</b>
                  <span>{x.office}{x.moved ? ' ←' : ''}</span>
                  <span>{mgs(x.purpose === 'work' ? 'pWork' : 'pPersonal')}</span>
                  <em>{packs(x.got, lang)}</em>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
   発送の確定 — 仕様書 4.6, 配布ルール 10.

   Two presses on a Monday morning, and they are deliberately not one.

   The first says how many packs can actually go today, which is not
   always what the register says was laid: a cracked tray, a van with no
   room. That number starts the allocation.

   That press also sends the letters, but not before it has shown what it
   is about to send — 「21パックを9名に発送します。2名は落選になります」 —
   and been answered.

   It was two buttons until 2026/11/09: 確定 ran the allocation, and a
   second 最終確定する published it, so that nobody could post 171 letters
   off a miscount unread. The check was right; a whole second card was
   the wrong place for it. There is no decision to make on that card —
   the allocation is the company's rule and the staff cannot alter who
   gets what, only the pack count in the box above. So the thing it was
   protecting, a last look before the letters go, is now the question on
   the one button, and answering やめる leaves the week unpublished and
   the number editable exactly as the second card did.
   --------------------------------------------------------------------- */
function EggShip({ lang, toast, t, onDone }) {
  const mgs = (k, vars) => mg(k, lang, vars);
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [packs, setPacks] = useState('');
  /* The allocation that has been made but not published: what the
     question on screen is asking about. */
  const [ask, setAsk] = useState(null);
  /* 確定を取り消す, which asks before it does anything: the letters are
     already out by the time this button is on screen. */
  const [undo, setUndo] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`${apiRoot()}/egg/ship`, { credentials: 'same-origin' });
    if (!res.ok) return;
    const j = await res.json();
    setD(j);
    /* The box starts at what the shed actually registered this week, so
       the common Monday is a glance and a press rather than arithmetic. */
    setPacks(String(j.packs ?? j.harvested ?? 0));
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = async (path, body) => {
    setBusy(true);
    try {
      const res = await fetch(`${apiRoot()}/egg${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        toast?.(j?.error === 'already_final' ? t('shipDone')
          : j?.error === 'already_collected' ? t('fixShut') : t('failed'));
        return null;
      }
      await load();
      onDone?.();
      return j;
    } finally { setBusy(false); }
  };

  if (!d) return <div className="pad muted">…</div>;
  const n = Math.max(0, Math.floor(Number(packs) || 0));

  return (
    <div className="eg-ship">
      {/* ---- 1. 発送可能なパック数の確定 ---------------------------------- */}
      <div className="sechead"><span>{mgs('s1Title')}</span></div>
      <div className="card eg-ship-1">
        {/* 部長, 2026/11/10: in red, because the one way to get this
            week wrong is to press it before the deadline. */}
        <p className="eg-ship-warn">{mgs('s1Note')}</p>
        <label className="fld"><span>{mgs('shipStep1')}</span>
          <input
            type="number" min={0} max={999} value={packs} disabled={d.final}
            onChange={(e) => setPacks(e.target.value)}
          />
        </label>
        {/* 9:00 に確定済み — the allocation the system made at the
            deadline off the register, which is why the box already has a
            number in it. */}
        {d.drawn && <p className="eg-ship-ok">{mgs('shipConfirmed')}</p>}
        <button
          className="btn primary" disabled={busy || d.final}
          onClick={() => post('/draw', { ship: d.ship, packs: n })}
        >{mgs('s1Btn')}</button>
      </div>

      {/* ---- 2. 結果のお知らせ -------------------------------------------- */}
      <div className="sechead"><span>{mgs('s2Title')}</span></div>
      <div className={`card eg-ship-2${d.drawn ? '' : ' eg-dim'}`}>
        <p className="muted sm">{mgs('s2Note')}</p>
        {!d.final && (
          <>
            <button
              className="btn primary" disabled={busy || !d.drawn}
              onClick={async () => {
                const j = await post('/final', { ship: d.ship });
                /* What actually happened to the letters, which is not
                   always 送信しました: a server without SMTP writes them
                   to its log. */
                if (j) {
                  toast?.(mgs(j.mail?.dryRun ? 'finalDry'
                    : j.mail?.failed ? 'finalNg' : 'finalDone'));
                }
              }}
            >{mgs('s2Btn')}</button>
            {!d.drawn && <p className="muted sm">{mgs('s2Wait')}</p>}
          </>
        )}
        {d.final && (
          <>
            <p className="eg-ship-ok">{mgs('finalShort')}</p>
            {!undo && (
              <div className="eg-acts">
                {/* 箱に入れる紙, beside the press that makes it
                    possible: the route refuses a week that is not
                    final, which is exactly when this appears. */}
                <a
                  className="btn sm eg-dl-box"
                  href={`${apiRoot()}/egg/list.pdf?ship=${d.ship}`}
                  download={`moraegg-${d.ship}.pdf`}
                >{mgs('boxSheet')}</a>
                {/* A confirmed week locks the harvest register, so a
                    week confirmed too early has to be undoable by the
                    person who confirmed it. */}
                <button
                  className="btn ghost sm" disabled={busy}
                  onClick={() => setUndo(true)}
                >{mgs('undoFinal')}</button>
              </div>
            )}
            {undo && (
              <div className="eg-ship-ask">
                <p>{mgs('undoAsk')}</p>
                <p className="muted sm">{mgs('undoMail')}</p>
                <div className="eg-ship-ask-b">
                  <button
                    className="btn primary" disabled={busy}
                    onClick={async () => {
                      const j = await post('/undraw', { ship: d.ship });
                      setUndo(false);
                      if (j) toast?.(mgs('undoDone'));
                    }}
                  >{mgs('undoYes')}</button>
                  <button
                    className="btn ghost" disabled={busy}
                    onClick={() => setUndo(false)}
                  >{mgs('askNo')}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- 3. 今週のリクエスト結果  4. 発送一覧 --------------------------
          Both are drawn before anything has been confirmed, greyed, off
          a dry run of the same allocation: 部長 asked for the boxes to
          be there from the start rather than appearing out of nowhere
          on the Monday, and a forecast of the real thing says more than
          an empty frame would. */}
      {d.result && (
        <div className={d.preview ? 'eg-dim' : undefined}>
          {d.preview && <p className="eg-ship-fc">{mgs('previewNote')}</p>}
          <WeekResult
            r={d.result} lang={lang} t={t} ship={d.ship}
            final={d.final} withNames pdf={false} title={mgs('s3Title')}
          />
        </div>
      )}
    </div>
  );
}

export function EggFarm({ lang, toast }) {
  const t = useCallback((k) => (HERS[k] ? mg(HERS[k], lang)
    : L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);
  const img = art;
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  /* day -> what is in its box, while it differs from the register. */
  const [edits, setEdits] = useState({});
  /* The employees' view of the same week, for the office table. */
  const [pub, setPub] = useState(null);

  /* One screen, not two tabs.

     取れ高の入力 and 発送の確定 were separate because they are separate
     jobs — one every morning, one on a Monday. But the Monday job is a
     judgement about the number the daily job produced: eggs break, so
     what ships is not always what was registered. Splitting them put the
     running total on one tab and the decision about it on another, and
     the person making that decision had to remember a figure across a
     tap. The week and what is done with it are on the same screen now. */

  /* The register takes either a nudge or a flat number; this sends a
     number. ＋1パック was a tap per pack, which is fine for the three or
     four a morning and absurd for thirty — and it had nothing to press
     when you were done, so there was no moment where the shed said "that
     is the count" rather than drifting upward one tap at a time. */
  const save = useCallback(async (packs, day = null) => {
    setBusy(true);
    try {
      const res = await fetch(`${apiRoot()}/egg/harvest`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packs, ...(day ? { day } : {}) }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        toast?.(t(j?.error === 'week_decided' ? 'fixShut'
          : j?.error === 'not_yet' ? 'fixAhead' : 'failed'));
        return false;
      }
      setD(j);
      return true;
    } finally { setBusy(false); }
  }, [t, toast]);

  /* The first read is a no-op nudge, so the screen and the register agree
     from the first paint rather than after the first edit.

     The employees' view is read alongside it, for the 事業所ごとの
     リクエスト table below: it is the same table they see, from the same
     endpoint, so the shed and the floor cannot be looking at two
     different accounts of the week. */
  const load = useCallback(async () => {
    const res = await fetch(`${apiRoot()}/egg/harvest`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: 0 }),
    });
    if (res.ok) setD(await res.json());
    const p = await fetch(`${apiRoot()}/egg/portal`, { credentials: 'same-origin' });
    if (p.ok) setPub(await p.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div className="pad muted">…</div>;
  /* Today, not the day the last edit changed: correcting the Tuesday must
     not make the screen think Tuesday is today. */
  const todayIso = d.today || d.day;
  const today = d.harvest.find((h) => h.day === todayIso);
  const locked = !!d.decided;

  /* The week, Monday to Sunday, from the range the register itself
     reports rather than one worked out here. Every day of it is drawn,
     including the ones with nothing in them — a week that shows only the
     days somebody has typed into is not a week, and on a Monday morning
     it was one row. */
  const days = [];
  if (d.week?.from) {
    const base = new Date(`${d.week.from}T00:00:00Z`);
    for (let i = 0; i < 7; i += 1) {
      const iso = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10);
      const row = d.harvest.find((h) => h.day === iso);
      days.push({ iso, packs: row?.packs || 0, has: !!row });
    }
  }

  /* Typing no longer saves.

     Every box used to write to the register the moment it lost focus, so
     a tab press or a stray click was a commit and there was no moment
     where the shed said "that is the count". What is typed is a draft
     until 保存する is pressed; the button is dead until something has
     actually changed, so pressing it always means something. */
  /* A day nobody has typed into yet shows an empty box, not a 0. Zero is
     a count somebody made — 「no eggs on Sunday」 — and Friday has not
     happened. */
  const draftOf = (day, stored, has) => {
    if (edits[day] !== undefined) return edits[day];
    return has ? String(stored) : '';
  };
  const toN = (v) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(999, n)) : 0;
  };
  const changed = (list) => list.some(
    (x) => edits[x.iso] !== undefined && toN(edits[x.iso]) !== x.packs,
  );
  const saveDays = async (list) => {
    const todo = list.filter((x) => edits[x.iso] !== undefined && toN(edits[x.iso]) !== x.packs);
    if (!todo.length) return;
    const done = [];
    for (const x of todo) {
      /* Sequential, not Promise.all: each save returns the whole week and
         the last answer in would win. */
      // eslint-disable-next-line no-await-in-loop
      const ok = await save(toN(edits[x.iso]), x.iso === todayIso ? null : x.iso);
      if (ok) done.push(x.iso);
    }
    /* Only what the register took is cleared. A day it refused keeps the
       number in its box, so the person can see what did not go in rather
       than watching it vanish. */
    if (done.length) {
      setEdits((e) => {
        const next = { ...e };
        for (const iso of done) delete next[iso];
        return next;
      });
    }
    if (done.length === todo.length) toast?.(mg('saved', lang));
  };

  /* type=number for the numeric keypad on a phone, with the spinner taken
     off in CSS: a pair of 8px arrows beside a figure somebody types once a
     day is a target nobody wants and a way to be one out. */
  const packBox = (day, packs, big = false, has = true) => (
    <input
      type="number" min={0} max={999} inputMode="numeric"
      className={big ? 'eg-n-big' : 'eg-n'}
      /* A day that has not happened cannot have been harvested, and the
         register says so with a 409. Better that the box is simply shut
         than that somebody types into it and is refused. */
      value={draftOf(day, packs, has)} disabled={busy || locked || day > todayIso}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setEdits((x) => ({ ...x, [day]: e.target.value }))}
    />
  );

  return (
    <div className="eg-farm">

      {/* ---- one card: today's figure, the week it lands in, one button
          Today was its own card with its own 保存する, and the week below
          had another — and because the week's 月 cell is today as well,
          the same number sat in two boxes under two buttons that did
          almost the same thing. One card now. Today is typed in the big
          box; the strip shows where it lands and lets an earlier day be
          corrected; one button writes whatever changed. */}
      <div className="eg-farm-l">
        <div className="sechead"><span>{t('farmHead')}</span></div>
        <div className="card eg-farm-c">
          <label className="eg-today">
            <em>{t('todayIs')} {md(todayIso, lang)}</em>
            {packBox(todayIso, today?.packs ?? 0, true, !!today)}
            <span>{t('pack')}</span>
          </label>
          <p className="muted sm">{t('farmNote')}</p>

          <div className="eg-hv-top">
            <div className="eg-hv-n">
              <em>{t('weekTotal')}</em><b>{d.harvestPacks}</b><span>{t('pack')}</span>
              {/* Which shipment these seven days are for. The week here
                  and the week on the employees' page are the same week;
                  saying which one it is turns a figure that looked wrong
                  on 2026/11/09 into one that explains itself.

                  shipDay, not ship: the day the van goes and the Monday
                  that names the week came apart on 2026/11/12. */}
              {d.week?.shipDay && (
                <i className="eg-hv-for">{mg('tShipFor', lang, { d: md(d.week.shipDay, lang) })}</i>
              )}
            </div>
            <div className="eg-hv-ask">
              <em>{t('weekAsked')}</em><b>{d.asked ?? 0}</b>
            </div>
          </div>
          {/* Today's eggs are not always in the week above it — before the
              first shipment, and on a Monday before the deadline, they go
              to the one after. The big box still takes them; this says
              where they went, instead of leaving somebody to work out why
              the total did not move. */}
          {!!d.week?.from && (todayIso < d.week.from || todayIso > d.week.to) && (
            <p className="muted sm eg-hv-note">{mg('tNotIn', lang)}</p>
          )}

          {/* 「ほかの日を修正する」 was a block of its own with a pair of
              buttons per day. The week is seven cells instead — the same
              seven the employees' page shows. Today's cell is the figure
              from the box above rather than a second box for it; the
              others can be typed in, which is what the correction is. A
              day still to come is shut, because the register refuses it
              with a 409 and a box that cannot work should not open. Once
              the week is decided they all lock: the allocation was worked
              out from these numbers. */}
          <ol className="eg-wkdays">
            {days.map((x) => (
              <li
                key={x.iso}
                className={`${x.iso === todayIso ? 'on' : ''}${x.iso > todayIso ? ' soon' : ''}`}
              >
                <em>{DOW_JA[dow(x.iso)]}</em>
                {x.iso === todayIso
                  ? <b className="eg-wkd-v">{draftOf(x.iso, x.packs, x.has) || '0'}</b>
                  : packBox(x.iso, x.packs, false, x.has)}
              </li>
            ))}
          </ol>

          <div className="eg-acts">
            <button
              type="button" className="btn primary"
              disabled={busy || locked || !changed(days)}
              onClick={() => saveDays(days)}
            >{t('save')}</button>
          </div>
          {locked && <p className="muted sm">{t('fixShut')}</p>}
        </div>

        {/* 事業所ごとのリクエスト — the employees' table, on the shed's
            screen too. 丹波 is the one deciding what can ship, and that
            decision is about which offices are above their line: the
            box above holds the whole week, and this is where it is
            going. Under the harvest rather than beside the Monday
            decision, because it is about the same number as the card it
            sits under — and because the left-hand column ended halfway
            down the screen without it.

            It replaced 佐野's three printables, which are for whoever
            ends up holding a carton rather than for the shed: the
            employees' page carries them and 丹波 does not need a second
            copy. */}
        {pub?.offices?.length > 0 && (
          <>
            <div className="sechead"><span>{mg('byOffice', lang)}</span></div>
            <div className="card">
              <OfficeRace
                offices={pub.offices} packs={pub.harvestPacks}
                lang={lang} t={t} img={img}
              />
            </div>
          </>
        )}
      </div>

      {/* ---- the Monday decision, and who is asking ------------------- */}
      <div className="eg-farm-r">
        {/* 発送の確定, on the same screen as the number it is about. */}
        <EggShip lang={lang} toast={toast} t={t} onDone={load} />

      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   5.5 受け取り.

   The office contact's screen: confirm the packs arrived on Monday, then
   tick people off as they come for them. 「社員本人が押すか、事務所担当者が
   チェックする」, so a row is a button either way and the list is the record.
--------------------------------------------------------------------------- */
export function EggOffice({ lang, toast }) {
  const t = useCallback((k) => (HERS[k] ? mg(HERS[k], lang)
    : L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);
  const [d, setD] = useState(null);
  const [ship, setShip] = useState('');
  const [office, setOffice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (ship) q.set('ship', ship);
    if (office) q.set('office', office);
    const res = await fetch(`${apiRoot()}/egg/office?${q}`, { credentials: 'same-origin' });
    if (!res.ok) return;
    const j = await res.json();
    setD(j);
    /* The default is the week whose packs are on the desk now. But late in
       a week that has already been handed out, that screen is empty while
       next week's is full — so if this one has nobody on it and the next
       one does, open on that instead. Only once, and never over a week
       the contact chose themselves. */
    if (!ship && !j.rows.length && j.weeks?.[2]) {
      const nx = await fetch(`${apiRoot()}/egg/office?ship=${j.weeks[2]}&office=${encodeURIComponent(j.office)}`,
        { credentials: 'same-origin' });
      if (nx.ok) {
        const n = await nx.json();
        if (n.rows.length) setD(n);
      }
    }
  }, [ship, office]);

  useEffect(() => { load(); }, [load]);

  if (!d) return <div className="pad muted">…</div>;

  const post = async (path, body) => {
    setBusy(true);
    try {
      const res = await fetch(`${apiRoot()}/egg/${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast?.(t('failed')); return; }
      load();
    } finally { setBusy(false); }
  };

  return (
    <div className="eg-off">
      {/* The pickers run across the top of both columns rather than down
          a 340px one: seven office names and three weeks in a column that
          narrow wrapped three-then-four-then-two-then-one, which is ten
          chips at four different right-hand edges. Full width they are
          two tidy rows, and both columns below start at the same line. */}
      <div className="card eg-off-bar">
        {d.offices.length > 1 && (
          <div className="eg-opts">
            {d.offices.map((o) => (
              <button
                key={o} type="button" className={`eg-opt${d.office === o ? ' on' : ''}`}
                onClick={() => setOffice(o)}
              >{o}</button>
            ))}
          </div>
        )}
        <div className="eg-opts">
          {(d.weeks || []).map((w, i) => (
            <button
              key={w} type="button" className={`eg-opt${d.ship === w ? ' on' : ''}`}
              onClick={() => setShip(w)}
            >{t(['lastWeek', 'thisWeek', 'nextWeek'][i] || 'thisWeek')} {md(w, lang)}</button>
          ))}
        </div>
        <span className="muted sm">{t('pickupBy')} {md(d.pickup, lang)}</span>
      </div>

     <div className="eg-off-l">
      <div className="sechead"><span>{t('arrivals')}</span></div>
      <div className="card eg-arr">
        {d.arrival?.arrivedAt
          ? (
            <span className="pill ok">
              {t('arrivedOn').replace('{d}', new Date(d.arrival.arrivedAt).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-GB'))}
            </span>
          )
          : (
            <button
              className="btn primary" disabled={busy}
              onClick={() => post('arrived', { office: d.office })}
            >{t('arrived')}</button>
          )}
        <b className="eg-arr-n">{d.arrival?.packs || 0} {t('pack')}</b>
      </div>
     </div>

     <div className="eg-off-r">
      <div className="sechead">
        <span>{t('toCollect')}</span>
        <span className="muted sm">{d.rows.length} {t('people')}</span>
      </div>
      <div className="card">
        {!d.rows.length
          ? <p className="muted sm">{t('nobody')}</p>
          : (
            <ul className="eg-hand">
              {d.rows.map((r) => (
                <li key={r.id} className={r.pickedUpAt ? 'done' : ''}>
                  <span className="eg-hand-n">
                    {r.name}
                    {r.status === 'expired' && <em className="eg-exp">{t('st_expired')}</em>}
                  </span>
                  <b>{t('packsFor').replace('{n}', String(r.packs))}</b>
                  {r.pickedUpAt
                    ? (
                      <button
                        className="btn ghost sm" disabled={busy}
                        onClick={() => post('pickup', { id: r.id, undo: true })}
                      >{t('handed')} ✓</button>
                    )
                    : (
                      <button
                        className="btn sm" disabled={busy}
                        onClick={() => post('pickup', { id: r.id })}
                      >{t('hand')}</button>
                    )}
                </li>
              ))}
            </ul>
          )}
        {d.rows.some((r) => r.status === 'expired') && (
          <p className="muted sm">{t('expiredOffice')}</p>
        )}
      </div>
     </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   管理：事務所、ルール、抽選、文面.

   Everything an administrator decides about a week, on one screen, because
   they are decided together: which offices are open, how the packs are
   shared out, and then the draw itself.
--------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   スケジュール設定 — 仕様書 4.6.

   「通常は毎週自動で『月曜9時締切』になります。祝日やお休みの週だけ、ここで
   変更してください」, which is the whole design: the ordinary week is not
   stored at all. An administrator who never opens this screen still has a
   correct schedule, and what is written down is only the exceptions —
   which is also what makes a mistake here small and visible.

   Eight weeks, because the two things this is for are a public holiday
   and the new year shutdown, and both are known about a month or two
   ahead. A year of rows would be a year of rows nobody reads.
   --------------------------------------------------------------------- */
function EggSchedule({ cfg, save, lang, today }) {
  const mgs = (k, vars) => mg(k, lang, vars);
  const weeks = useMemo(() => {
    const first = mondayOf(today || new Date().toISOString().slice(0, 10));
    return Array.from({ length: 8 }, (_, i) => shiftDay(first, i * 7));
  }, [today]);

  /* The whole map is rewritten on each change rather than patched, so a
     week set back to 通常 with no notice leaves nothing behind: an empty
     entry and no entry mean the same thing, and only one of them can
     drift. */
  const put = (monday, next) => {
    const all = { ...(cfg.egg?.weeks || {}) };
    if (!next || (next.type === 'normal' && !next.note)) delete all[monday];
    else if (next.type === 'off') all[monday] = { off: true, ...(next.note ? { note: next.note } : {}) };
    else {
      /* Each of the four dates is stored only if it was set. A week where
         just the arrival moved keeps working out the other three the
         ordinary way, so a public holiday that shifts later still shifts
         them. */
      all[monday] = {
        ...(next.ship ? { ship: next.ship } : {}),
        ...(next.deadline ? { deadline: next.deadline } : {}),
        ...(next.arrive ? { arrive: next.arrive } : {}),
        ...(next.pickup ? { pickup: next.pickup } : {}),
        ...(next.note ? { note: next.note } : {}),
      };
    }
    save({ weeks: all });
  };

  return (
    <div className="card eg-sched-set">
      <p className="muted sm">{mgs('schLead')}</p>
      <ul className="eg-wks">
        {weeks.map((w) => {
          const plan = weekPlan(w, cfg);
          const auto = !!PUBLIC_HOLIDAYS[w] && plan.type === 'normal';
          return (
            <li key={w} className={plan.type !== 'normal' ? 'on' : ''}>
              <b>{mgs('weekOf', { n: md(w, lang) })}</b>
              <div className="eg-wk-t" aria-label={mgs('schType')}>
                {[['normal', 'schNormal'], ['changed', 'schChanged'], ['off', 'schOff']].map(([k, label]) => (
                  <button
                    key={k} type="button"
                    className={`eg-opt${plan.type === k ? ' on' : ''}`}
                    onClick={() => put(w, {
                      type: k,
                      /* A week switched to 日付を変更 starts from the days it
                         would have had anyway, so the common edit is a
                         nudge rather than four dates typed from nothing. */
                      ...(k === 'changed' ? {
                        ship: plan.ship || shipDay(w, PUBLIC_HOLIDAYS),
                        deadline: plan.deadline || deadlineDay(w, PUBLIC_HOLIDAYS),
                        arrive: plan.arrive || arrivalDay(w, PUBLIC_HOLIDAYS),
                        pickup: plan.pickup || shiftDay(w, 4),
                      } : {}),
                      note: plan.note,
                    })}
                  >{mgs(label)}</button>
                ))}
              </div>
              {/* 仕様書 4.8:「締切・発送・到着・受け取り期限を入力する」. All
                  four, in the order they happen, so the row reads like
                  the week it describes. */}
              {plan.type === 'changed' && (
                <div className="eg-wk-ds">
                  {[['deadline', 'sDeadline'], ['ship', 'sShip'],
                    ['arrive', 'sArrive'], ['pickup', 'sPick']].map(([k, label]) => (
                      <label key={k}><span>{mgs(label)}</span>
                        <input
                          type="date" defaultValue={plan[k] || ''}
                          onBlur={(e) => e.target.value !== (plan[k] || '')
                            && put(w, { ...plan, type: 'changed', [k]: e.target.value })}
                        />
                      </label>
                  ))}
                </div>
              )}
              {auto && <small className="eg-wk-a">{mgs('schAuto')}</small>}
              {plan.type === 'off' && <small className="eg-wk-a">{mgs('schOffShow')}</small>}
              <input
                className="eg-wk-n" defaultValue={plan.note}
                placeholder={mgs('schCommentPh')} maxLength={120}
                onBlur={(e) => {
                  if (e.target.value === plan.note) return;
                  put(w, { type: plan.type, ship: plan.ship, note: e.target.value.trim() });
                }}
              />
            </li>
          );
        })}
      </ul>
      <p className="muted sm">{mgs('schComment')}</p>
    </div>
  );
}

/* `people` was a prop here, for the 連絡担当者 dropdown. That field went
   on 2026/11/06 and with it the only reason this screen needed the
   roster, so the prop went too rather than sitting in the signature
   suggesting the component still wants it. */
export function EggAdmin({ lang, toast, cfg = {}, setCfg, onDone, today = null }) {
  const t = useCallback((k) => (HERS[k] ? mg(HERS[k], lang)
    : L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);
  const [offices, setOffices] = useState([]);
  const [draft, setDraft] = useState({ name: '', address: '', active: true });
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch(`${apiRoot()}/egg/offices`, { credentials: 'same-origin' });
    if (res.ok) setOffices((await res.json()).offices || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const put = async (row) => {
    setBusy(true);
    try {
      const res = await fetch(`${apiRoot()}/egg/offices`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
      if (!res.ok) { toast?.(t('failed')); return; }
      setOffices((await res.json()).offices || []);
      toast?.(t('saved'));
    } finally { setBusy(false); }
  };

  const drop = async (name) => {
    const res = await fetch(`${apiRoot()}/egg/offices?name=${encodeURIComponent(name)}`, {
      method: 'DELETE', credentials: 'same-origin',
    });
    if (!res.ok) { toast?.(t('failed')); return; }
    const j = await res.json();
    setOffices(j.offices || []);
    if (j.result === 'closed') toast?.(t('closedOffice'));
  };

  /* 配分のきまり, while it is being typed. Empty until something is
     changed, so the fields read from the stored settings until then and
     a save elsewhere on the page still shows up in them. */
  const [set, setSet] = useState({});
  const setVal = (k, fallback) => {
    const v = k in set ? set[k] : cfg.egg?.[k];
    return v === null || v === undefined ? fallback : v;
  };
  const setEdit = (k, v) => setSet((x) => ({ ...x, [k]: v }));
  const setDirty = Object.keys(set).some(
    (k) => String(set[k] ?? '') !== String(cfg.egg?.[k] ?? ''),
  );
  const saveSet = async () => {
    /* Dates go in as a date or as nothing — never as '' — and the two
       numbers as numbers, whatever the input element hands back. */
    const patch = {};
    for (const k of Object.keys(set)) {
      const v = set[k];
      if (k === 'deadlineHour') patch[k] = Math.min(23, Math.max(0, Number(v) || 0));
      else if (k === 'maxPacks') patch[k] = Math.min(99, Math.max(1, Number(v) || 1));
      else patch[k] = v || null;
    }
    await saveCfg(patch);
    setSet({});
  };

  /* Both halves, or neither: config written to the store and to React state
     together. Writing only the state is how the survey window shipped
     looking saved and reaching nobody. */
  const saveCfg = async (patch) => {
    const next = { ...cfg, egg: { ...(cfg.egg || {}), ...patch } };
    if (!await S.set('cfg', next)) { toast?.(t('failed')); return; }
    setCfg?.(next);
    toast?.(t('saved'));
  };

  const runDraw = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${apiRoot()}/egg/draw`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { toast?.(t('failed')); return; }
      setLast(j);
      toast?.(t('drawDone'));
      onDone?.();
    } finally { setBusy(false); }
  };

  return (
    <div className="eg-adm">
     <div className="eg-adm-l">
      {/* 事業所の設定 — 仕様書 4.10. One card per office rather than a row
          in a table: there are seven of them, each has four things to
          set, and a row that fits all four on a laptop is unreadable on
          the phone the committee actually uses.

          Every field saves on its own. The old version sent the whole
          row on any change, so saving a minimum wiped an address that
          happened not to be loaded — it cost 大阪 its address twice
          before anybody noticed. */}
      <div className="sechead"><span>{mg('offTitle2', lang)}</span></div>
      <div className="card">
        <p className="muted sm">{mg('offLead', lang)}</p>
        <ul className="eg-offc">
          {offices.map((o) => (
            <li key={o.name} className={o.active ? '' : 'off'}>
              <div className="eg-offc-h">
                <b>{o.name}</b>
                <label className="eg-offs-on">
                  <input
                    type="checkbox" checked={o.active}
                    onChange={(e) => put({ name: o.name, active: e.target.checked })}
                  />
                  <span>{mg('open', lang)}</span>
                </label>
              </div>
              <label className="fld"><span>{mg('offLoc', lang)}</span>
                <input
                  defaultValue={o.address || ''} placeholder={t('address')} maxLength={200}
                  onBlur={(e) => e.target.value !== (o.address || '')
                    && put({ name: o.name, address: e.target.value })}
                />
              </label>
              {/* 最低パック数: below this, no run is made to the office and
                  everybody who asked is told so — except a business
                  request, which ships from one pack anywhere. */}
              <label className="fld eg-offc-m"><span>{mg('offMin', lang)}</span>
                <input
                  type="number" min={0} max={99} defaultValue={o.minPacks ?? 0}
                  onBlur={(e) => Number(e.target.value) !== (o.minPacks ?? 0)
                    && put({ name: o.name, minPacks: Number(e.target.value) })}
                />
              </label>
              {/* 到着 +N日. 2026/11/12, 佐野:「到着は発送の翌日、東京は
                  さらに1日後」 — the extra night the courier needs for
                  this office, 0 for one that arrives with the rest. A
                  number here rather than 東京 written into the code, so
                  the next distant office is a field somebody fills in. */}
              <label className="fld eg-offc-m"><span>{mg('offLate', lang)}</span>
                <input
                  type="number" min={0} max={7} defaultValue={o.arriveDays ?? 0}
                  onBlur={(e) => Number(e.target.value) !== (o.arriveDays ?? 0)
                    && put({ name: o.name, arriveDays: Number(e.target.value) })}
                />
              </label>
              {/* 連絡担当者（名前・メールアドレス）was here. 佐野,
                  2026/11/06:「各事業所に卵を受け取る担当者は決まっていない
                  ため、事業所宛てに卵を届けるかたちにします。事業所の連絡
                  担当者（名前・メールアドレス）は設定画面から削除してくだ
                  さい」. The parcel goes to the office, so there is nobody
                  to name here, and a field for a person who does not
                  exist is a question nobody can answer correctly. */}
              <button className="btn ghost sm" onClick={() => drop(o.name)}>{t('remove')}</button>
            </li>
          ))}
        </ul>
        <div className="eg-offs-add">
          <input
            value={draft.name} placeholder={t('officeName')}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            value={draft.address} placeholder={t('address')}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
          />
          <button
            className="btn" disabled={busy || !draft.name.trim()}
            onClick={async () => { await put(draft); setDraft({ name: '', address: '', active: true }); }}
          >{t('add')}</button>
        </div>
      </div>

      <div className="sechead"><span>{t('draw')}</span></div>
      <div className="card eg-draw">
        <button className="btn primary" disabled={busy} onClick={runDraw}>
          {last ? t('drawAgain') : t('draw')}
        </button>
        {last && (
          <p className="eg-draw-r">
            {t('drawn')
              .replace('{d}', md(last.ship, lang))
              .replace('{s}', String(last.shipped ?? 0))
              .replace('{n}', String(last.packs))}
          </p>
        )}
        <p className="muted sm">{t('drawNote')}</p>
      </div>

      {last && !!last.lines?.length && (
        <WeekResult r={last} lang={lang} t={t} ship={last.ship} final={last.final} withNames />
      )}

     </div>

     <div className="eg-adm-r">
      {/* 配分のきまり — typed, then saved.

          Every field here used to write on blur, which is the right
          behaviour for a note and the wrong one for the five settings
          that decide when the site opens: tabbing through them to read
          what they say saved each one in turn, and a half-typed date
          (2026/11/0) is a real value the browser hands over on the way
          to 2026/11/09. One button now, and nothing leaves the screen
          until it is pressed. 佐野, 2026/11/11. */}
      <div className="sechead"><span>{t('rules2')}</span></div>
      <div className="card ad-set">
        {/* 最低パック数 moved to 事業所の設定 on 2026/11/05, because it is
            per office now; the 東京の特例 switch went with the rule it
            turned on. What is left here is what is the same everywhere. */}
        <label className="fld"><span>{t('deadlineHour')}</span>
          <select
            value={String(setVal('deadlineHour', 9))}
            onChange={(e) => setEdit('deadlineHour', Number(e.target.value))}
          >
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
          </select>
        </label>
        {/* 佐野:「11/14から初回分の受付を開始、初回締切は11/24（火）朝9時」 —
            two Mondays fall between those dates, and without this every
            request made in the first ten days would be shipped on one of
            them. Dated rather than a switch, so nobody has to remember to
            turn it off: it stops mattering once the week arrives. */}
        <label className="fld wide"><span>{t('firstShip')}</span>
          <input
            type="date" value={setVal('firstShip', '')}
            onChange={(e) => setEdit('firstShip', e.target.value)}
          />
          <small className="muted sm">{t('firstShipNote')}</small>
        </label>
        {/* 「11/19（木）初回リクエストの受付開始」「11/14から参加登録」 —
            the site shows 受付前 until the first of these, so this is the
            field that opens it. Blank means no date gate at all, which is
            what the ordinary weekly cycle wants once the first round is
            behind them. */}
        <label className="fld wide"><span>{t('reqFrom')}</span>
          <input
            type="date" value={setVal('requestsFrom', '')}
            onChange={(e) => setEdit('requestsFrom', e.target.value)}
          />
          <small className="muted sm">{t('reqFromNote')}</small>
        </label>
        <label className="fld wide"><span>{t('signFrom')}</span>
          <input
            type="date" value={setVal('signupFrom', '')}
            onChange={(e) => setEdit('signupFrom', e.target.value)}
          />
          <small className="muted sm">{t('signFromNote')}</small>
        </label>
        <label className="fld"><span>{t('maxPacks')}</span>
          <input
            type="number" min={1} max={99} value={setVal('maxPacks', 10)}
            onChange={(e) => setEdit('maxPacks', e.target.value)}
          />
        </label>
        {/* お知らせ. 佐野, 2026/11/13:「11/18〜11/20はシステムの最終確認を
            行うため、一時的にアクセスできないことがあります」 — the first
            of these, and the reason it is a field rather than a line of
            markup: the next one will be written by her, on the day, with
            nobody waiting on a deploy. 仕様書 4.6 already does this for
            one week; this is the same thing for an announcement that is
            not about a week at all. */}
        <label className="fld wide"><span>{t('notice')}</span>
          <textarea
            rows={2} maxLength={200} value={setVal('notice', '')}
            placeholder={t('noticePh')}
            onChange={(e) => setEdit('notice', e.target.value)}
          />
          <small className="muted sm">{t('noticeNote')}</small>
        </label>
        <label className="fld"><span>{t('noticeUntil')}</span>
          <input
            type="date" value={setVal('noticeUntil', '')}
            onChange={(e) => setEdit('noticeUntil', e.target.value)}
          />
        </label>
        <div className="eg-acts ad-set-save">
          <button
            type="button" className="btn primary"
            disabled={busy || !setDirty}
            onClick={saveSet}
          >{t('save')}</button>
        </div>
      </div>

      {/* 仕様書 4.6. Hers, by her heading. */}
      <div className="sechead"><span>{mg('schTitle', lang)}</span></div>
      <EggSchedule cfg={cfg} save={saveCfg} lang={lang} today={today} />

      <div className="sechead"><span>{t('termsEdit')}</span></div>
      <div className="card">
        <label className="fld"><span>{t('terms')}</span>
          <textarea
            /* The live text, not an empty box: an administrator opening
               this should see what people are agreeing to, and editing it
               should start from that rather than from nothing. */
            rows={8} defaultValue={cfg.egg?.termsJa || EGG_TERMS_JA}
            onBlur={(e) => saveCfg({ termsJa: e.target.value })}
          />
        </label>
        <p className="eg-warn sm">{t('termsWarn')}</p>
      </div>
     </div>
    </div>
  );
}

export { L as EGG_P2_L, md as eggMd };
