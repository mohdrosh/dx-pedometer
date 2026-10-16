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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { S, apiRoot } from './storage';
import { NOT_NOW } from './egg.js';
import EggPortal, { EggFarm, EggOffice, EggAdmin } from './EggPortal';

const L = {
  head: ['タマゴ配布', 'Egg distribution'],
  lede: ['丹波の鶏の卵を、正社員へ無料でお配りします。まずは希望をお聞かせください。',
    'Free eggs from our hens in Tamba, for full-time employees. First, tell us what you would like.'],
  survey: ['需要調査', 'Demand survey'],
  q1: ['問1　どこで受け取りたいですか', 'Q1  Where would you like to collect?'],
  q2: ['問2　卵が足りないときの配り方は', 'Q2  How should eggs be shared when there are not enough?'],
  notNow: ['今は不要', 'Not just now'],
  q3: ['問3　このサイトの名前はどれがいい？', 'Q3  What should this site be called?'],
  q3note: ['いちばん票の多い名前が、受付終了後にこのサイトの名前になります。',
    'The name with the most votes becomes the site title once the survey closes.'],
  byName: ['サイト名の投票', 'Site name'],
  nameWins: ['このサイトの名前に決まりました', 'Chosen as the name of this site'],
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
  v_portal: ['配布', 'Eggs'],
  v_farm: ['丹波', 'Harvest'],
  v_office: ['事務所', 'Office'],
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
function Bars({ rows, total, lead, t }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="eg-bars">
      {rows.map((r) => {
        const share = total ? Math.round((r.count / total) * 100) : 0;
        return (
          <li key={r.key} className={r.key === lead ? 'lead' : ''}>
            <span className="eg-bl">{r.label}</span>
            {/* The track is the full width every time, so the bars share one
                baseline and the eye can compare lengths rather than guess. */}
            <span className="eg-bt" title={`${r.label} — ${r.count}${t('people')} (${share}%)`}>
              <i style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <b className="eg-bn">{r.count}</b>
          </li>
        );
      })}
    </ul>
  );
}

