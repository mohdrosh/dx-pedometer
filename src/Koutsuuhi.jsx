/* ============================================================================
   交通費精算書 — the month's journeys.

   The paper form is twenty-five ruled lines and three totals, and the thing
   that makes it tedious is repetition: the same two stations, twice a day,
   every day you came in. Typing that out forty times is not data entry, it
   is punishment. So the screen is built around three ways of not doing it.

   One — 通勤経路. Your home station, your work station, the line and the
   one-way fare, entered once and carried forward every month after.

   Two — 出勤日をまとめて入力. The timesheet already knows which days you
   were at work and which were 有給休暇; it is the same period and the same
   person. One tap reads it and lays in the round trip for every day you
   came in, skipping the days you did not.

   Three — よく使う経路. Anything typed once this month or last comes back
   as a chip to tap. Nothing to set up; it just remembers.

   What is left to type by hand is the business travel, which is the part
   that genuinely differs every time.

   A month of round trips does not fit on twenty-five lines, so the download
   gives you as many copies of the form as it takes, the way the office has
   always been handed them on paper.
   ========================================================================= */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { S, setLeaving } from './storage';
import {
  ROWS_PER_SHEET, MAX_ROWS, totals, filled, travelKey, yenFmt,
  sheetCount, roundTrip, routeReady, hasRoute, workedDays, frequentRoutes,
} from './koutsuuhi-calc';

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
const pad2 = (n) => String(n).padStart(2, '0');
const kintaiKeyFor = (pk, id) => `kt:${pk}:${id}`;

const L = {
  totals: ['当月合計', 'Month total'],
  tCommute: ['通勤交通費', 'Commuting'],
  tAdvance: ['立替交通費', 'Advanced for work'],
  tTotal: ['合計', 'Total'],
  listHead: ['交通費', 'Journeys'],
  add: ['経路を追加', 'Add a journey'],
  none: ['まだ入力がありません。通勤経路を登録すると、出勤日の往復をまとめて入力できます。',
    'Nothing yet. Set your commute below and the round trips fill themselves in.'],

  /* 通勤経路 */
  routeHead: ['通勤経路', 'Your commute'],
  routeNote: ['一度登録すれば、翌月以降も引き継がれます。',
    'Set it once — it carries over to the following months.'],
  routeHome: ['自宅最寄駅', 'Home station'],
  routeWork: ['勤務地最寄駅', 'Work station'],
  routeOneWay: ['片道運賃', 'One-way fare'],
  routeSet: ['登録', 'Save'],
  routeEdit: ['変更', 'Change'],
  routeNeed: ['自宅最寄駅と勤務地最寄駅を入力してください。', 'Both stations are needed.'],
  fillWorked: ['出勤日の往復をまとめて入力', 'Fill the round trip for every day I worked'],
  fillToday: ['今日の往復を追加', 'Add today’s round trip'],
  fillDone: ['{n}日分（{r}件）を入力しました。', 'Added {r} journeys across {n} days.'],
  fillNoneLeft: ['入力済みのため、追加する日はありませんでした。',
    'Every working day already has its commute.'],
  fillNoKintai: ['勤怠がまだ入力されていません。先に勤怠を入力してください。',
    'The timesheet for this period is empty — fill that in first.'],
  roundTrip: ['往復を追加', 'Round trip'],
  oneWay: ['片道を追加', 'One way'],

  /* よく使う経路 */
  freqHead: ['よく使う経路', 'Journeys you make often'],
  freqNote: ['今月と先月に入力した経路です。タップすると同じ内容で追加します。',
    'From this period and the last. Tap one to add it again.'],

  date: ['日付', 'Date'],
  fromSt: ['乗車地（発駅）', 'From'],
  toSt: ['降車地（着駅）', 'To'],
  depart: ['時刻', 'Time'],
  line: ['利用交通機関', 'Line'],
  linePh: ['例：JR、阪急', 'e.g. JR'],
  fare: ['運賃', 'Fare'],
  commute: ['通勤経路（○）', 'Commuting journey (○)'],
  commuteHelp: ['通勤交通費：通勤にかかる実費相当額。業務上の移動は○なしで立替交通費になります。',
    'On for getting to and from work. Leave it off for travel on company business, which is reimbursed separately.'],
  ret: ['復路', 'Return'],
  dup: ['複製', 'Copy'],
  del: ['削除', 'Delete'],
  close: ['閉じる', 'Close'],

  download: ['交通費精算書をダウンロード', 'Download the expense form'],
  downloadN: ['交通費精算書をダウンロード（{n}枚）', 'Download the expense form ({n} sheets)'],
  downloading: ['作成中…', 'Building…'],
  downloadFail: ['作成できませんでした', 'Could not build the file'],
  downloadNote: ['入力した内容をそのままの様式で書き出します。合計は Excel 側で計算されます。',
    'Writes what you entered into the usual form. Excel works the totals out when it opens.'],
  sheetsNote: ['1枚の様式は25件までのため、{n}枚に分けて作成します。各様式の合計はその枚の分です。',
    'The form holds 25 journeys, so this comes out as {n} sheets. Each one totals its own.'],

  saving: ['保存中…', 'Saving…'],
  saved: ['保存しました', 'Saved'],
  saveFail: ['保存できませんでした', 'Could not save'],
  full: ['これ以上は追加できません（最大{n}件）。', 'That is as many as this will hold ({n}).'],
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
  count: ['{n}件', '{n} journeys'],
};

