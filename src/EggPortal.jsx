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
import { EGG_TERMS_JA } from './egg.js';

const L = {
  /* 週 */
  ship: ['発送日', 'Ships'],
  deadline: ['申請締切', 'Requests close'],
  pickupBy: ['受取期限', 'Collect by'],
  lastWeek: ['先週', 'Last week'],
  thisWeek: ['今週', 'This week'],
  nextWeek: ['来週', 'Next week'],
  closed: ['申請の受付は終了しました', 'Requests for this week have closed'],
  closedNote: ['次回の受付は発送日の翌日から始まります。',
    'The next round opens the day after this shipment.'],

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
  where: ['受け取る事務所', 'Collect at'],
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
  noOffice: ['配布先の事務所がまだ設定されていません。',
    'No office is receiving eggs yet.'],

  /* 状況 */
  mine: ['あなたの申請', 'Your request'],
  st_received: ['受付済', 'Received'],
  st_confirmed: ['確定', 'Confirmed'],
  st_missed: ['落選', 'Not this week'],
  st_picked: ['受け取り済み', 'Collected'],
  /* 5.5:「期限までに受け取られなかったパックは、その事務所の判断で扱う。
     システムでは『期限切れ』として記録するのみ」 */
  st_expired: ['期限切れ', 'Expired'],
  expiredNote: ['受け取り期限を過ぎました。事務所にお問い合わせください。',
    'The pickup deadline has passed. Please ask your office.'],
  expiredOffice: ['期限切れのパックは事務所でご判断ください。',
    'Expired packs are for the office to deal with.'],
  gotPacks: ['{n}パック確定', '{n} packs confirmed'],
  missedNote: ['今回は行き渡りませんでした。来週の抽選では優先されます。',
    'Not enough to go round this week. You get priority next week.'],
  collect: ['受け取りました', 'I collected it'],
  history: ['これまでの申請', 'Your past requests'],
  whereTo: ['受け取り場所', 'Where to collect'],

  /* 佐野の例:「最低パック数を超えたら『今週はこの事務所にタマゴが届きます！』、
     届かなかったら残念賞のメッセージ」 */
  comingTo: ['今週、{o}にタマゴが届きます！', 'Eggs are coming to {o} this week!'],
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

  /* 合計と対決グラフ */
  race: ['丹波の取れ高　対　みんなのリクエスト', "Tamba's harvest vs everyone's requests"],
  harvestNow: ['今週の丹波の取れ高', "Tamba's harvest this week"],
  raceHead: ['事務所対決', 'Office vs office'],
  raceNote: ['リクエストが集まるほどバーが伸びます。最低パック数に届いた事務所に発送します。',
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
  byPurpose: ['目的の内訳', 'By purpose'],
  byOffice: ['事務所の内訳', 'By office'],
  people: ['人', 'people'],
  noneYet: ['まだ申請がありません', 'No requests yet'],

  /* 丹波 */
  farm: ['丹波'],
  farmHead: ['収穫の登録', 'Register the harvest'],
  addPack: ['＋1パック', '+1 pack'],
  undo: ['取り消す', 'Undo'],
  todayIs: ['本日', 'Today'],
  weekTotal: ['今週の累計', 'This week so far'],
  farmNote: ['10個そろったら1パックです。端数は登録しません。本日分のみ修正できます。',
    'One pack is ten eggs. Leftovers are not registered. Only today can be corrected.'],

  /* 事務所 */
  office: ['事務所', 'Office'],
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
  offices: ['配布先の事務所', 'Receiving offices'],
  officeName: ['事務所名', 'Office'],
  address: ['住所・受取場所', 'Address'],
  contact: ['担当者', 'Contact'],
  activeQ: ['受付中', 'Open'],
  minPacks: ['最低パック数（0なら毎週発送）', 'Minimum packs (0 ships every week)'],
  add: ['追加', 'Add'],
  save: ['保存', 'Save'],
  saved: ['保存しました', 'Saved'],
  remove: ['削除', 'Remove'],
  closedOffice: ['申請があるため、受付を止めました', 'It has requests, so it was closed instead'],
  rule: ['割当ルール', 'Allocation rule'],
  deadlineHour: ['締切時刻', 'Deadline hour'],
  firstShip: ['初回発送週（月曜）', 'First shipping week (Monday)'],
  firstShipNote: ['この日より前に出された申請は、すべて初回分として受け付けます。空欄なら通常どおり毎週。',
    'Requests made before this date all count towards the first delivery. Leave blank for the ordinary weekly cycle.'],
  maxPacks: ['1人あたりの上限', 'Per-person cap'],
  draw: ['抽選を実行', 'Run the draw'],
  drawAgain: ['もう一度実行', 'Run it again'],
  drawn: ['{d} に実行済み（{rule}、{n}パック）', 'Drawn {d} — {rule}, {n} packs'],
  drawNote: ['収穫したパック数を、上のルールで申請者に割り当てます。受け取りが始まるまでは何度でもやり直せます。',
    'Shares the harvested packs out between the requests using the rule above. Can be re-run until somebody collects.'],
  drawDone: ['抽選しました', 'Drawn'],
  termsEdit: ['受け取り条件の文面', 'Pickup terms'],
  termsWarn: ['文面を変更すると、全員にもう一度同意していただく必要があります。',
    'Changing this asks everybody to agree again.'],
};

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const md = (iso, lang) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return lang === 'ja'
    ? `${+m}/${+d}（${DOW_JA[dow(iso)]}）`
    : `${+m}/${+d}`;
};