export default function EggTab({ user, cfg = {}, setCfg, lang, toast, people = [] }) {
  const t = useCallback((k) => (L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);

  const [d, setD] = useState(null);
  const [office, setOffice] = useState('');
  const [rule, setRule] = useState('');
  const [note, setNote] = useState('');
  const [sname, setSname] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [win, setWin] = useState({ from: '', to: '' });
  const [p1, setP1] = useState(null);
  const [view, setView] = useState('portal');

  /* Phase 1's read is done once here rather than inside each screen: the
     roles it carries are what decide which screens exist, so the tab needs
     it before it can draw its own strip of tabs. */
  const loadP1 = useCallback(async () => {
    try {
      const res = await fetch(`${apiRoot()}/egg/portal`, { credentials: 'same-origin' });
      setP1(res.ok ? await res.json() : null);
    } catch { /* leave the screen as it was */ }
  }, []);
  useEffect(() => { loadP1(); }, [loadP1]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiRoot()}/egg/survey`, { credentials: 'same-origin' });
      if (!res.ok) return;
      const j = await res.json();
      setD(j);
      if (j.mine) { setOffice(j.mine.office); setRule(j.mine.rule); setNote(j.mine.comment || ''); setSname(j.mine.name || ''); }
      setWin({ from: j.window?.from || '', to: j.window?.to || '' });
    } catch { /* a failed read leaves the screen as it was */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${apiRoot()}/egg/survey`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ office, rule, name: sname, comment: note }),
      });
      if (!res.ok) { toast?.(t('closed')); return; }
      const j = await res.json();
      setD((p) => ({ ...p, mine: j.mine, results: j.results }));
      setEditing(false);
      toast?.(t('done'));
    } catch { toast?.(t('closed')); } finally { setBusy(false); }
  };

  /* Both halves, or neither. setCfg is React state — on its own the dates
     live in this administrator's tab and nobody else ever sees them, which
     is exactly how this shipped: 設定 said the survey was open and every
     participant was still told there was no window. Everywhere else in the
     app that changes config writes the store and the state together. */
  const saveWindow = async () => {
    const next = { ...cfg, egg: { ...(cfg.egg || {}), from: win.from, to: win.to } };
    if (!await S.set('cfg', next)) { toast?.(t('saveFailed')); return; }
    setCfg?.(next);
    toast?.(t('saved'));
    load();
  };

  const officeRows = useMemo(() => (d?.results?.offices || [])
    .map((o) => ({ key: o.office, label: o.office, count: o.count })), [d]);
  const ruleRows = useMemo(() => (d?.results?.rules || [])
    .map((r) => ({ key: r.id, label: lang === 'ja' ? r.ja : r.en, count: r.count })), [d, lang]);
  const nameRows = useMemo(() => (d?.results?.names || [])
    .map((n) => ({ key: n.id, label: lang === 'ja' ? n.ja : n.en, count: n.count })), [d, lang]);

  if (!d) return <div className="tabbody"><div className="pad muted">…</div></div>;

  const answered = !!d.mine;
  const showForm = d.canAnswer && d.open && (!answered || editing);
  const total = d.results?.answers || 0;
  const leadOffice = officeRows.find((r) => r.count > 0)?.key;
  const won = !d.open && d.results?.topName
    && (d.names || []).find((n) => n.id === d.results.topName);
  const siteName = won ? (lang === 'ja' ? won.ja : won.en) : t('head');
  const img = (name) => `${import.meta.env.BASE_URL}moraegg/${name}.webp`;

  /* Which screens this person has. Not a menu of everything with the
     irrelevant ones greyed out — a 丹波 registrar and an office contact do
     different jobs, and showing each of them the other's screen is three
     taps of nothing on a phone. */
  const views = [
    ...(p1 ? [['portal', t('v_portal')]] : []),
    ...(p1?.role?.farm ? [['farm', t('v_farm')]] : []),
    ...(p1?.role?.contactFor?.length || user?.admin ? [['office', t('v_office')]] : []),
    ['survey', t('v_survey')],
    ...(user?.admin ? [['admin', t('v_admin')]] : []),
  ];
  const at = views.some(([k]) => k === view) ? view : views[0][0];

  return (
    <div className="tabbody eg-page">

      <div className="eg-hero">
        <img src={img(answered ? 'hatch' : 'hug')} alt="" className="eg-mascot" />
        <div>
          {/* 佐野:「受付終了までは『タマゴ配布』のままで」 — so the name the
              vote chose only appears once the vote is over, and the site is
              never renamed halfway through deciding. */}
          <h2>{siteName}</h2>
          <p className="muted sm">{t('lede')}</p>
          {/* The survey's dates are the survey's business. Printing them
              over the 配布 screen says the thing people are looking at
              closes on a date that has nothing to do with it. */}
          {at === 'survey' && d.window && (
            <p className="eg-win">
              {(d.open ? t('openUntil') : t('wasOpen'))
                .replace('{from}', d.window.from).replace('{to}', d.window.to)}
            </p>
          )}
          {at === 'survey' && !d.window && <p className="eg-win">{t('notYet')}</p>}
        </div>
      </div>

      {views.length > 1 && (
        <nav className="eg-sub">
          {views.map(([k, label]) => (
            <button
              key={k} type="button" className={at === k ? 'on' : ''}
              onClick={() => setView(k)}
            >{label}</button>
          ))}
        </nav>
      )}

      {at === 'portal' && <EggPortal d={p1} reload={loadP1} lang={lang} toast={toast} />}
      {at === 'farm' && <EggFarm lang={lang} toast={toast} />}
      {at === 'office' && <EggOffice lang={lang} toast={toast} />}
      {at === 'admin' && (
        <EggAdmin
          lang={lang} toast={toast} cfg={cfg} setCfg={setCfg}
          people={people} rules={d.rules || []} onDone={loadP1}
        />
      )}

      {at === 'survey' && (
       <>
      {user?.admin && (
        <>
          <div className="sechead"><span>{t('admin')}</span></div>
          <div className="card eg-admin">
            <label className="fld"><span>{t('from')}</span>
              <input type="date" value={win.from}
                onChange={(e) => setWin({ ...win, from: e.target.value })} />
            </label>
            <label className="fld"><span>{t('to')}</span>
              <input type="date" value={win.to}
                onChange={(e) => setWin({ ...win, to: e.target.value })} />
            </label>
            <button className="btn primary" onClick={saveWindow}>{t('save')}</button>
            <p className="muted sm">{t('adminNote')}</p>
            <p className="muted sm">{t('adminAnon')}</p>
          </div>
        </>
      )}

      {/* ---------------------------------------------------------------
          The survey, laid out across the width rather than down a column.

          It used to be form-left / results-right, which is the right shape
          for the 配布 screen and the wrong one here: three questions stacked
          in half a screen ran to two screenfuls of scrolling while the
          results pane beside them sat empty. The questions are wide things —
          eight offices, four rules, three names — so each one gets a row and
          spends it sideways, and the charts go underneath, three across.
          ------------------------------------------------------------- */}
      <div className="eg-sv">
        {showForm && (
          <>
            <div className="card eg-sv-form">
              <p className="eg-anon">{t('anon')}</p>

              <div className="eg-fq">
                <div className="eg-q">{t('q1')}</div>
                <div className="eg-opts">
                  {(d.offices || []).map((o) => (
                    <button
                      key={o} type="button"
                      className={`eg-opt${office === o ? ' on' : ''}`}
                      onClick={() => setOffice(o)}
                    >{o}</button>
                  ))}
                  <button
                    type="button"
                    className={`eg-opt none${office === NOT_NOW ? ' on' : ''}`}
                    onClick={() => setOffice(NOT_NOW)}
                  >{t('notNow')}</button>
                </div>
              </div>

              <div className="eg-fq">
                <div className="eg-q">{t('q2')}</div>
                {/* Nobody can vote on 前回落選者優先 without being told what
                    it means, so each rule carries its own one-line summary
                    and the trade-off the spec records for it. */}
                <div className="eg-rules eg-r4">
                  {(d.rules || []).map((r) => (
                    <button
                      key={r.id} type="button"
                      className={`eg-rule${rule === r.id ? ' on' : ''}`}
                      onClick={() => setRule(r.id)}
                    >
                      <strong>{lang === 'ja' ? r.ja : r.en}</strong>
                      <span>{lang === 'ja' ? r.howJa : r.howEn}</span>
                      <em className="pro">○ {lang === 'ja' ? r.proJa : r.proEn}</em>
                      <em className="con">△ {lang === 'ja' ? r.conJa : r.conEn}</em>
                    </button>
                  ))}
                </div>
              </div>

              {/* 問3 is three short cards and the comment box is one field,
                  so they share a row instead of each taking one. */}
              <div className="eg-fq-row">
                <div className="eg-fq">
                  <div className="eg-q">{t('q3')}</div>
                  <p className="muted sm eg-q3why">{t('q3note')}</p>
                  <div className="eg-rules eg-names eg-r3">
                    {(d.names || []).map((n) => (
                      <button
                        key={n.id} type="button"
                        className={`eg-rule${sname === n.id ? ' on' : ''}`}
                        onClick={() => setSname(n.id)}
                      >
                        <strong>{lang === 'ja' ? n.ja : n.en}</strong>
                        <span>{lang === 'ja' ? n.noteJa : n.noteEn}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 佐野:「投票するときに、意見があれば一緒に書いてもらって
                    ください」. Optional, and published without the office or
                    the rule beside it — the three together would often
                    narrow a comment down to one person. */}
                <div className="eg-fq eg-send">
                  <label className="fld eg-note"><span>{t('comment')}</span>
                    <textarea
                      rows={3} maxLength={200} value={note} placeholder={t('commentPh')}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <p className="muted sm eg-note-why">{t('commentNote')}</p>
                </div>
              </div>

              {/* The button belongs to the whole form, not to the column it
                  happened to sit in — put it in one and the other column
                  ends in a hole as deep as the button is tall. */}
              <div className="eg-sv-go">
                <p className="muted sm">{t('canChange')}</p>
                <button
                  className="btn primary big" disabled={!office || !rule || !sname || busy}
                  onClick={send}
                >{busy ? t('sending') : t('send')}</button>
              </div>
            </div>
          </>
        )}

        {answered && !editing && (
          <>
            <div className="sechead"><span>{t('yours')}</span></div>
            <div className="card eg-mine">
              <span className="pill ok">{t('answered')}</span>
              <div className="eg-mine-v">
                <b>{d.mine.office === NOT_NOW ? t('notNow') : d.mine.office}</b>
                <i>/</i>
                <b>{(d.rules.find((r) => r.id === d.mine.rule) || {})[lang === 'ja' ? 'ja' : 'en']}</b>
                {d.mine.name && (
                  <>
                    <i>/</i>
                    <b>{(d.names.find((n) => n.id === d.mine.name) || {})[lang === 'ja' ? 'ja' : 'en']}</b>
                  </>
                )}
              </div>
              {d.open && (
                <button className="btn" onClick={() => setEditing(true)}>{t('change')}</button>
              )}
              {d.mine.comment && <p className="eg-mine-note">{d.mine.comment}</p>}
            </div>
          </>
        )}

        {!d.canAnswer && (
          <>
            <div className="sechead"><span>{t('survey')}</span></div>
            <div className="card"><p className="muted sm">{t('notYours')}</p></div>
          </>
        )}

        {d.canAnswer && !d.open && !answered && (
          <>
            <div className="sechead"><span>{t('survey')}</span></div>
            <div className="card eg-shut">
              <img src={img('empty')} alt="" />
              <p className="muted sm">{d.window ? t('closed') : t('notYet')}</p>
            </div>
          </>
        )}

        <div className="sechead">
          <span>{t('results')}</span>
          <span className="muted sm">{total} {t('answers')}</span>
        </div>
        <div className="card">
          {total === 0
            ? (
              /* A quarter of a screen of white under a big mascot is not a
                 better way of saying "nobody yet" than one line is. */
              <div className="eg-none">
                <img src={img('empty')} alt="" />
                <p className="muted sm">{t('noneYet')}</p>
              </div>
            )
            : (
              /* Three charts of one measure, so each names its own series
                 and there is no legend anywhere. */
              <div className="eg-three">
                <div>
                  <h3 className="eg-ch">{t('byOffice')}</h3>
                  <Bars rows={officeRows} total={total} lead={leadOffice} t={t} />
                  {/* 今は不要 is an answer but not a destination, so it is
                      reported beside the chart rather than ranked inside it:
                      top of the bars is read as "ship here first". */}
                  {d.results.notNow > 0 && (
                    <p className="eg-nn">{t('notNowCount')} <b>{d.results.notNow}</b></p>
                  )}
                </div>
                <div>
                  <h3 className="eg-ch">{t('byRule')}</h3>
                  <Bars rows={ruleRows} total={total} lead={d.results.topRule} t={t} />
                  {d.results.topRule && (
                    <p className="eg-nn">
                      {t('winning')}：
                      <b>{(d.rules.find((r) => r.id === d.results.topRule) || {})[lang === 'ja' ? 'ja' : 'en']}</b>
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="eg-ch">{t('byName')}</h3>
                  <Bars rows={nameRows} total={total} lead={d.results.topName} t={t} />
                  {d.results.topName && (
                    <p className="eg-nn">
                      {d.open ? `${t('winning')}：` : `${t('nameWins')}：`}
                      <b>{(d.names.find((n) => n.id === d.results.topName) || {})[lang === 'ja' ? 'ja' : 'en']}</b>
                    </p>
                  )}
                </div>
              </div>
            )}
        </div>

        {!!d.results?.comments?.length && (
          <>
            <div className="sechead"><span>{t('commentsHead')}</span></div>
            <div className="card">
              <ul className="eg-notes">
                {d.results.comments.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          </>
        )}
      </div>
       </>
      )}
    </div>
  );
}

export const EGG_CSS = `
.eg-hero{display:flex;gap:16px;align-items:center;padding:16px 14px;
  border-bottom:1px solid var(--rule);background:var(--wash)}
.eg-mascot{width:84px;height:84px;flex:none}
.eg-hero h2{font-size:19px;font-weight:600;margin:0 0 3px}
.eg-win{font-size:12.5px;color:var(--brand);font-weight:600;margin:5px 0 0}

.eg-anon{font-size:12.5px;color:var(--ink-2);background:var(--brand-wash);
  border-left:3px solid var(--brand);padding:7px 11px;margin:0 0 13px}
.eg-q{font-size:14px;font-weight:600;margin:14px 0 9px}
.eg-fq .eg-q{margin-top:0}

.eg-opts{display:flex;flex-wrap:wrap;gap:7px}
.eg-opt{padding:9px 15px;border:1px solid var(--rule-2);background:#fff;
  font-size:14px;color:var(--ink);border-radius:999px}
.eg-opt:hover{border-color:var(--brand);color:var(--brand)}
.eg-opt.on{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
.eg-opt.none{color:var(--dim)}
.eg-opt.none.on{background:var(--ink-2);border-color:var(--ink-2);color:#fff}

/* Each question is a band of its own, so the rhythm down the form is the
   same whichever question you are on. */
.eg-fq{margin-bottom:14px}
.eg-fq:last-child{margin-bottom:0}
.eg-fq-row{display:grid;gap:14px}
.eg-send{display:flex;flex-direction:column;align-items:flex-start}
.eg-send .fld{width:100%}
.eg-send .btn.big{margin-top:2px}
.eg-three{display:grid;gap:4px}
.eg-sv-go{display:flex;align-items:center;gap:14px;flex-wrap:wrap;
  padding-top:13px;margin-top:3px;border-top:1px solid var(--hair)}
.eg-sv-go p{margin:0;order:2}
.eg-none{display:flex;align-items:center;gap:12px}
.eg-none img{width:52px;height:52px;opacity:.85;flex:none}
.eg-none p{margin:0}

.eg-q3why{margin:-4px 0 9px}
.eg-names .eg-rule{gap:2px}
.eg-rules{display:grid;gap:8px}
.eg-rule{display:grid;gap:1px;text-align:left;padding:11px 13px;
  border:1px solid var(--rule-2);background:#fff}
.eg-rule:hover{border-color:var(--brand)}
.eg-rule.on{border-color:var(--brand);background:var(--brand-wash);
  box-shadow:inset 3px 0 0 var(--brand)}
.eg-rule strong{font-size:14.5px}
.eg-rule span{font-size:12.5px;color:var(--ink-2)}
.eg-rule em{font-style:normal;font-size:11.5px}
.eg-rule em.pro{color:var(--go)}
.eg-rule em.con{color:var(--dim)}

.eg-mine{display:flex;align-items:center;gap:13px;flex-wrap:wrap}
.eg-mine-v{display:flex;align-items:baseline;gap:8px;margin-right:auto}
.eg-mine-v b{font-size:16px}
.eg-mine-v i{font-style:normal;color:var(--faint)}
.pill.ok{border:1px solid var(--go);color:var(--go);background:var(--go-wash);
  font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px}

.eg-note textarea{width:100%;padding:9px 11px;border:1px solid var(--rule);
  background:var(--field);border-radius:4px;font:inherit;font-size:13.5px;
  line-height:1.6;resize:vertical;outline:none}
.eg-note textarea:focus{border-color:var(--brand);background:#fff}
.eg-note-why{margin:-6px 0 14px}
.eg-mine-note{flex:1 1 100%;margin:6px 0 0;font-size:13px;color:var(--ink-2);
  padding-left:11px;border-left:3px solid var(--hair)}
.eg-notes{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.eg-notes li{font-size:12.5px;line-height:1.65;color:var(--ink);
  background:var(--wash);border-left:3px solid var(--rule-2);padding:7px 11px}

.eg-thanks{display:flex;gap:15px;align-items:center}
.eg-thanks img{width:92px;height:92px;flex:none}
.eg-thanks strong{display:block;font-size:14.5px;margin-bottom:4px}
.eg-thanks p{margin:0 0 3px}

.eg-shut{text-align:center;padding:10px 0}
.eg-shut img{width:104px;height:104px;opacity:.85}

/* ---- the chart --------------------------------------------------------
   One measure, one hue. Thin marks, one shared baseline, the count printed
   on every row so nothing depends on telling the two blues apart, and a
   2px gap between bars so adjacent rows never merge into one block.
----------------------------------------------------------------------- */
.eg-ch{font-size:12px;font-weight:600;color:var(--ink-2);margin:2px 0 7px}
.eg-ch + .eg-bars{margin-bottom:13px}
.eg-bars{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.eg-bars li{display:grid;grid-template-columns:7.2em minmax(0,1fr) 2.2em;
  align-items:center;gap:8px}
.eg-bl{font-size:12.5px;color:var(--ink-2);text-align:right;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.eg-bt{display:block;height:15px;background:var(--hair)}
.eg-bt i{display:block;height:100%;background:#5B8FC4;
  border-radius:0 4px 4px 0;transition:width .3s ease}
.eg-bars li.lead .eg-bt i{background:var(--brand)}
.eg-bn{font-size:13px;font-variant-numeric:tabular-nums;color:var(--ink)}
.eg-nn{font-size:12.5px;color:var(--ink-2);margin:0 0 14px}
.eg-nn b{color:var(--ink);margin-left:4px}

.eg-admin .fld{margin-bottom:10px}

@media(prefers-reduced-motion:reduce){.eg-bt i{transition:none}}

/* ======================= Phase 1：配布の運用 =============================
   Same idiom as the rest of the app after the compacting pass: one scale of
   type, 13px rows, no card inside a card, and nothing that makes a phone
   scroll past a decision it could have shown.
------------------------------------------------------------------------- */

/* the strip of screens. Four jobs, so four tabs — but only the ones that
   are this person's, which for most people means none of this is drawn. */
.eg-sub{display:flex;gap:2px;padding:0 14px;border-bottom:1px solid var(--rule);
  background:var(--wash);overflow-x:auto;scrollbar-width:none}
.eg-sub::-webkit-scrollbar{display:none}
.eg-sub button{padding:9px 14px;font-size:13px;color:var(--ink-2);
  background:none;border:0;border-bottom:2px solid transparent;white-space:nowrap}
.eg-sub button:hover{color:var(--brand)}
.eg-sub button.on{color:var(--brand);font-weight:600;border-bottom-color:var(--brand)}

/* the week at a glance: three facts on one line, not three cards */
.eg-wk{display:flex;flex-wrap:wrap;gap:4px 22px;padding:10px 13px}
.eg-wk div{display:flex;align-items:baseline;gap:7px}
.eg-wk em{font-style:normal;font-size:11.5px;color:var(--dim)}
.eg-wk b{font-size:13.5px;font-variant-numeric:tabular-nums}

.eg-terms ul{margin:8px 0 12px;padding-left:19px;display:grid;gap:4px}
.eg-terms li{font-size:13px;color:var(--ink-2);line-height:1.55}

.eg-opt small{display:block;font-size:10.5px;opacity:.75;font-weight:400}
.eg-row2{display:grid;gap:14px;margin-top:2px}
.eg-step{display:flex;align-items:center;gap:10px}
.eg-step b{font-size:19px;min-width:1.4em;text-align:center;
  font-variant-numeric:tabular-nums}
.eg-step .btn{width:36px;height:34px;padding:0;font-size:16px;line-height:1}
.eg-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.eg-warn{color:var(--warn);margin:6px 0 0}
.eg-req .fld{margin-top:12px}

.eg-mystat{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.eg-mystat-v{display:flex;align-items:baseline;gap:8px;margin-right:auto}
.eg-mystat-v b{font-size:15px}
.eg-mystat-v i{font-style:normal;color:var(--faint)}
.eg-mystat p{flex:1 1 100%;margin:0}
.pill.warn{border:1px solid var(--warn);color:var(--warn);background:var(--warn-wash);
  font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px}

.eg-where{display:grid;gap:3px}
.eg-where b{font-size:14px}
.eg-where span{font-size:12.5px;color:var(--ink-2)}
.eg-where em{font-style:normal;font-size:12.5px;color:var(--ink-2)}
.eg-where-by{color:var(--brand) !important;font-weight:600}

.eg-hist,.eg-days,.eg-mini,.eg-hand,.eg-offs{list-style:none;margin:0;padding:0}
.eg-hist li{display:grid;grid-template-columns:5.6em minmax(0,1fr) 4.2em 6.6em;
  align-items:center;gap:8px;padding:5px 0;font-size:12.5px;
  border-top:1px solid var(--hair)}
.eg-hist li:first-child{border-top:0}
.eg-hist b{font-variant-numeric:tabular-nums}
.eg-hist em{font-style:normal;color:var(--dim);text-align:right}

/* The two breakdowns sit side by side from phone width up: they are four
   short rows between them, and stacking them pushes the rest of the page
   down a third of a screen for nothing. */
@media(min-width:380px){.eg-p2 .eg-two{display:grid;grid-template-columns:1fr 1fr;column-gap:18px}}
.eg-mini li{display:flex;justify-content:space-between;gap:10px;padding:4px 0;
  font-size:12.5px;border-top:1px solid var(--hair)}
.eg-mini li:first-child{border-top:0}
.eg-mini b{font-variant-numeric:tabular-nums}

/* ---- 5.4 対決グラフ ----------------------------------------------------
   The stack is the week's harvest so far and the line is what has been
   asked for, so "are there enough" is whether one has reached the other.
   The mascot and the sentence beside it say the same thing without the
   chart, which is what makes it safe for the chart to be this small.
----------------------------------------------------------------------- */
.eg-race-top{display:flex;align-items:center;gap:13px;margin-bottom:12px}
.eg-race-top img{width:64px;height:64px;flex:none}
.eg-race-n{font-size:27px;font-weight:600;line-height:1;
  font-variant-numeric:tabular-nums}
.eg-race-u{font-size:13px;color:var(--dim);margin-left:6px}
.eg-race-s{font-size:12.5px;color:var(--warn);margin:4px 0 0;font-weight:600}
.eg-race-s.win{color:var(--go)}

.eg-race-ch{position:relative;display:grid;grid-template-columns:repeat(7,1fr);
  gap:5px;height:104px;padding-bottom:15px}
.eg-race-col{display:flex;flex-direction:column;justify-content:flex-end;
  position:relative}
/* The track is a guide, not a bar. At full strength seven empty days read
   as seven full ones and the day that actually has eggs in it is the odd
   one out; and fading the track fades the bar inside it, which is how the
   harvest ended up paler than the days with nothing in them. So: a pale
   wash set directly, a baseline to sit on, and the bar at full strength. */
.eg-race-track{position:relative;flex:1;background:var(--wash);
  border-bottom:1px solid var(--rule-2)}
.eg-race-seg{position:absolute;left:0;right:0;background:var(--brand);
  border-top:1px solid #fff;transition:height .3s ease}
.eg-race-col em{position:absolute;bottom:-15px;left:0;right:0;text-align:center;
  font-style:normal;font-size:10.5px;color:var(--dim)}
/* The target reads as a target: dashed, above the bars, labelled in place
   so nothing has to be matched to a legend. */
.eg-race-line{position:absolute;left:0;right:0;height:0;
  border-top:2px dashed var(--warn);pointer-events:none}
.eg-race-line b{position:absolute;right:0;top:-15px;font-size:10.5px;
  color:var(--warn);background:#fff;padding:0 3px;font-weight:600}
@media(prefers-reduced-motion:reduce){.eg-race-seg{transition:none}}

/* ---- 丹波 ------------------------------------------------------------- */
.eg-farm-c{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.eg-farm-now{display:flex;align-items:baseline;gap:7px;margin-right:auto}
.eg-farm-now em{font-style:normal;font-size:11.5px;color:var(--dim)}
.eg-farm-now b{font-size:30px;font-weight:600;font-variant-numeric:tabular-nums}
.eg-farm-now span{font-size:12.5px;color:var(--ink-2)}
/* Pressed with a thumb, often with one hand full of eggs. */
.eg-tap{min-height:48px;padding:0 26px;font-size:16px;font-weight:600}
.eg-farm-c>p{flex:1 1 100%;margin:0}
.eg-days li{display:flex;justify-content:space-between;padding:5px 0;
  font-size:12.5px;border-top:1px solid var(--hair)}
.eg-days li:first-child{border-top:0}
.eg-days li.on{font-weight:600;color:var(--brand)}
.eg-days b{font-variant-numeric:tabular-nums}

/* ---- 事務所 ----------------------------------------------------------- */
.eg-off-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 13px}
.eg-off-bar>span{margin-left:auto}
.eg-arr{display:flex;align-items:center;gap:12px}
.eg-arr-n{margin-left:auto;font-size:15px;font-variant-numeric:tabular-nums}
.eg-hand li{display:grid;grid-template-columns:1fr 5em auto;align-items:center;
  gap:10px;padding:6px 0;border-top:1px solid var(--hair)}
.eg-hand li:first-child{border-top:0}
.eg-hand-n{font-size:13.5px}
.eg-hand li.done .eg-hand-n{color:var(--dim);text-decoration:line-through}
.eg-hand b{font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.btn.sm{padding:4px 10px;font-size:12px}

/* ---- 管理 ------------------------------------------------------------- */
.eg-offs li{display:grid;grid-template-columns:7em minmax(0,1fr) 10em auto auto;
  align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--hair)}
.eg-offs li:first-child{border-top:0}
.eg-offs li>b{font-size:13.5px}
.eg-offs-on{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--ink-2)}
.eg-offs-add{display:grid;grid-template-columns:7em minmax(0,1fr) auto;gap:8px;
  margin-top:10px;padding-top:10px;border-top:1px solid var(--rule)}
.eg-draw{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.eg-draw-r{font-size:12.5px;color:var(--ink-2);margin:0}
.eg-draw>p.muted{flex:1 1 100%;margin:0}
.eg-adm textarea{width:100%;padding:9px 11px;border:1px solid var(--rule);
  background:var(--field);border-radius:4px;font:inherit;font-size:13px;
  line-height:1.6;resize:vertical;outline:none}

/* Phones get one column of everything; the 対決グラフ comes first because
   it is the answer to the question people open this for. */
.eg-p2{display:grid}
.eg-p2-r{order:-1}
.eg-off,.eg-adm{display:grid}

@media(min-width:900px){
  /* The survey spends the width instead of the height: the offices wrap
     along one row, the four rules sit in one, and 問3 shares a row with the
     comment box. Specific enough to beat the plain .eg-rules below. */
  .eg-sv .eg-rules.eg-r4{grid-template-columns:repeat(4,minmax(0,1fr))}
  .eg-sv .eg-rules.eg-r3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .eg-fq-row{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);
    column-gap:22px;align-items:start}
  .eg-three{grid-template-columns:repeat(3,minmax(0,1fr));column-gap:22px;
    align-items:start}
  /* 尼崎技術研修所, 前回落選者優先 and 丹波たまご便り are all seven
     characters; anything narrower cuts the only three labels that matter. */
  .eg-three .eg-bars li{grid-template-columns:7.2em minmax(0,1fr) 1.9em}
}

@media(min-width:1024px){
  .eg-page{max-width:1240px}
  .eg-two{display:grid;grid-template-columns:1fr 1fr;column-gap:20px;align-items:start}
  .eg-two .eg-bars li{grid-template-columns:6.2em minmax(0,1fr) 1.9em}
  .eg-hero{padding:11px 18px;gap:13px}
  .eg-mascot{width:62px;height:62px}
  .eg-hero h2{font-size:17px}
  .eg-rules{grid-template-columns:1fr 1fr}
  .eg-admin{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
  .eg-admin .fld{margin-bottom:0}
  .eg-admin>p{flex:1 1 100%;margin:0}

  /* 配布 gets the same two-pane shape as every other tab: what you do on
     the left, how the week is going on the right, and no scrolling to get
     from one to the other. */
  .eg-p2{grid-template-columns:minmax(0,1fr) 420px;align-items:start;column-gap:0}
  .eg-p2-r{order:0;border-left:1px solid var(--rule);position:sticky;top:64px}
  .eg-p2-l{padding-right:16px}
  .eg-row2{grid-template-columns:auto minmax(0,1fr);gap:22px}
  .eg-race-ch{height:124px}

  /* 事務所 and 管理 are two panes like every other tab. The panes are in
     the markup rather than placed by nth-of-type: a sechead and a card are
     both divs, so counting them picks the wrong elements the moment one
     of them is conditional. */
  .eg-off{grid-template-columns:minmax(0,340px) minmax(0,1fr);
    align-items:start;column-gap:0}
  .eg-adm{grid-template-columns:minmax(0,1fr) minmax(0,420px);
    align-items:start;column-gap:0}
  .eg-off-r,.eg-adm-r{border-left:1px solid var(--rule);position:sticky;top:64px}
  .eg-off-l,.eg-adm-l{padding-right:16px}
  .eg-off-bar{flex-direction:column;align-items:stretch}
  .eg-off-bar>span{margin-left:0}
  .eg-adm .ad-set{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
  .eg-adm .ad-set .fld:last-child{grid-column:span 2}
}
`;
