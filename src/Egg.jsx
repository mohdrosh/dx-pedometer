/* ============================================================================
   モラエッグ 社内タマゴ配布ポータル — Phase 0：需要調査

   丹波の鶏の卵を、福利厚生として正社員に無料配布する。その第一歩として、
   「どこで受け取りたいか」「足りないときどう配るか」を匿名で聞く。

   佐野:「Phase 0 は単独で使えるよう、最小構成で早めに出す」 — so this is
   the survey and the result, and nothing of Phase 1 or 2. Two questions,
   under a minute, and a chart everyone can watch fill up.

   The anonymity is kept in src/egg.js and the routes, not here: this screen
   cannot show who answered what because nothing it can call will tell it.
   What it does owe the reader is honesty about that, so the promise is
   printed on the form rather than left to be assumed.
   ========================================================================= */

import React, { useCallback, useEffect, useState } from 'react';
import { apiRoot } from './storage';
import EggSignup from './EggSignup';
import EggSettings from './EggSettings';
import { mg, art } from './moraegg-text.js';
import { MG_CSS } from './moraegg-theme';
import EggPortal, { EggFarm, EggOffice, EggAdmin } from './EggPortal';
import EggDish from './EggDish';

/* 佐野:「社長が『モラエッグ』に決めました。需要調査の問3（サイト名の投票）は
   不要になったので削除してください。」 So the name is settled, the question
   is gone, and nothing here waits on a vote to close any more. The votes
   already cast stay in the table — removing a question is not a reason to
   destroy what people answered. */
const L = {
  head: ['モラエッグ', 'Moraegg'],
  /* 朝採れ卵 — the spelling on 佐野's 11/12 label. */
  tagline: ['丹波の鶏舎から、朝採れ卵', 'Fresh eggs from the coop in Tamba'],
  back: ['マイページに戻る', 'Back to My Page'],
  logout: ['ログアウト', 'Sign out'],
  lede: ['丹波の鶏の卵を、正社員へ無料でお配りします。まずは希望をお聞かせください。',
    'Free eggs from our hens in Tamba, for full-time employees. First, tell us what you would like.'],
  survey: ['需要調査', 'Demand survey'],
  q1: ['問1　どこで受け取りたいですか', 'Q1  Where would you like to collect?'],
  /* 佐野:「受取場所は毎回のリクエストで選べるようになったので、問1は参考まで」 */
  q1Note: ['参考までの質問です。受け取り場所は毎回のリクエストで選べます。',
    'For reference only — you can choose where to collect every time you request.'],
  q2: ['問2　卵が足りないときの配り方は', 'Q2  How should eggs be shared when there are not enough?'],
  q2Note: ['こちらが本題です。みなさんの回答で配り方を決めます。',
    'This is the one that matters: your answers decide how eggs are shared.'],
  notNow: ['今は不要', 'Not just now'],
  comment: ['ご意見（任意）', 'Anything you would like to add (optional)'],
  commentPh: ['例：2パック欲しい日があります／受取時間を遅めにしてほしい',
    'e.g. some weeks I would want two packs / a later pickup time would help'],
  commentNote: ['こちらも匿名です。名前が分かる内容は書かないでください。',
    'Also anonymous. Please do not write anything that identifies you.'],
  commentsHead: ['みんなのご意見', 'What people added'],
  send: ['回答する', 'Send'],
  change: ['回答を変更する', 'Change my answer'],
  sending: ['送信中…', 'Sending…'],
  done: ['回答を受け付けました。ありがとうございます。', 'Thank you — your answer is in.'],
  answered: ['回答済み', 'Answered'],
  yours: ['あなたの回答', 'Your answer'],
  anon: ['匿名です。誰がどれを選んだかは、管理者を含め誰にも表示されません。',
    'Anonymous. Nobody, administrators included, can see who chose what.'],
  canChange: ['受付期間内なら、何度でも変更できます。',
    'You can change your answer as often as you like while the survey is open.'],
  results: ['みんなの回答', 'Everyone so far'],
  byOffice: ['受取希望場所', 'Preferred pickup location'],
  byRule: ['割当ルールの希望', 'Preferred allocation rule'],
  answers: ['回答', 'answers'],
  people: ['人', ''],
  noneYet: ['まだ回答がありません。最初のひとりになりませんか。',
    'No answers yet. Care to be the first?'],
  notNowCount: ['「今は不要」', '"Not just now"'],
  closed: ['受付期間外です', 'The survey is closed'],
  notYet: ['受付期間はまだ設定されていません', 'No survey window has been set yet'],
  openUntil: ['{from} 〜 {to} まで受付中', 'Open from {from} to {to}'],
  wasOpen: ['受付期間：{from} 〜 {to}', 'Survey window: {from} to {to}'],
  notYours: ['この調査は対象の方のみ回答できます。結果はどなたでもご覧いただけます。',
    'Only invited employees can answer this survey. The results are open to everyone.'],
  winning: ['最多', 'Most votes'],
  /* admin */
  admin: ['受付期間の設定', 'Survey window'],
  from: ['開始日', 'Opens'],
  to: ['締切日', 'Closes'],
  save: ['保存', 'Save'],
  saved: ['保存しました', 'Saved'],
  saveFailed: ['保存できませんでした', 'Could not save'],
  adminNote: ['期間を空にすると受付は閉じます。期間中は回答の追加・変更ができます。',
    'Leaving the dates empty keeps the survey shut. While it is open, people can answer and change their answer.'],
  adminAnon: ['管理者にも個別の回答は表示されません。集計のみ閲覧できます。',
    'Individual answers are not shown to administrators either — only the totals.'],
  /* sub-tabs. Phase 0 asked one question and was one screen; Phase 1 is
     four jobs done by four different sorts of people, and a person only
     ever sees the ones that are theirs. */
  /* 仕様書 3 の 4 つのタブ. 配布 became 配布状況 and gave up the request
     form to a tab of its own, which is what the four are. */
  /* The four tab labels are hers — tabHome / tabReq / tabRecipe / tabSet
     — and answered from the dictionary below rather than from here, so
     there is one wording and not two. These rows stay as the fallback
     for a dictionary that fails to load. */
  v_portal: ['配布状況', 'Distribution'],
  v_req: ['リクエスト', 'Request'],
  v_set: ['マイ設定', 'My settings'],
  v_dish: ['みんなの料理', 'Dishes'],
  v_farm: ['丹波', 'Harvest'],
  v_office: ['事業所', 'Office'],
  v_survey: ['需要調査', 'Survey'],
  v_admin: ['管理', 'Admin'],
};