/* ---------------------------------------------------------------------------
   5.4 対決グラフ.

   佐野:「今週の収穫累計と、来週月曜発送分の申請数を並べて、モラエッグの表情が
   変わる」 — the point of it is that it is checkable at a glance from across
   a room: are there enough eggs this week or not.

   Daily harvest stacks up left to right and the requests are a line across
   it, so the question is answered by whether the stack has reached the line.
   The mascot says the same thing a second way, and the sentence under it
   says it a third — nothing here depends on seeing the chart at all.
--------------------------------------------------------------------------- */
function Race({ harvest, week0, packs, want, today, lang, t, img }) {
  const days = useMemo(() => {
    const out = [];
    const base = new Date(`${week0}T00:00:00Z`);
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10);
      out.push({ iso: d, packs: harvest.find((h) => h.day === d)?.packs || 0 });
    }
    return out;
  }, [harvest, week0]);

  /* The scale takes in both the bars and the target, so neither can fall
     off the chart — and then a little headroom, because a week that
     exactly meets the target drew a bar jammed against the ceiling with
     the target line sitting on top of it. */
  const top = Math.max(1, want, packs, ...days.map((d) => d.packs)) * 1.15;
  let run = 0;
  const bars = days.map((d) => {
    const from = run;
    run += d.packs;
    return { ...d, from, to: run };
  });
  const diff = packs - want;
  const winning = want > 0 && diff >= 0;

  return (
    /* 佐野:「申請が集まるにつれて色が変わるグラフ」 — the fill is royal while
       the eggs are still coming and green once there are enough. That is a
       state rather than a series, so Moraegg's face and the line under the
       number say the same thing without it. */
    <div className={`eg-race${winning ? ' win' : ''}`}>
      <div className="eg-race-top">
        <img src={img(want === 0 ? 'hug' : winning ? 'basket' : 'cross')} alt="" />
        <div>
          <b className="eg-race-n">{packs}</b>
          <span className="eg-race-u">/ {want} {t('pack')}</span>
          <p className={`eg-race-s${winning ? ' win' : ''}`}>
            {want === 0 ? t('noneYet')
              : diff > 0 ? t('enough')
                : diff === 0 ? t('exactly')
                  : t('short').replace('{n}', String(-diff))}
          </p>
        </div>
      </div>

      <div className="eg-race-ch" role="img"
        aria-label={`${t('harvested')} ${packs}, ${t('wanted')} ${want}`}
      >
        {bars.map((b) => (
          <div
            key={b.iso}
            className={`eg-race-col${b.iso === today ? ' today' : ''}`}
            title={`${md(b.iso, lang)} — ${b.packs}`}
          >
            <span className="eg-race-track">
              {/* Each day sits on top of the days before it, so the height
                  of the stack is the week's running total and the line is
                  reached, or not, on a particular day. */}
              <i
                className="eg-race-seg"
                style={{ bottom: `${(b.from / top) * 100}%`, height: `${(b.packs / top) * 100}%` }}
              />
            </span>
            <em>{DOW_JA[dow(b.iso)]}</em>
          </div>
        ))}
        {want > 0 && (
          <span className="eg-race-line" style={{ bottom: `${(want / top) * 100}%` }}>
            <b>{t('wanted')} {want}</b>
          </span>
        )}
      </div>
    </div>
  );
}

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
function OfficeRace({ offices, packs, lang, t, img }) {
  const rows = (offices || []).map((o) => ({
    name: o.name,
    asked: Math.max(0, Number(o.asked) || 0),
    min: Math.max(0, Number(o.minPacks) || 0),
  }));
  const harvest = Math.max(0, Number(packs) || 0);
  /* The scale has to hold the harvest, every bar and every notch, or one of
     them is drawn off the end of its track. */
  const top = Math.max(1, harvest, ...rows.map((r) => Math.max(r.asked, r.min)));
  const asked = rows.reduce((a, r) => a + r.asked, 0);
  const pct = (n) => `${Math.min(100, (n / top) * 100)}%`;
  /* Ranked, because a race with the leader in the middle is a list. Ties
     keep the order the offices were registered in. */
  const ranked = [...rows].sort((a, b) => b.asked - a.asked);

  return (
    <div className="eg-vs">
      <div className="eg-vs-top">
        <img src={img(harvest > 0 && asked > harvest ? 'cross' : 'basket')} alt="" />
        <div>
          <em>{t('harvestNow')}</em>
          <b>{harvest}</b>
          <span>{t('pack')}</span>
        </div>
        <p className={asked > harvest && harvest > 0 ? 'warn' : ''}>
          {asked > harvest && harvest > 0
            ? t('overHarvest')
            : t('ofHarvest').replace('{n}', String(harvest ? Math.round((asked / harvest) * 100) : 0))}
        </p>
      </div>

      <ul className="eg-vs-rows">
        {ranked.map((r) => {
          const met = r.min > 0 && r.asked >= r.min;
          const state = r.min === 0 ? 'free' : met ? 'go' : r.asked > 0 ? 'wait' : 'miss';
          return (
            <li key={r.name} className={state}>
              <span className="eg-vs-n">{r.name}</span>
              <span className="eg-vs-t">
                <i style={{ width: pct(r.asked) }} />
                {/* The minimum, on the bar. A van is sent at this mark and
                    not before, so it belongs where the eggs are counted. */}
                {r.min > 0 && <u style={{ left: pct(r.min) }} aria-hidden="true" />}
              </span>
              <b className="eg-vs-v">{r.asked}</b>
              <em className="eg-vs-s">
                {r.min === 0
                  ? t('noMin')
                  : met ? t('comingShort')
                    : t('minNeed').replace('{n}', String(r.min - r.asked))}
              </em>
            </li>
          );
        })}
        {!ranked.length && <li className="muted"><span className="eg-vs-n">{t('noneYet')}</span></li>}
      </ul>
      <p className="eg-nn">{t('raceNote')}</p>
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
function Verdict({ office, lang, t, img }) {
  const min = Math.max(0, Number(office.minPacks) || 0);
  const asked = Math.max(0, Number(office.asked) || 0);
  /* No minimum set means every week is a delivery week, so there is no
     verdict to give and the card would only be noise. */
  if (!min) return null;
  const short = min - asked;
  const state = short <= 0 ? 'go' : (asked > 0 ? 'wait' : 'miss');
  const line = {
    go: [t('comingTo'), t('comingSub')],
    wait: [t('almost'), t('almostSub')],
    miss: [t('missed'), t('missedSub')],
  }[state];
  const fill = (x) => x.replace('{o}', office.name)
    .replace('{n}', String(state === 'go' ? asked : short))
    .replace('{m}', String(min));
  return (
    <div className={`mg-verdict ${state}`}>
      <img src={img(state === 'go' ? 'basket' : state === 'wait' ? 'hug' : 'empty')} alt="" />
      <div>
        <b>{fill(line[0])}</b>
        <p>{fill(line[1])}</p>
      </div>
    </div>
  );
}

/* ------------------------------ the tab ---------------------------------- */

/* The portal read is owned by the tab above, because the roles it carries
   decide which screens exist at all — fetching it a second time here would
   ask the same question twice to draw one of its own answers. */
export default function EggPortal({ d, reload: load, lang, toast }) {
  /* 6.2.1 asks for a tick before the button, so agreeing is a deliberate
     act rather than the thing that happens when you press the only button
     on the screen. */
  const [ticked, setTicked] = useState(false);
  const t = useCallback((k) => (L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);
  const img = (n) => `${import.meta.env.BASE_URL}moraegg/${n}.webp`;

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
      toast?.(j.error === 'bad_reason' ? t('reasonNeeded') : t('failed'));
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

  return (
    <div className="eg-p2">

      {/* ------------------------------ left ------------------------------ */}
      <div className="eg-p2-l">

        {/* Her artwork, shown whole. Each picture carries its own words and
            its own background, so the page never crops one.

            Stood down while the 初回の受付スタート card is up: that one has
            the dates in it and is the thing to read, and two pictures
            stacked in one column make the reader choose between them. */}
        {!d.firstRound && <img src={img('hens-well')} alt="" className="mg-pic mg-strip mg-opt" />}

        {/* 「今週はこの事務所にタマゴが届きます！」 — the thing most people
            open this page to find out, so it is the first thing on it.

            One card, not one per office. Every office used to get its own,
            which made four stacked announcements of which three were about
            somewhere the reader is not going. The 事務所対決 beside this
            says how all of them are doing; this says how YOURS is. */}
        {(() => {
          const mineName = mine?.office || d.offices.find((o) => o.minPacks > 0)?.name;
          const o = d.offices.find((x) => x.name === mineName);
          return o ? <Verdict office={o} lang={lang} t={t} img={img} /> : null;
        })()}

        {/* 佐野:「毎週のルールをリクエストページに出してほしい」. It used to
            read 発送日 / 申請締切 / 受取期限 as three loose dates, which told
            you when but never what happens in between. Four steps in the
            order they happen, each with this week's real date on it. */}
        {/* Her artwork says the rule; the steps under it say this week's
            dates. Same pairing as the harvest — the picture is what people
            look at, the live dates are what they act on, and swapping the
            picture is how the rule changes when the schedule does.

            初回の受付スタート while the first shipment is the one open, the
            ordinary weekly card after that. Wide beside a desk, square on
            a phone: the two are the same drawing laid out for the shape of
            the screen, so neither is a crop of the other. */}
        {d.firstRound ? (
          /* 初回の受付スタート. She drew this one square only, so it is shown
             square at every width rather than cropped into a banner — the
             dates are inside the picture and a crop would take them. */
          <img src={img('first-round')} alt={t('schedHead')} className="mg-pic mg-sched-sq" />
        ) : (
          <picture className="mg-sched-pic">
            <source media="(min-width:620px)" srcSet={img('week-strip')} />
            <img src={img('week-schedule')} alt={t('schedHead')} className="mg-pic mg-sched-sq" />
          </picture>
        )}

        <div className="card eg-sched">
          {/* Her 初回 card already prints 締切・発送・到着・受け取り, so the
              four boxes under it would be the same four dates twice. One
              line instead — and it is the computed one, so if the picture
              is ever left behind by a change of schedule the dates beneath
              it are still the ones the system will act on. */}
          {d.firstRound ? (
            <p className="eg-sched-one">
              <span><em>{t('stepDeadline')}</em><b>{md(d.week.deadline.date, lang)} {d.week.deadline.hour}:00</b></span>
              <span><em>{t('stepShip')}</em><b>{md(d.week.shipDay, lang)}</b></span>
              <span><em>{t('stepArrive')}</em><b>{md(d.week.arrive, lang)}</b></span>
              <span><em>{t('stepPickup')}</em><b>{md(d.week.pickup, lang)}</b></span>
            </p>
          ) : (
            <ol className="eg-steps">
              <li className="now">
                <em>{t('stepDeadline')}</em>
                <b>{md(d.week.deadline.date, lang)} {d.week.deadline.hour}:00</b>
              </li>
              <li><em>{t('stepShip')}</em><b>{md(d.week.shipDay, lang)}</b></li>
              <li><em>{t('stepArrive')}</em><b>{md(d.week.arrive, lang)}</b></li>
              <li><em>{t('stepPickup')}</em><b>{md(d.week.pickup, lang)}</b></li>
            </ol>
          )}
          <p className="eg-sched-r">{t('ruleLine')}</p>
          {d.week.shifted && <p className="eg-sched-h">{t('monHoliday')}</p>}
        </div>

        {!d.consented && (
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

        {d.consented && !d.offices.length && (
          <div className="card"><p className="muted sm">{t('noOffice')}</p></div>
        )}

        {d.consented && !!d.offices.length && !d.open && !mine && (
          <div className="card eg-shut">
            <img src={img('empty')} alt="" />
            <div>
              <strong>{t('closed')}</strong>
              <p className="muted sm">{t('closedNote')}</p>
            </div>
          </div>
        )}

        {d.consented && !!d.offices.length && showForm && (
          <>
            <div className="sechead"><span>{t('request')}</span></div>
            <div className="card eg-req">
              <div className="eg-q">{t('where')}</div>
              <div className="eg-opts">
                {d.offices.map((o) => (
                  <button
                    key={o.name} type="button"
                    className={`eg-opt${form.office === o.name ? ' on' : ''}`}
                    onClick={() => setForm({ ...form, office: o.name })}
                  >
                    {o.name}
                    {o.address && <small>{o.address}</small>}
                  </button>
                ))}
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

              <div className="eg-acts">
                <button
                  className="btn primary" disabled={busy || !form.office || needReason}
                  onClick={sendRequest}
                >{busy ? t('sending') : mine ? t('update') : t('send')}</button>
                {mine && <button className="btn ghost" disabled={busy} onClick={dropRequest}>{t('cancel')}</button>}
              </div>
              {needReason && <p className="eg-warn sm">{t('reasonNeeded')}</p>}
              <p className="muted sm">{t('canChange')}</p>
            </div>
          </>
        )}

        {mine && !editing && (
          <>
            <div className="sechead"><span>{t('mine')}</span></div>
            <div className="card eg-mystat">
              {/* A sticker on the card, in the row rather than floating over
                  it: absolutely positioned it landed on the heading above
                  and on the button beside it, depending on the width. */}
              {(status === 'confirmed' || status === 'picked') && (
                <img
                  src={img(status === 'picked' ? 'thankyou-egg' : 'seal-round')}
                  alt="" className="eg-stamp"
                />
              )}
              <span className={`pill ${status === 'missed' || status === 'expired' ? 'warn'
                : status === 'received' ? '' : 'ok'}`}>
                {t(`st_${status}`)}
              </span>
              <div className="eg-mystat-v">
                <b>{mine.office}</b>
                <i>/</i>
                <b>{status === 'confirmed' || status === 'picked'
                  ? t('gotPacks').replace('{n}', String(mine.got))
                  : `${mine.packs} ${t('pack')}`}</b>
              </div>
              {status === 'missed' && <p className="muted sm">{t('missedNote')}</p>}
              {status === 'expired' && <p className="muted sm">{t('expiredNote')}</p>}
              <div className="eg-acts">
                {d.open && <button className="btn" onClick={() => setEditing(true)}>{t('update')}</button>}
                {status === 'confirmed' && (
                  <button
                    className="btn primary" disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await api('/pickup', 'POST', { id: mine.id });
                      setBusy(false); load();
                    }}
                  >{t('collect')}</button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Once there are packs waiting, where to walk to is the next thing
            this person needs — and the left of the screen is otherwise a
            card and a lot of nothing. */}
        {(status === 'confirmed' || status === 'picked') && (() => {
          const o = d.offices.find((x) => x.name === mine.office);
          return o && (o.address || o.contactName) ? (
            <>
              <div className="sechead"><span>{t('whereTo')}</span></div>
              <div className="card eg-where">
                <b>{o.name}</b>
                {o.address && <span>{o.address}</span>}
                {o.contactName && <em>{t('contact')}：{o.contactName}</em>}
                <span className="eg-where-by">{t('pickupBy')} {md(d.week.pickup, lang)}</span>
              </div>
            </>
          ) : null;
        })()}

        {!!d.history?.length && (
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
      </div>

      {/* ------------------------------ right ----------------------------- */}
      <div className="eg-p2-r">
        {/* 佐野:「丹波の取れ高をもっと目立たせてほしい」 — her artwork is the
            heading, so the harvest announces itself before any number is
            read. Swappable like the rest: the file is what changes when
            the schedule does, not this screen. */}
        <img src={img('harvest-vs')} alt={t('race')} className="mg-pic mg-vs-pic" />
        <div className="card">
          <OfficeRace
            offices={d.offices} packs={d.harvestPacks} lang={lang} t={t} img={img}
          />
        </div>

        <div className="sechead"><span>{t('byDay')}</span></div>
        <div className="card">
          <Race
            harvest={d.harvest} week0={d.week0} packs={d.harvestPacks}
            want={d.totals.packs} today={d.today} lang={lang} t={t} img={img}
          />
          {/* 事務所の内訳 used to sit beside this as a list of the same
              numbers the 事務所対決 above now draws. Two places to read one
              thing is one too many, so only 目的 stays — it is the one
              nothing else reports. */}
          <div>
            <h3 className="eg-ch">{t('byPurpose')}</h3>
            <ul className="eg-mini eg-mini2">
              {d.totals.purposes.map((p) => (
                <li key={p.id}><span>{lang === 'ja' ? p.ja : p.en}</span><b>{p.count}</b></li>
              ))}
            </ul>
          </div>
        </div>

      </div>

      {/* News from the coop, and the only thing on this screen nobody is
          here to do. On a phone it goes to the bottom, under the dates and
          the request; beside them on a desk, where it costs nothing. */}
      <div className="eg-p2-news">
        <div className="sechead"><span>{t('coopNews')}</span></div>
        <img src={img('coop-news')} alt="" className="mg-pic" />
      </div>
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
export function EggFarm({ lang, toast }) {
  const t = useCallback((k) => (L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);
  const img = (n) => `${import.meta.env.BASE_URL}moraegg/${n}.webp`;
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);

  const bump = useCallback(async (delta) => {
    setBusy(true);
    try {
      const res = await fetch(`${apiRoot()}/egg/harvest`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(delta === null ? { packs: 0 } : { delta }),
      });
      if (!res.ok) { toast?.(t('failed')); return; }
      setD(await res.json());
    } finally { setBusy(false); }
  }, [t, toast]);

  /* The first read is a no-op bump, so the screen and the register agree
     from the first paint rather than after the first tap. */
  useEffect(() => { bump(0); }, [bump]);

  if (!d) return <div className="pad muted">…</div>;
  const today = d.harvest.find((h) => h.day === d.day);

  return (
    <div className="eg-farm">
      {/* The picture matches the job: eggs in the nest box before any have
          been registered today, the day's haul once they have. Its speech
          bubble says 9個 — the live number is printed by the page below it,
          never drawn into the artwork, so the two can never disagree. */}
     <div className="eg-farm-l">
      <img
        src={img((today?.packs ?? d.packs) > 0 ? 'harvest-today' : 'about-to-lay')}
        alt="" className="mg-pic mg-strip"
      />
      <div className="sechead"><span>{t('farmHead')}</span></div>
      <div className="card eg-farm-c">
        <div className="eg-farm-now">
          <em>{t('todayIs')} {md(d.day, lang)}</em>
          <b>{today?.packs ?? d.packs}</b>
          <span>{t('pack')}</span>
        </div>
        <button className="btn primary eg-tap" disabled={busy} onClick={() => bump(1)}>
          {t('addPack')}
        </button>
        <button className="btn ghost" disabled={busy || !(today?.packs ?? d.packs)} onClick={() => bump(-1)}>
          {t('undo')}
        </button>
        <p className="muted sm">{t('farmNote')}</p>
      </div>
     </div>

     <div className="eg-farm-r">
      <div className="sechead">
        <span>{t('weekTotal')}</span>
        <span className="muted sm">{d.harvestPacks} {t('pack')}</span>
      </div>
      <div className="card">
        <ul className="eg-days">
          {d.harvest.map((h) => (
            <li key={h.day} className={h.day === d.day ? 'on' : ''}>
              <span>{md(h.day, lang)}</span>
              <b>{h.packs}</b>
            </li>
          ))}
          {!d.harvest.length && <li className="muted"><span>{t('noneYet')}</span><b>0</b></li>}
        </ul>
      </div>

      {/* 佐野's print artwork, offered where the person packing the cartons
          actually is. Opened in a tab and printed; nothing is generated. */}
      <div className="sechead"><span>{t('printables')}</span></div>
      <div className="card mg-print">
        {[['label-asadore', 'printLabel', 'printLabelNote'],
          ['seal-round', 'printSeal', 'printSealNote'],
          ['thankyou-egg', 'printThanks', 'printThanksNote']].map(([file, title, note]) => (
            <a key={file} href={img(file)} target="_blank" rel="noreferrer">
              <img src={img(file)} alt="" />
              <span><b>{t(title)}</b><span>{t(note)}</span></span>
            </a>
        ))}
      </div>
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
  const t = useCallback((k) => (L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);
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
     <div className="eg-off-l">
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
export function EggAdmin({ lang, toast, cfg = {}, setCfg, people = [], rules = [], onDone }) {
  const t = useCallback((k) => (L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);
  const [offices, setOffices] = useState([]);
  const [draft, setDraft] = useState({ name: '', address: '', contactId: '', active: true });
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
      <div className="sechead"><span>{t('offices')}</span></div>
      <div className="card">
        <ul className="eg-offs">
          {offices.map((o) => (
            <li key={o.name}>
              <b>{o.name}</b>
              <input
                className="eg-offs-a" defaultValue={o.address || ''} placeholder={t('address')}
                onBlur={(e) => e.target.value !== (o.address || '') && put({ ...o, address: e.target.value })}
              />
              <select
                value={o.contactId || ''}
                onChange={(e) => put({ ...o, contactId: e.target.value })}
              >
                <option value="">{t('contact')} —</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {/* 最低パック数: below this, no run is made to the office and
                  everybody who asked is told so. 0 means always ship. */}
              <input
                className="eg-offs-m" type="number" min={0} max={999}
                defaultValue={o.minPacks ?? 0} title={t('minPacks')}
                onBlur={(e) => Number(e.target.value) !== (o.minPacks ?? 0)
                  && put({ ...o, minPacks: Number(e.target.value) })}
              />
              <label className="eg-offs-on">
                <input
                  type="checkbox" checked={o.active}
                  onChange={(e) => put({ ...o, active: e.target.checked })}
                />
                <span>{t('activeQ')}</span>
              </label>
              <button className="btn ghost sm" onClick={() => drop(o.name)}>{t('remove')}</button>
            </li>
          ))}
        </ul>
        <p className="muted sm">{t('minPacks')}</p>
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
            onClick={async () => { await put(draft); setDraft({ name: '', address: '', contactId: '', active: true }); }}
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
              .replace('{rule}', (rules.find((r) => r.id === last.rule) || {})[lang === 'ja' ? 'ja' : 'en'] || last.rule)
              .replace('{n}', String(last.packs))}
          </p>
        )}
        <p className="muted sm">{t('drawNote')}</p>
      </div>

     </div>

     <div className="eg-adm-r">
      <div className="sechead"><span>{t('rule')}</span></div>
      <div className="card ad-set">
        <label className="fld"><span>{t('rule')}</span>
          <select
            value={cfg.egg?.rule || 'fcfs'}
            onChange={(e) => saveCfg({ rule: e.target.value })}
          >
            {rules.map((r) => <option key={r.id} value={r.id}>{lang === 'ja' ? r.ja : r.en}</option>)}
          </select>
        </label>
        <label className="fld"><span>{t('deadlineHour')}</span>
          <select
            value={String(cfg.egg?.deadlineHour ?? 9)}
            onChange={(e) => saveCfg({ deadlineHour: Number(e.target.value) })}
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
            type="date" defaultValue={cfg.egg?.firstShip || ''}
            onBlur={(e) => saveCfg({ firstShip: e.target.value || null })}
          />
          <small className="muted sm">{t('firstShipNote')}</small>
        </label>
        <label className="fld"><span>{t('maxPacks')}</span>
          <input
            type="number" min={1} max={99} defaultValue={cfg.egg?.maxPacks ?? 10}
            onBlur={(e) => saveCfg({ maxPacks: Number(e.target.value) })}
          />
        </label>
      </div>

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

export { L as EGG_P2_L, md as eggMd, Race as EggRace };
