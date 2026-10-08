/* ============================================================================
   交通費精算書 — the month's journeys.

   The paper form is twenty-five ruled lines and three totals, and the thing
   that makes it tedious is that almost every trip is made twice: out in the
   morning, back in the evening, same stations the other way round. So the
   editor has a 復路を追加 button, and a 複製 for the day you did it again.
   That, and the fares, is most of the work.

   The one distinction the form really cares about is 通勤経路 — getting to
   work, versus travelling for work and being paid back. It is a single ○ on
   paper and two SUMIFs underneath, so here it is a labelled switch with the
   form's own wording under it rather than a column of circles.
   ========================================================================= */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { S, setLeaving } from './storage';
import { MAX_ROWS, totals, filled, travelKey, yenFmt } from './koutsuuhi-calc';

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
const pad2 = (n) => String(n).padStart(2, '0');

const L = {
  head: ['旅費精算', 'Expenses'],
  totals: ['当月合計', 'Month total'],
  tCommute: ['通勤交通費', 'Commuting'],
  tAdvance: ['立替交通費', 'Advanced for work'],
  tTotal: ['合計', 'Total'],
  listHead: ['交通費', 'Journeys'],
  add: ['+ 経路を追加', '+ Add a journey'],
  none: ['まだ入力がありません。「経路を追加」から1件ずつ入力してください。',
    'Nothing yet. Add your journeys one at a time.'],
  date: ['日付', 'Date'],
  fromSt: ['乗車地（発駅）', 'From'],
  toSt: ['降車地（着駅）', 'To'],
  depart: ['時刻', 'Time'],
  line: ['利用交通機関', 'Line'],
  linePh: ['例：JR、阪急、地下鉄', 'e.g. JR, Hankyu, Metro'],
  fare: ['運賃', 'Fare'],
  commute: ['通勤経路（○）', 'Commuting journey (○)'],
  commuteHelp: ['通勤交通費：通勤にかかる実費相当額。業務上の移動は○なしで立替交通費になります。',
    'On for getting to and from work. Leave it off for travel on company business, which is reimbursed separately.'],
  ret: ['復路を追加', 'Add the return'],
  dup: ['複製', 'Duplicate'],
  del: ['削除', 'Delete'],
  close: ['閉じる', 'Close'],
  download: ['交通費精算書をダウンロード', 'Download the expense form'],
  downloading: ['作成中…', 'Building…'],
  downloadFail: ['作成できませんでした', 'Could not build the file'],
  downloadNote: ['入力した内容をそのままの様式で書き出します。合計は Excel 側で計算されます。',
    'Writes what you entered into the usual form. Excel works the totals out when it opens.'],
  saving: ['保存中…', 'Saving…'],
  saved: ['保存しました', 'Saved'],
  saveFail: ['保存できませんでした', 'Could not save'],
  full: ['この様式は25件までです。26件目からは2枚目を作成してください。',
    'The form holds 25 journeys. Anything beyond that needs a second sheet.'],
  needFrom: ['乗車地を入力してください。', 'Please enter where you boarded.'],
  submit: ['交通費を提出', 'Submit expenses'],
  submitted: ['提出済', 'Submitted'],
  notSubmitted: ['未提出', 'Not submitted'],
  submitTitle: ['提出しますか？', 'Submit this month?'],
  submitBody: ['提出後はご自身で修正できません。修正が必要な場合は管理責任者へご連絡ください。',
    'You cannot edit it yourself afterwards. Ask your manager if a correction is needed.'],
  lockedNote: ['提出済みのため編集できません。', 'Submitted — no longer editable.'],
  cancel: ['キャンセル', 'Cancel'],
  nothing: ['入力がないため提出できません。', 'Nothing entered yet.'],
  yen: ['円', 'yen'],
  count: ['{n}件', '{n} journeys'],
};

/* A time as two native fields would be two taps; one is enough. Blank is a
   real answer here — plenty of receipts have no time on them. */
function Clock({ h, m, onChange, label, disabled }) {
  return (
    <label className="fld tr-time">
      <span>{label}</span>
      <input
        type="time" disabled={disabled}
        value={h == null ? '' : `${pad2(h)}:${pad2(m || 0)}`}
        onChange={(e) => {
          if (!e.target.value) { onChange(null, null); return; }
          const [nh, nm] = e.target.value.split(':').map(Number);
          onChange(nh, nm);
        }}
      />
    </label>
  );
}

