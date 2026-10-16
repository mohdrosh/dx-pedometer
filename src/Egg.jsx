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
import { apiRoot } from './storage';
import { NOT_NOW } from './egg.js';

const L = {
  head: ['タマゴ配布', 'Egg distribution'],
  lede: ['丹波の鶏の卵を、正社員へ無料でお配りします。まずは希望をお聞かせください。',
    'Free eggs from our hens in Tamba, for full-time employees. First, tell us what you would like.'],
  survey: ['需要調査', 'Demand survey'],
  q1: ['問1　どこで受け取りたいですか', 'Q1  Where would you like to collect?'],
  q2: ['問2　卵が足りないときの配り方は', 'Q2  How should eggs be shared when there are not enough?'],
  notNow: ['今は不要', 'Not just now'],
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
  adminNote: ['期間を空にすると受付は閉じます。期間中は回答の追加・変更ができます。',
    'Leaving the dates empty keeps the survey shut. While it is open, people can answer and change their answer.'],
  adminAnon: ['管理者にも個別の回答は表示されません。集計のみ閲覧できます。',
    'Individual answers are not shown to administrators either — only the totals.'],
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

export default function EggTab({ user, cfg = {}, setCfg, lang, toast }) {
  const t = useCallback((k) => (L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);

  const [d, setD] = useState(null);
  const [office, setOffice] = useState('');
  const [rule, setRule] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [win, setWin] = useState({ from: '', to: '' });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiRoot()}/egg/survey`, { credentials: 'same-origin' });
      if (!res.ok) return;
      const j = await res.json();
      setD(j);
      if (j.mine) { setOffice(j.mine.office); setRule(j.mine.rule); }
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
        body: JSON.stringify({ office, rule }),
      });
      if (!res.ok) { toast?.(t('closed')); return; }
      const j = await res.json();
      setD((p) => ({ ...p, mine: j.mine, results: j.results }));
      setEditing(false);
      toast?.(t('done'));
    } catch { toast?.(t('closed')); } finally { setBusy(false); }
  };

  const saveWindow = async () => {
    const next = { ...cfg, egg: { ...(cfg.egg || {}), from: win.from, to: win.to } };
    await setCfg?.(next);
    toast?.(t('saved'));
    load();
  };

  const officeRows = useMemo(() => (d?.results?.offices || [])
    .map((o) => ({ key: o.office, label: o.office, count: o.count })), [d]);
  const ruleRows = useMemo(() => (d?.results?.rules || [])
    .map((r) => ({ key: r.id, label: lang === 'ja' ? r.ja : r.en, count: r.count })), [d, lang]);

  if (!d) return <div className="tabbody"><div className="pad muted">…</div></div>;

  const answered = !!d.mine;
  const showForm = d.canAnswer && d.open && (!answered || editing);
  const total = d.results?.answers || 0;
  const leadOffice = officeRows.find((r) => r.count > 0)?.key;
  const img = (name) => `${import.meta.env.BASE_URL}moraegg/${name}.webp`;

  return (
    <div className="tabbody eg-page">

      <div className="eg-hero">
        <img src={img(answered ? 'hatch' : 'hug')} alt="" className="eg-mascot" />
        <div>
          <h2>{t('head')}</h2>
          <p className="muted sm">{t('lede')}</p>
          {d.window && (
            <p className="eg-win">
              {(d.open ? t('openUntil') : t('wasOpen'))
                .replace('{from}', d.window.from).replace('{to}', d.window.to)}
            </p>
          )}
          {!d.window && <p className="eg-win">{t('notYet')}</p>}
        </div>
      </div>

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

      <div className="eg-cols">
        <div className="eg-form">
          {showForm && (
            <>
              <div className="sechead"><span>{t('survey')}</span></div>
              <div className="card">
                <p className="eg-anon">{t('anon')}</p>

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

                <div className="eg-q">{t('q2')}</div>
                {/* Nobody can vote on 前回落選者優先 without being told what
                    it means, so each rule carries its own one-line summary
                    and the trade-off the spec records for it. */}
                <div className="eg-rules">
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

                <button
                  className="btn primary big" disabled={!office || !rule || busy}
                  onClick={send}
                >{busy ? t('sending') : t('send')}</button>
                <p className="muted sm mt8">{t('canChange')}</p>
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
                </div>
                {d.open && (
                  <button className="btn" onClick={() => setEditing(true)}>{t('change')}</button>
                )}
              </div>
              {/* Once answered the left of the screen had nothing in it but
                  a one-line card, which reads as a page that failed to load
                  rather than a job that is done. */}
              <div className="card eg-thanks">
                <img src={img('hatch')} alt="" />
                <div>
                  <strong>{t('done')}</strong>
                  <p className="muted sm">{t('anon')}</p>
                  {d.open && <p className="muted sm">{t('canChange')}</p>}
                </div>
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
        </div>

        <div className="eg-res">
          <div className="sechead">
            <span>{t('results')}</span>
            <span className="muted sm">{total} {t('answers')}</span>
          </div>
          <div className="card">
            {total === 0
              ? (
                <div className="eg-shut">
                  <img src={img('empty')} alt="" />
                  <p className="muted sm">{t('noneYet')}</p>
                </div>
              )
              : (
                <>
                  {/* A single measure — how many people — so the heading
                      names the series and there is no legend to read. */}
                  <h3 className="eg-ch">{t('byOffice')}</h3>
                  <Bars rows={officeRows} total={total} lead={leadOffice} t={t} />
                  {/* 今は不要 is an answer but not a destination, so it is
                      reported beside the chart rather than ranked inside it:
                      top of the bars is read as "ship here first". */}
                  {d.results.notNow > 0 && (
                    <p className="eg-nn">{t('notNowCount')} <b>{d.results.notNow}</b></p>
                  )}

                  <h3 className="eg-ch">{t('byRule')}</h3>
                  <Bars rows={ruleRows} total={total} lead={d.results.topRule} t={t} />
                  {d.results.topRule && (
                    <p className="eg-nn">
                      {t('winning')}：
                      <b>{(d.rules.find((r) => r.id === d.results.topRule) || {})[lang === 'ja' ? 'ja' : 'en']}</b>
                    </p>
                  )}
                </>
              )}
          </div>
          <div className="eg-basket"><img src={img('basket')} alt="" /></div>
        </div>
      </div>
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
  border-left:3px solid var(--brand);padding:8px 11px;margin:0 0 14px}
.eg-q{font-size:14px;font-weight:600;margin:14px 0 9px}

.eg-opts{display:flex;flex-wrap:wrap;gap:7px}
.eg-opt{padding:9px 15px;border:1px solid var(--rule-2);background:#fff;
  font-size:14px;color:var(--ink);border-radius:999px}
.eg-opt:hover{border-color:var(--brand);color:var(--brand)}
.eg-opt.on{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
.eg-opt.none{color:var(--dim)}
.eg-opt.none.on{background:var(--ink-2);border-color:var(--ink-2);color:#fff}

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
.eg-ch{font-size:12.5px;font-weight:600;color:var(--ink-2);margin:4px 0 9px}
.eg-ch + .eg-bars{margin-bottom:16px}
.eg-bars{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.eg-bars li{display:grid;grid-template-columns:7.5em minmax(0,1fr) 2.4em;
  align-items:center;gap:9px}
.eg-bl{font-size:12.5px;color:var(--ink-2);text-align:right;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.eg-bt{display:block;height:17px;background:var(--hair)}
.eg-bt i{display:block;height:100%;background:#5B8FC4;
  border-radius:0 4px 4px 0;transition:width .3s ease}
.eg-bars li.lead .eg-bt i{background:var(--brand)}
.eg-bn{font-size:13px;font-variant-numeric:tabular-nums;color:var(--ink)}
.eg-nn{font-size:12.5px;color:var(--ink-2);margin:0 0 14px}
.eg-nn b{color:var(--ink);margin-left:4px}

.eg-basket{text-align:center;padding:14px 0 4px}
.eg-basket img{width:92px;height:92px;opacity:.9}

.eg-admin .fld{margin-bottom:10px}

@media(prefers-reduced-motion:reduce){.eg-bt i{transition:none}}

@media(min-width:1024px){
  .eg-page{max-width:1240px}
  .eg-cols{display:grid;grid-template-columns:minmax(0,1fr) 420px;
    align-items:start;column-gap:0}
  .eg-res{border-left:1px solid var(--rule);position:sticky;top:64px}
  .eg-hero{padding:18px}
  .eg-mascot{width:96px;height:96px}
  .eg-rules{grid-template-columns:1fr 1fr}
  .eg-admin{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
  .eg-admin .fld{margin-bottom:0}
  .eg-admin>p{flex:1 1 100%;margin:0}
}
`;