/* One tap to the system wheel rather than two number boxes. Blank is a real
   answer — plenty of receipts carry no time at all. */
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
  const prevPk = m === 1
    ? `${String((y - 1) % 100).padStart(2, '0')}12`
    : `${String(y % 100).padStart(2, '0')}${pad2(m - 1)}`;
  const key = travelKey(pk, user.id);

  const [entry, setEntry] = useState(null);
  const [prevRows, setPrevRows] = useState([]);
  const [open, setOpen] = useState(-1);
  const [editRoute, setEditRoute] = useState(null);
  const [saveState, setSaveState] = useState('');
  const [busy, setBusy] = useState('');
  const [ask, setAsk] = useState(false);

  /* Last month is read for two reasons: to carry the 通勤経路 forward, so it
     is entered once rather than every month, and to offer back the journeys
     already made. Nobody should have to tell us the same thing twice. */
  useEffect(() => {
    let live = true;
    setEntry(null); setOpen(-1); setEditRoute(null); setPrevRows([]);
    Promise.all([S.get(key), S.get(travelKey(prevPk, user.id))]).then(([e, p]) => {
      if (!live) return;
      setPrevRows(Array.isArray(p?.rows) ? p.rows : []);
      const base_ = e || { rows: [] };
      setEntry(base_.commuteRoute || !p?.commuteRoute
        ? base_
        : { ...base_, commuteRoute: p.commuteRoute });
    });
    return () => { live = false; };
  }, [key, prevPk, user.id]);

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
  const route = entry?.commuteRoute || null;
  const locked = !!entry?.submitted;
  const sum = useMemo(() => totals(rows), [rows]);
  const used = rows.filter(filled).length;
  const sheets = sheetCount(rows);

  const first = days[0]?.iso;
  const last = days[days.length - 1]?.iso;

  const freq = useMemo(
    () => frequentRoutes(rows, prevRows).filter(
      (r) => !(route && ((r.from === route.from && r.to === route.to)
        || (r.from === route.to && r.to === route.from))),
    ),
    [rows, prevRows, route],
  );

  const seen = useMemo(() => {
    const st = new Set(); const ln = new Set();
    [...rows, ...prevRows].forEach((r) => {
      if (r.from) st.add(r.from); if (r.to) st.add(r.to); if (r.line) ln.add(r.line);
    });
    if (route?.from) st.add(route.from);
    if (route?.to) st.add(route.to);
    return { stations: [...st], lines: [...ln] };
  }, [rows, prevRows, route]);

  const setRows = (next) => { if (!locked) persist({ ...entry, rows: next }); };
  const patch = (i, p) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  /* Every way of adding journeys goes through here, so the ceiling is
     checked in one place and the overflow is reported rather than dropped. */
  const append = (add, { openLast = false } = {}) => {
    if (locked || !add.length) return 0;
    const room = MAX_ROWS - rows.length;
    if (room <= 0) { toast(t('full').replace('{n}', MAX_ROWS)); return 0; }
    const take = add.slice(0, room);
    const next = [...rows, ...take];
    setRows(next);
    if (openLast) setOpen(next.length - 1);
    if (take.length < add.length) toast(t('full').replace('{n}', MAX_ROWS));
    return take.length;
  };

  const addBlank = () => {
    const prev = rows[rows.length - 1];
    append([{
      date: prev?.date || first, from: '', to: '',
      line: prev?.line || '', commute: false,
    }], { openLast: true });
  };

  /* The whole point of the screen. The timesheet for this very period
     already says which days were worked, so the commute is not a second
     question — it is the same answer, read again. */
  const fillWorked = async () => {
    if (locked || !routeReady(route)) return;
    const kt = await S.get(kintaiKeyFor(pk, user.id));
    if (!kt || !Object.keys(kt.days || {}).length) { toast(t('fillNoKintai')); return; }
    const worked = workedDays(kt, days.map((d) => d.iso));
    const add = [];
    worked.forEach((iso) => {
      if (hasRoute(rows, route, iso)) return;
      add.push(...roundTrip(route, iso));
    });
    if (!add.length) { toast(t('fillNoneLeft')); return; }
    const n = append(add);
    if (n) toast(t('fillDone').replace('{n}', Math.ceil(n / 2)).replace('{r}', n));
  };

  const todayIso = () => {
    const now = new Date();
    const iso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    return iso >= first && iso <= last ? iso : last;
  };

  const addCommute = (both) => {
    if (!routeReady(route)) { toast(t('routeNeed')); return; }
    const pair = roundTrip(route, todayIso());
    append(both ? pair : [pair[0]], { openLast: true });
  };

  const addFreq = (r) => {
    const prev = rows[rows.length - 1];
    append([{ ...r, date: prev?.date || todayIso() }], { openLast: true });
  };

  /* The return leg: same journey the other way round, same day, same line,
     same fare. The times are left blank — they are the one thing that is
     genuinely different. */
  const addReturn = (i) => {
    const r = rows[i];
    if (!r?.from && !r?.to) { toast(t('needFrom')); return; }
    append([{
      date: r.date, from: r.to, to: r.from, line: r.line,
      commute: r.commute, fare: r.fare,
    }], { openLast: true });
  };

  const duplicate = (i) => {
    const r = rows[i];
    append([{ ...r, fromH: null, fromM: null, toH: null, toM: null }], { openLast: true });
  };

  const remove = (i) => { setRows(rows.filter((_, j) => j !== i)); setOpen(-1); };

  const saveRoute = () => {
    const r = editRoute;
    if (!r.from?.trim() || !r.to?.trim()) { toast(t('routeNeed')); return; }
    persist({
      ...entry,
      commuteRoute: {
        from: r.from.trim(), to: r.to.trim(), line: (r.line || '').trim(),
        fare: r.fare === '' || r.fare == null ? null : Number(r.fare),
      },
    });
    setEditRoute(null);
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

  /* One file per copy of the form, fetched in turn. */
  const download = async () => {
    if (busy) return;
    setBusy(t('downloading'));
    try {
      for (let page = 0; page < sheets; page++) {
        /* eslint-disable no-await-in-loop */
        const res = await fetch(`${base}/api/koutsuuhi/xlsx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ y, m, page }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = sheets > 1
          ? `交通費精算書_${pk}_${user.id}_${page + 1}of${sheets}.xlsx`
          : `交通費精算書_${pk}_${user.id}.xlsx`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 10000);
        /* Safari drops the second download of a burst; a beat apart is enough. */
        if (page < sheets - 1) await new Promise((r) => setTimeout(r, 700));
        /* eslint-enable no-await-in-loop */
      }
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

      {/* ---- 通勤経路: entered once, then never again --------------------- */}
      <div className="sechead"><span>{t('routeHead')}</span></div>
      <div className="card pad-less">
        {routeReady(route) && !editRoute ? (
          <>
            <div className="tr-route">
              <b>{route.from}<i>⇄</i>{route.to}</b>
              <span>{[route.line, route.fare ? `${t('routeOneWay')} ${yenFmt(route.fare)}` : '']
                .filter(Boolean).join(' · ')}</span>
            </div>
            {!locked && (
              <>
                {/* the one that does the month gets its own line, so the
                    label is never cut short */}
                <button className="btn primary wide mt8" onClick={fillWorked}>{t('fillWorked')}</button>
                <div className="tr-acts two">
                  <button className="btn" onClick={() => addCommute(true)}>{t('fillToday')}</button>
                  <button className="btn" onClick={() => setEditRoute({ ...route })}>{t('routeEdit')}</button>
                </div>
              </>
            )}
          </>
        ) : editRoute ? (
          <>
            <div className="tr-leg">
              <label className="fld grow"><span>{t('routeHome')}</span>
                <input
                  value={editRoute.from || ''} maxLength={20} list="tr-st" autoFocus
                  onChange={(e) => setEditRoute({ ...editRoute, from: e.target.value })}
                />
              </label>
              <label className="fld grow"><span>{t('routeWork')}</span>
                <input
                  value={editRoute.to || ''} maxLength={20} list="tr-st"
                  onChange={(e) => setEditRoute({ ...editRoute, to: e.target.value })}
                />
              </label>
            </div>
            <div className="tr-leg">
              <label className="fld grow"><span>{t('line')}</span>
                <input
                  value={editRoute.line || ''} maxLength={16} placeholder={t('linePh')} list="tr-ln"
                  onChange={(e) => setEditRoute({ ...editRoute, line: e.target.value })}
                />
              </label>
              <label className="fld grow tr-fare"><span>{t('routeOneWay')}</span>
                <input
                  type="number" inputMode="numeric" min="0" step="10"
                  value={editRoute.fare ?? ''}
                  onChange={(e) => setEditRoute({ ...editRoute, fare: e.target.value })}
                />
              </label>
            </div>
            <div className="tr-acts two">
              <button className="btn ghost" onClick={() => setEditRoute(null)}>{t('cancel')}</button>
              <button className="btn primary" onClick={saveRoute}>{t('routeSet')}</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted sm">{t('routeNote')}</p>
            <button
              className="btn wide primary mt8" disabled={locked}
              onClick={() => setEditRoute({ from: '', to: '', line: '', fare: '' })}
            >
              {t('routeHead')}を{t('routeSet')}
            </button>
          </>
        )}
      </div>

      <div className="sechead">
        <span>{t('listHead')}</span>
        {saveState
          ? (
            <span className={'savestate ' + saveState}>
              {saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('saved') : t('saveFail')}
            </span>
          )
          : <span className="muted sm">{t('count').replace('{n}', used)}</span>}
      </div>

      <div className="card pad-less">
        <button className="btn wide" disabled={!!busy || !used} onClick={download}>
          {busy || (sheets > 1 ? t('downloadN').replace('{n}', sheets) : t('download'))}
        </button>
        <p className="muted sm mt8">{t('downloadNote')}</p>
        {sheets > 1 && <p className="muted sm">{t('sheetsNote').replace('{n}', sheets)}</p>}
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
          <button className="btn wide primary" onClick={addBlank}>{t('add')}</button>
        </div>
      )}

      {!locked && !!freq.length && (
        <>
          <div className="sechead"><span>{t('freqHead')}</span></div>
          <div className="card pad-less">
            <p className="muted sm">{t('freqNote')}</p>
            <div className="tr-chips">
              {freq.map((r, i) => (
                <button type="button" key={i} className="tr-chip" onClick={() => addFreq(r)}>
                  <b>{r.from}<i>→</i>{r.to}</b>
                  <span>{[r.line, r.fare ? yenFmt(r.fare) : ''].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {!locked && (
        <div className="card pad-less kt-submit">
          <button className="btn primary big wide" disabled={!used} onClick={() => setAsk(true)}>
            {t('submit')}
          </button>
          {!used && <p className="muted sm mt8">{t('nothing')}</p>}
        </div>
      )}

      {/* suggestions shared by every station and line field on the screen */}
      <datalist id="tr-st">{seen.stations.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="tr-ln">{seen.lines.map((x) => <option key={x} value={x} />)}</datalist>

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
              <div className="tr-acts two mt8">
                <button className="btn ghost" onClick={() => setAsk(false)}>{t('cancel')}</button>
                <button className="btn primary" onClick={submit}>{t('submit')}</button>
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

              <div className="tr-leg">
                <label className="fld grow"><span>{t('line')}</span>
                  <input
                    value={o.line || ''} maxLength={16} disabled={locked}
                    placeholder={t('linePh')} list="tr-ln"
                    onChange={(e) => patch(open, { line: e.target.value })}
                  />
                </label>
                <label className="fld grow tr-fare"><span>{t('fare')}</span>
                  <input
                    type="number" inputMode="numeric" min="0" step="10" disabled={locked}
                    value={o.fare ?? ''}
                    onChange={(e) => patch(open, { fare: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </label>
              </div>

              <label className="tr-sw">
                <input
                  type="checkbox" checked={!!o.commute} disabled={locked}
                  onChange={(e) => patch(open, { commute: e.target.checked })}
                />
                <span>{t('commute')}</span>
              </label>
              <p className="muted sm tr-swhelp">{t('commuteHelp')}</p>

              {!locked && (
                <div className="tr-acts">
                  <button className="btn" onClick={() => addReturn(open)}>{t('ret')}</button>
                  <button className="btn" onClick={() => duplicate(open)}>{t('dup')}</button>
                  <button className="btn danger" onClick={() => remove(open)}>{t('del')}</button>
                </div>
              )}

              <button className="btn primary big wide mt8" onClick={() => setOpen(-1)}>{t('close')}</button>
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

/* every row of buttons on this screen is one grid of equal columns, so no
   two buttons beside each other are ever different sizes */
.tr-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:11px}
.tr-acts.two{grid-template-columns:1fr 1fr}
.tr-acts>.btn{width:100%;min-width:0;padding:11px 6px;font-size:12.5px;line-height:1.25;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;height:100%}
.btn.danger{color:var(--warn);border-color:#E6C9C4}

.tr-route{display:flex;flex-direction:column;gap:3px}
.tr-route b{font-size:16px;font-weight:700;color:var(--ink)}
.tr-route b i{font-style:normal;color:var(--brand);margin:0 8px}
.tr-route span{font-size:11.5px;color:var(--ink-2)}

.tr-list{border-top:1px solid var(--hair)}
.tr-row{display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;background:#fff;
  border:0;border-bottom:1px solid var(--hair);text-align:left;font:inherit}
.tr-row .tr-d{width:58px;flex:none;white-space:nowrap;font-size:13.5px;font-weight:600;color:var(--ink);
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

.tr-chips{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.tr-chip{display:block;text-align:left;padding:9px 11px;border:1px solid var(--hair);
  border-radius:8px;background:var(--wash);font:inherit;min-width:0}
.tr-chip b{display:block;font-size:12.5px;font-weight:600;color:var(--ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tr-chip b i{font-style:normal;color:var(--dim);margin:0 4px}
.tr-chip span{display:block;font-size:10.5px;color:var(--ink-2);margin-top:1px}

.tr-leg{display:flex;gap:12px;align-items:flex-end}
.tr-leg .grow{flex:1;min-width:0}
.tr-leg .tr-time{width:116px;flex:none}
.tr-time input[type=time]{width:100%;font-size:16px;font-variant-numeric:tabular-nums;
  text-align:center;padding:11px 6px}
.tr-time input[type=time]::-webkit-date-and-time-value{text-align:center;margin:0}
.tr-fare input{font-size:17px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}

.tr-sw{display:flex;align-items:center;gap:10px;margin-top:4px;padding:11px 12px;
  border:1px solid var(--hair);border-radius:8px;background:var(--wash);font-size:13.5px;
  color:var(--ink);font-weight:600}
.tr-sw input{width:20px;height:20px;flex:none;accent-color:var(--brand)}
.tr-swhelp{margin:7px 2px 0;line-height:1.6}
`;