/* ---------------------------------------------------------------------------
   One series, so one hue: these bars say "how many", not "which kind", and a
   chart that answers how-many in eight colours is answering a question
   nobody asked. The leader takes the brand blue and the rest a lighter step
   of the same hue, which is emphasis within one measure rather than a second
   series. Both were checked against the surface rather than chosen by eye —
   the obvious paler blue came out at 1.86:1, invisible on white; #5B8FC4 is
   the most recessive step that still clears 3:1.

   Every bar is labelled with its own count, so nothing here is carried by
   colour alone and the chart reads as a table for anyone who cannot see the
   difference between the two blues at all.
--------------------------------------------------------------------------- */

export default function EggTab({
  /* The roster came in here only to fill the 連絡担当者 dropdown on the
     admin screen. That field is gone, and a page about eggs has no
     other reason to hold every employee's name. */
  user, cfg = {}, setCfg, lang, setLang, toast, onBack, onSignOut,
}) {
  /* 仕様書 6: her dictionary is the Japanese, so a key she has written
     is answered from it and L is only the fallback. */
  const HERS = { v_portal: 'tabHome', v_req: 'tabReq', v_dish: 'tabRecipe', v_set: 'tabSet' };
  const t = useCallback((k) => (HERS[k] ? mg(HERS[k], lang)
    : L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);

  const [p1, setP1] = useState(null);
  /* p1 is null both while the read is in flight and when it comes back
     403 — somebody the portal is not for. The screen needs to tell those
     apart, and it used to do it by accident: the whole page waited on the
     survey's payload, which always arrived. With the survey gone there is
     a flag for it instead. */
  const [ready, setReady] = useState(false);
  /* Opens on the first tab — 配布状況, which now names the week's state
     (リクエスト受付中 / 確認中 / 確定).

     It opened on みんなの料理 because the dishes were made the front of
     the site back when the request form was a tab away and the photos
     were the part people came back to. With the request on the first
     tab, landing on the recipes means everybody arrives one tap from
     the thing they came to do, in the week when doing it matters.

     'portal' is not in the strip for everyone — a 丹波 account or
     somebody who has not registered has no such tab — and the line that
     picks `at` below already falls back to whatever their first tab
     actually is. So this is the preference, not an assumption. */
  const [view, setView] = useState('portal');

  /* Phase 1's read is done once here rather than inside each screen: the
     roles it carries are what decide which screens exist, so the tab needs
     it before it can draw its own strip of tabs. */
  const loadP1 = useCallback(async () => {
    try {
      const res = await fetch(`${apiRoot()}/egg/portal`, { credentials: 'same-origin' });
      setP1(res.ok ? await res.json() : null);
    } catch { /* leave the screen as it was */ } finally { setReady(true); }
  }, []);
  useEffect(() => { loadP1(); }, [loadP1]);

  /* 需要調査's read, its answer, its window editor and the two sets of
     bars it drew were all here. Every visit to モラエッグ fetched the
     survey and the whole page waited on it, including people who had no
     tab for it, which by the end was everybody. */

  if (!ready) return <div className="mg-page"><div className="pad muted">…</div></div>;

  const img = art;

  /* Which screens this person has. Not a menu of everything with the
     irrelevant ones greyed out — a 丹波 registrar and an office contact do
     different jobs, and showing each of them the other's screen is three
     taps of nothing on a phone. */
  /* The dishes are the front of the site: it is the part people come back
     to, and the only part that is different every week. 配布 is the job
     you came to do, so it is next. The survey answers one question once
     and then sits there, so it goes to the back. */
  /* 仕様書 3:「登録後は4つのタブで画面を切り替える」 — 配布状況、リクエスト、
     みんなの料理、マイ設定. In that order, because it is the order of a
     week: see what is happening, say what you want, show what you cooked,
     and only then change a setting. The role screens (丹波, 事務所, 管理)
     are not among the four; they belong to the people who have them.

     需要調査 is gone from the employees' strip. The company settled the
     allocation rules instead of the survey, so it no longer decides
     anything — the answers are still worth reading, so the screen stays
     and the route to it moves to 管理, where the committee is. */
  const mine4 = p1 && p1.signup;

  /* 佐野, 2026/11/06:「『配布状況』ではなく、『リクエスト受付中』なのか
     『確定』なのかが、はっきり分かるようにしたいです。確定＝受け付けは終了
     しました」.

     So the tab says which of those it is, rather than a word that is
     true in every state and therefore answers nothing. The question a
     person opens this page with is whether they can still ask for eggs,
     and now the tab strip answers it before they read a card.

     Four states, not two, because two would make the tab lie twice a
     week. 確認中 is the gap between the Monday deadline and the Tamba
     staff's final word — the page already distinguishes it (仕様書 4.7)
     and a tab reading 確定 above a card reading 確認中 is worse than the
     word she is replacing. And 受付前 is where the site sits until the
     21st: neither open nor decided, and not a state 配布状況 described
     either.

     The last line matters: after the Monday deadline the week is closed
     but may not be drawn for another three hours, and 受付前 there would
     be flatly wrong on the one morning everybody looks. */
  const portalTab = () => {
    if (!p1) return mg('tabHome', lang);
    if (p1.open) return mg('tabOpen', lang);
    if (p1.final) return mg('confirmed', lang);
    if (p1.decided) return mg('checking', lang);
    const from = p1.dates?.requestsFrom;
    if (from && p1.today && p1.today < from) return mg('tabPre', lang);
    return mg('checking', lang);
  };

  /* 丹波 is a job, not a membership. The shed's account exists to type in
     the morning's figure and nothing else — it does not request eggs, and
     it has no reason to be in みんなの料理 either. One tab, so there is no
     strip at all and the screen is simply the screen.

     Not for an administrator: they have no farm any more, and the test is
     written against the flag rather than against the account so that it
     keeps meaning what it says if that changes. */
  const farmOnly = !!p1?.role?.farm && !user?.admin;

  const views = [
    /* 配布状況 and リクエスト were two tabs until 2026/11/06. They were
       built from one component and differed, on most days, by one panel
       — so a person read the same page twice looking for the difference,
       and the thing they came to do was behind a tab that looked like
       the one they were already on. One page now. */
    ...(mine4 && !farmOnly ? [['portal', portalTab()]] : []),
    ...(p1 && !farmOnly ? [['dish', t('v_dish')]] : []),
    ...(mine4 && !farmOnly ? [['settings', t('v_set')]] : []),
    ...(p1?.role?.farm ? [['farm', t('v_farm')]] : []),
    ...(p1?.role?.contactFor?.length || user?.admin ? [['office', t('v_office')]] : []),
    ...(user?.admin ? [['admin', t('v_admin')]] : []),
    /* 需要調査 was here. It was asked once, in October, before the site
       existed: where would you collect, and how should eggs be shared
       when there are not enough. The company wrote the allocation rules
       itself on 11/03 rather than take the survey's answer, so it decided
       nothing in the end, and the window has been shut ever since — it
       was a page of results nobody was going back to. The answers, the
       votes and the comments are untouched in the database; only the way
       in is gone. */
  ];
  if (!views.length) views.push(['dish', t('v_dish')]);
  const at = views.some(([k]) => k === view) ? view : views[0][0];

  /* The signed-in person's name, for the line under the header. The
     session is the only thing that knows it — it is never read from a
     request body, and it is not in the portal payload either, which
     carries the week and not the reader. */
  const me = (user?.name || '').trim();

  return (
    <div className="mg-page">

      {/* 佐野:「マイページからリンクで開く別ページに。ただし『マイページに戻る』
          ボタンは残してください。」 — so this page has a header of its own, and
          the way back is the first thing on it rather than the last. */}
      <header className="mg-hdr">
        {onBack && (
          <button type="button" className="mg-back" onClick={onBack} aria-label={t('back')}>
            <i aria-hidden="true">←</i>
            <span>{t('back')}</span>
          </button>
        )}
        <div className="mg-brand">
          <img src={img('seal-round')} alt="" className="mg-seal" />
          <div>
            <h1>{t('head')}</h1>
            <p>{t('tagline')}</p>
          </div>
        </div>
        <div className="mg-hdr-r">
          {setLang && (
            <button type="button" className="mg-mini" onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>
              {lang === 'ja' ? 'EN' : '日本語'}
            </button>
          )}
          {onSignOut && (
            <button type="button" className="mg-mini" onClick={onSignOut}>{t('logout')}</button>
          )}
        </div>
      </header>

      {/* 仕様書 4.1:「社員は、参加登録が済むまで参加登録の画面だけを見る」.
          A gate, not a tab — until somebody registers there is nothing
          else here for them, so the tab strip is not drawn either.

          Only for people the eggs are for. An administrator, a 丹波
          registrar and an office contact all reach this page to do a job
          that has nothing to do with collecting a pack, and sending them
          through a sign-up for themselves would stop them doing it. */}
      {p1 && !p1.signup && !user?.admin && !p1.role?.farm
        && !p1.role?.contactFor?.length ? (
          <div className="mg-body">
            <EggSignup
              lang={lang} user={user} dates={p1.dates} img={img}
              /* 「再度正しい社員番号を入力してください」— the way back to a
                 field that takes an employee number is the sign-in
                 screen, so the sign-up needs the same handler the header
                 uses. */
              onSignOut={onSignOut}
              offices={p1.officeRows || []}
              api={async (path, method, body) => {
                try {
                  const res = await fetch(`${apiRoot()}/egg${path}`, {
                    method,
                    headers: { 'content-type': 'application/json' },
                    credentials: 'same-origin',
                    body: body ? JSON.stringify(body) : undefined,
                  });
                  return await res.json();
                } catch { return { error: 'failed' }; }
              }}
              /* Only on the way out. Reloading the portal the moment the
                 save lands lifts the gate, unmounts this component and
                 throws away 「登録が完了しました」 — which is the screen
                 that tells people requests open on the 21st. */
              onDone={(signup, go) => { if (go) { loadP1(); setView('portal'); } }}
            />
          </div>
        ) : (
        <>
      {/* Who is signed in, the way マイページ says it — 名前／事業所, in the
          same 名前／所属 shape the pedometer's header uses, so somebody
          moving between the two reads the same line twice rather than
          learning a second one. 佐野's header is the site's name and is
          centred; this is the reader's own name, so it sits with the tabs
          where the page becomes theirs.

          事業所 is the 受取場所 here, which is the one fact about an
          account worth checking at a glance — it decides where the pack
          turns up. Left off for an administrator or the 丹波 staff, who
          have no pickup office of their own. */}
      {(views.length > 1 || me) && (
        <div className="mg-subbar">
          {views.length > 1 ? (
            <nav className="eg-sub">
              {views.map(([k, label]) => (
                <button
                  key={k} type="button" className={at === k ? 'on' : ''}
                  onClick={() => setView(k)}
                >{label}</button>
              ))}
            </nav>
          ) : <span />}
          {me && (
            <p className="mg-me">
              <b>{me}</b>
              {p1?.signup?.office && <span>／{p1.signup.office}</span>}
            </p>
          )}
        </div>
      )}

      <div className="mg-body">
      {/* `all`: what is happening this week and what you do about it, on
          one screen. No onGo — it crossed to a tab that no longer
          exists. */}
      {at === 'portal' && (
        <EggPortal d={p1} reload={loadP1} lang={lang} toast={toast} screen="all" />
      )}
      {at === 'settings' && (
        <EggSettings d={p1} reload={loadP1} lang={lang} toast={toast} img={img} />
      )}
      {at === 'dish' && <EggDish lang={lang} toast={toast} />}
      {at === 'farm' && <EggFarm lang={lang} toast={toast} />}
      {at === 'office' && <EggOffice lang={lang} toast={toast} />}
      {at === 'admin' && (
        <EggAdmin
          lang={lang} toast={toast} cfg={cfg} setCfg={setCfg}
          onDone={loadP1} today={p1?.today || null}
        />
      )}

      </div>
        </>
      )}
    </div>
  );
}

/* The look lives in its own file; this page is the only thing wearing it. */
export const EGG_CSS = MG_CSS;