export default function KoutsuuhiTab({ user, y, m, days, lang, toast, base = '' }) {
  const t = useCallback((k) => (L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);
  const pk = `${String(y % 100).padStart(2, '0')}${pad2(m)}`;
  const key = travelKey(pk, user.id);

  const [entry, setEntry] = useState(null);
  const [open, setOpen] = useState(-1);
  const [saveState, setSaveState] = useState('');
  const [busy, setBusy] = useState('');
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    let live = true;
    setEntry(null); setOpen(-1);
    S.get(key).then((e) => { if (live) setEntry(e || { rows: [] }); });
    return () => { live = false; };
  }, [key]);

  /* Saved the same way the timesheet is: a short debounce with a ceiling, so
     a long run of typing still reaches the server. */
  const latest = useRef(null);
  const timer = useRef(null);
  const oldest = useRef(0);
  const MAX_WAIT = 1500;

  const write = useCallback(async () => {
    timer.current = null; oldest.current = 0;
    setSaveState('saving');
    const ok = await S.set(key, { ...latest.current, updatedAt: Date.now() });
    setSaveState(ok ? 'saved' : 'error');
  }, [key]);

  const persist = useCallback((next) => {
    setEntry(next); latest.current = next;
    if (!oldest.current) oldest.current = Date.now();
    if (timer.current) clearTimeout(timer.current);
    if (Date.now() - oldest.current >= MAX_WAIT) { write(); return; }
    timer.current = setTimeout(write, 500);
    setSaveState('saving');
  }, [write]);

  useEffect(() => {
    const flush = () => {
      if (!timer.current || !latest.current) return;
      clearTimeout(timer.current); timer.current = null;
      setLeaving(key, { ...latest.current, updatedAt: Date.now() });
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    return () => window.removeEventListener('pagehide', flush);
  }, [key]);

  const rows = entry?.rows || [];
  const locked = !!entry?.submitted;
  const sum = useMemo(() => totals(rows), [rows]);
  const used = rows.filter(filled).length;

  const first = days[0]?.iso;
  const last = days[days.length - 1]?.iso;

  /* Stations and lines already typed this month, offered back as suggestions:
     the same four or five names come up every day. */
  const seen = useMemo(() => {
    const st = new Set(); const ln = new Set();
    rows.forEach((r) => { if (r.from) st.add(r.from); if (r.to) st.add(r.to); if (r.line) ln.add(r.line); });
    return { stations: [...st], lines: [...ln] };
  }, [rows]);

  const setRows = (next) => { if (!locked) persist({ ...entry, rows: next }); };
  const patch = (i, p) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const addRow = (seed = {}) => {
    if (locked) return;
    if (rows.length >= MAX_ROWS) { toast(t('full')); return; }
    const prev = rows[rows.length - 1];
    const next = [...rows, {
      date: seed.date || prev?.date || first,
      from: '', to: '', line: prev?.line || '', commute: prev?.commute ?? false,
      ...seed,
    }];
    setRows(next);
    setOpen(next.length - 1);
  };

  /* The return leg: the same journey the other way round, same day, same
     line, same fare. Times are left blank — they are the one thing that is
     genuinely different. */
  const addReturn = (i) => {
    const r = rows[i];
    if (!r?.from && !r?.to) { toast(t('needFrom')); return; }
    addRow({
      date: r.date, from: r.to, to: r.from, line: r.line,
      commute: r.commute, fare: r.fare,
    });
  };

  const duplicate = (i) => {
    const r = rows[i];
    addRow({ ...r, fromH: null, fromM: null, toH: null, toM: null });
  };

  const remove = (i) => {
    setRows(rows.filter((_, j) => j !== i));
    setOpen(-1);
  };

  const submit = async () => {
    setAsk(false);
    const next = { ...entry, submitted: true, submittedAt: Date.now() };
    setEntry(next); latest.current = next;
    setSaveState('saving');
    const ok = await S.set(key, next);
    setSaveState(ok ? 'saved' : 'error');
    if (!ok) { setEntry({ ...entry, submitted: false }); toast(t('saveFail')); }
  };

  const download = async () => {
    if (busy) return;
    setBusy(t('downloading'));
    try {
      const res = await fetch(`${base}/api/koutsuuhi/xlsx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ y, m }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `交通費精算書_${pk}_${user.id}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10000);
    } catch {
      toast(t('downloadFail'));
    } finally {
      setBusy('');
    }
  };

  if (!entry) return <div className="pad muted">…</div>;

  const o = open >= 0 ? rows[open] : null;
  const oDate = o?.date ? new Date(`${o.date}T00:00:00`) : null;

  return (
    <div className="tabbody">
      <div className={'banner ' + (locked ? 'ok' : 'warn')}>
        <span className="dot" />
        {locked ? t('submitted') : t('notSubmitted')}
      </div>

      <div className="sechead"><span>{t('totals')}</span></div>
      <div className="card tr-tot">
        <div className="tr-tot-g">
          <div><span>{t('tCommute')}</span><strong>{yenFmt(sum.commute)}</strong></div>
          <div><span>{t('tAdvance')}</span><strong>{yenFmt(sum.advance)}</strong></div>
        </div>
        <div className="tr-grand"><span>{t('tTotal')}</span><strong>{yenFmt(sum.total)}</strong></div>
      </div>

      <div className="sechead">
        <span>{t('listHead')}</span>
        {saveState
          ? (
            <span className={'savestate ' + saveState}>
              {saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('saved') : t('saveFail')}
            </span>
          )
          : <span className="muted sm">{t('count').replace('{n}', used)} / {MAX_ROWS}</span>}
      </div>

      <div className="card pad-less">
        <button className="btn wide" disabled={!!busy} onClick={download}>
          {busy || t('download')}
        </button>
        <p className="muted sm mt8">{t('downloadNote')}</p>
        {locked && <p className="muted sm">{t('lockedNote')}</p>}
      </div>

      {!rows.length && <p className="pad muted sm">{t('none')}</p>}

      <div className="tr-list">
        {rows.map((r, i) => {
          const d = r.date ? new Date(`${r.date}T00:00:00`) : null;
          return (
            <button type="button" key={i} className="tr-row" onClick={() => setOpen(i)}>
              <span className="tr-d">
                {d ? `${d.getMonth() + 1}/${d.getDate()}` : '—'}
                {d && <em>{DOW_JA[d.getDay()]}</em>}
              </span>
              <span className="tr-p">
                <b>{r.from || '—'}<i>→</i>{r.to || '—'}</b>
                <small>{r.line || ''}{r.fromH != null ? ` ${pad2(r.fromH)}:${pad2(r.fromM || 0)}` : ''}</small>
              </span>
              {r.commute && <span className="tr-c">○</span>}
              <span className="tr-f">{r.fare ? yenFmt(r.fare) : ''}</span>
            </button>
          );
        })}
      </div>

      {!locked && (
        <div className="card pad-less">
          <button className="btn wide primary" onClick={() => addRow()} disabled={rows.length >= MAX_ROWS}>
            {t('add')}
          </button>
          {rows.length >= MAX_ROWS && <p className="kt-warn">{t('full')}</p>}
        </div>
      )}

      {!locked && (
        <div className="card pad-less kt-submit">
          <button className="btn primary big wide" disabled={!used} onClick={() => setAsk(true)}>
            {t('submit')}
          </button>
          {!used && <p className="muted sm mt8">{t('nothing')}</p>}
        </div>
      )}

      {ask && (
        <div className="ovl" onClick={() => setAsk(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-h">
              <strong>{t('submitTitle')}</strong>
              <button className="x" onClick={() => setAsk(false)} aria-label="close">✕</button>
            </div>
            <div className="sheet-b">
              <p className="muted">{t('submitBody')}</p>
              <div className="kv"><span>{t('tCommute')}</span><strong>{yenFmt(sum.commute)}</strong></div>
              <div className="kv"><span>{t('tAdvance')}</span><strong>{yenFmt(sum.advance)}</strong></div>
              <div className="kv"><span>{t('tTotal')}</span><strong>{yenFmt(sum.total)}</strong></div>
              <div className="navrow mt8">
                <button className="btn ghost" onClick={() => setAsk(false)}>{t('cancel')}</button>
                <button className="btn primary grow" onClick={submit}>{t('submit')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {o && (
        /* .ovl is the app's fixed backdrop, so the panel opens over the list
           rather than below it. */
        <div className="ovl" onClick={() => setOpen(-1)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-h kt-sheet-h">
              <button className="kt-step" disabled={open <= 0} onClick={() => setOpen(open - 1)} aria-label="prev">‹</button>
              <strong>
                {oDate ? `${oDate.getMonth() + 1}/${oDate.getDate()}（${DOW_JA[oDate.getDay()]}）` : t('date')}
              </strong>
              <button className="kt-step" disabled={open >= rows.length - 1} onClick={() => setOpen(open + 1)} aria-label="next">›</button>
              <button className="x" onClick={() => setOpen(-1)} aria-label="close">✕</button>
            </div>
            <div className="sheet-b">
              {locked && <p className="kt-why">{t('lockedNote')}</p>}

              <label className="fld"><span>{t('date')}</span>
                <input
                  type="date" value={o.date || ''} min={first} max={last} disabled={locked}
                  onChange={(e) => patch(open, { date: e.target.value })}
                />
              </label>

              <div className="tr-leg">
                <label className="fld grow"><span>{t('fromSt')}</span>
                  <input
                    value={o.from || ''} maxLength={20} disabled={locked} list="tr-st"
                    onChange={(e) => patch(open, { from: e.target.value })}
                  />
                </label>
                <Clock
                  label={t('depart')} h={o.fromH} m={o.fromM} disabled={locked}
                  onChange={(h, mm) => patch(open, { fromH: h, fromM: mm })}
                />
              </div>

              <div className="tr-leg">
                <label className="fld grow"><span>{t('toSt')}</span>
                  <input
                    value={o.to || ''} maxLength={20} disabled={locked} list="tr-st"
                    onChange={(e) => patch(open, { to: e.target.value })}
                  />
                </label>
                <Clock
                  label={t('depart')} h={o.toH} m={o.toM} disabled={locked}
                  onChange={(h, mm) => patch(open, { toH: h, toM: mm })}
                />
              </div>
              <datalist id="tr-st">{seen.stations.map((x) => <option key={x} value={x} />)}</datalist>

              <div className="kt-two">
                <label className="fld"><span>{t('line')}</span>
                  <input
                    value={o.line || ''} maxLength={16} disabled={locked}
                    placeholder={t('linePh')} list="tr-ln"
                    onChange={(e) => patch(open, { line: e.target.value })}
                  />
                </label>
                <label className="fld tr-fare"><span>{t('fare')}</span>
                  <input
                    type="number" inputMode="numeric" min="0" step="10" disabled={locked}
                    value={o.fare ?? ''}
                    onChange={(e) => patch(open, { fare: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </label>
              </div>
              <datalist id="tr-ln">{seen.lines.map((x) => <option key={x} value={x} />)}</datalist>

              <label className="tr-sw">
                <input
                  type="checkbox" checked={!!o.commute} disabled={locked}
                  onChange={(e) => patch(open, { commute: e.target.checked })}
                />
                <span>{t('commute')}</span>
              </label>
              <p className="muted sm tr-swhelp">{t('commuteHelp')}</p>

              {!locked && (
                <div className="navrow mt8">
                  <button className="btn ghost grow" onClick={() => addReturn(open)}>{t('ret')}</button>
                  <button className="btn ghost" onClick={() => duplicate(open)}>{t('dup')}</button>
                  <button className="btn ghost danger" onClick={() => remove(open)}>{t('del')}</button>
                </div>
              )}

              <button className="btn primary big" onClick={() => setOpen(-1)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const KOUTSUUHI_CSS = `
.tr-tot .tr-tot-g{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--hair);
  border:1px solid var(--hair);border-radius:8px;overflow:hidden}
.tr-tot-g>div{background:#fff;padding:9px 11px;min-width:0}
.tr-tot-g span{display:block;font-size:10.5px;color:var(--ink-2);line-height:1.4;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tr-tot-g strong{font-size:18px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.tr-grand{display:flex;justify-content:space-between;align-items:baseline;margin-top:12px;
  padding-top:10px;border-top:1px solid var(--hair)}
.tr-grand span{font-size:12px;color:var(--ink-2)}
.tr-grand strong{font-size:22px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}

.tr-list{border-top:1px solid var(--hair)}
.tr-row{display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;background:#fff;
  border:0;border-bottom:1px solid var(--hair);text-align:left;font:inherit}
.tr-row .tr-d{width:50px;flex:none;font-size:13.5px;font-weight:600;color:var(--ink);
  font-variant-numeric:tabular-nums}
.tr-row .tr-d em{font-style:normal;font-size:11px;color:var(--ink-2);margin-left:3px;font-weight:400}
.tr-row .tr-p{flex:1;min-width:0}
.tr-row .tr-p b{display:block;font-size:13.5px;font-weight:600;color:var(--ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tr-row .tr-p b i{font-style:normal;color:var(--dim);margin:0 6px}
.tr-row .tr-p small{display:block;font-size:11px;color:var(--ink-2);margin-top:1px}
.tr-row .tr-c{flex:none;font-size:11px;width:20px;height:20px;line-height:19px;text-align:center;
  border-radius:50%;background:var(--brand-wash);color:var(--brand);font-weight:700}
.tr-row .tr-f{flex:none;font-size:13.5px;font-weight:600;color:var(--ink);
  font-variant-numeric:tabular-nums;text-align:right;min-width:58px}

.tr-leg{display:flex;gap:12px;align-items:flex-end}
.tr-leg .grow{flex:1;min-width:0}
.tr-leg .tr-time{width:118px;flex:none}
.tr-time input[type=time]{width:100%;font-size:16px;font-variant-numeric:tabular-nums;
  text-align:center;padding:11px 6px}
.tr-time input[type=time]::-webkit-date-and-time-value{text-align:center;margin:0}
.tr-fare input{font-size:17px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}

.tr-sw{display:flex;align-items:center;gap:10px;margin-top:4px;padding:11px 12px;
  border:1px solid var(--hair);border-radius:8px;background:var(--wash);font-size:13.5px;
  color:var(--ink);font-weight:600}
.tr-sw input{width:20px;height:20px;flex:none;accent-color:var(--brand)}
.tr-swhelp{margin:7px 2px 0;line-height:1.6}
.btn.ghost.danger{color:var(--warn)}
`;
