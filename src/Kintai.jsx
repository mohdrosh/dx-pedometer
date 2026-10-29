/* ============================================================================
   勤怠 — the month's timesheet.

   The paper form asks for four numbers a day and works out the rest. So does
   this. The arithmetic lives in kintai.js, verified against a real 業務報告書
   to the minute; this file is the screen around it.

   Two things shape the design. Almost every day is the standard 09:00–17:45,
   so there is a one-tap way to say that and a one-tap way to say it for the
   whole month — the work is in the exceptions, and the screen should only
   charge you for those. And the eight figures payroll reads are shown live
   while you type, because on paper nobody sees them until the sheet is in.
   ========================================================================= */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { S, setLeaving, apiFeatures } from './storage';
import {
  computeMonth, splitHM, fmtHM, offUnit, overtimeAlert,
  DEFAULT_RULES, STATUS_1, STATUS_2, STATUS_GROUPS, LEAVE, LEAVE_QUICK,
} from './kintai';
import { noticesFor } from './todoke-runs';
import { rulesForPerson, closureMap } from './company.js';

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
const pad2 = (n) => String(n).padStart(2, '0');

/* 出勤 / 退勤 stamp a figure onto a payroll form, so they are read off
   Tokyo rather than off the device. A phone still on another timezone
   after a trip would otherwise stamp the wrong hour, and around midnight
   the wrong day — and the server's own jobs already work in Tokyo. */
export function tokyoNow(at = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(at).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return {
    iso: `${p.year}-${p.month}-${p.day}`,
    h: Number(p.hour) % 24,
    m: Number(p.minute),
  };
}
export const kintaiKey = (pk, id) => `kt:${pk}:${id}`;

/* A period runs 21st to 20th, so half its days belong to the month before the
   one the period is named after. Reading the month off the period number puts
   9/25 on the screen as 10/25, which is why this reads it off the day itself. */
const md = (iso) => { const [, mm, dd] = iso.split('-'); return `${+mm}/${+dd}`; };

/* A row's two time inputs speak 'HH:MM'; the month speaks hours and minutes
   as separate numbers, because that is what the form's cells are. */
const hhmmOf = (h, m) => (h == null ? '' : `${pad2(h)}:${pad2(m || 0)}`);

const L = {
  head: ['勤怠', 'Timesheet'],
  today: ['きょう', 'Today'],
  clockIn: ['出勤', 'Clock in'],
  clockOut: ['退勤', 'Clock out'],
  clockedIn: ['出勤しました', 'Clocked in'],
  clockedOut: ['お疲れさまでした', 'Clocked out — have a good evening'],
  todayDone: ['本日分は入力済みです', 'Today is entered'],
  pickDate: ['日付を選ぶ', 'Pick a date'],
  backToday: ['きょうへ', 'Today'],
  todayEdit: ['修正', 'Edit'],
  openInCard: ['上のカードで開く（備考・勤怠状況②）', 'Open above for note and second status'],
  todayMore: ['始業・終業・勤怠状況を入力', 'Enter times and status'],
  todayLess: ['閉じる', 'Hide'],
  todayStd: ['標準で入力', 'Standard hours'],
  todayNone: ['まだ入力がありません', 'Nothing entered yet'],
  todayOff: ['本日は所定休日です', 'Today is not a working day'],
  worked: ['実働', 'Worked'],
  takeLeave: ['お休みにする', 'Book a day off'],
  leaveNote: ['この日は「{k}」です。始業・終業は提出書類には出ません。',
    'This day is {k}. Its start and end times are left off the submitted form.'],
  entryHead: ['日々の勤怠', 'Daily record'],
  start: ['始業', 'Start'],
  end: ['終業', 'End'],
  brk: ['休憩', 'Break'],
  inside: ['時間内', 'Contracted'],
  overtime: ['時間外', 'Overtime'],
  night: ['深夜', 'Late night'],
  holiday: ['休日勤務', 'Holiday'],
  note: ['備考', 'Note'],
  status: ['勤怠状況', 'Status'],
  status2: ['勤怠状況②', 'Status 2'],
  notice: ['届', 'Notice'],
  standard: ['標準', 'Standard'],
  fillAll: ['営業日を標準で埋める', 'Fill weekdays with standard hours'],
  download: ['業務報告書をダウンロード', 'Download the timesheet'],
  makingPdf: ['PDFを作成中…', 'Making the PDF…'],
  downloadPdf: ['PDFでダウンロード', 'Download as PDF'],
  pdfUnavailable: ['このサーバーではPDF出力が利用できません', 'This server cannot produce PDFs'],
  downloading: ['作成中…', 'Building…'],
  downloadFail: ['作成できませんでした', 'Could not build the file'],
  downloadNote: ['入力した内容をそのままの様式で書き出します。合計は Excel 側で計算されます。',
    'Writes what you entered into the usual form. Excel works the totals out when it opens.'],
  fillAllDone: ['{n}日を標準で入力しました', 'Filled {n} days with the standard hours'],
  clear: ['消去', 'Clear'],
  totals: ['当月合計', 'Month total'],
  tInside: ['所定時間内時間合計', 'Contracted hours'],
  tDeduct: ['遅刻・早退', 'Late / early leave'],
  tOtDay: ['時間外（平日普通）', 'Overtime (weekday)'],
  tOtNight: ['時間外（平日深夜）', 'Overtime (weekday, late night)'],
  tOtHol: ['時間外（休日普通）', 'Overtime (holiday)'],
  tOtHolNight: ['時間外（休日深夜）', 'Overtime (holiday, late night)'],
  cShotei: ['所定労働日数', 'Contracted days'],
  cWorked: ['出勤日数', 'Days worked'],
  cPaid: ['有給休暇日数', 'Paid leave'],
  cAbsent: ['欠勤日数', 'Absences'],
  cSpecial: ['特別休暇日数', 'Special leave'],
  cHolSat: ['休日出勤（土・祝祭日）', 'Holiday work (Sat / public)'],
  cHolSun: ['法定休日出勤日数', 'Statutory holiday work'],
  cFurikae: ['振替休暇日数', 'Days taken in lieu'],
  hour: ['時間', 'h'],
  min: ['分', 'm'],
  day: ['日', 'days'],
  unitWarn: ['{n}分単位で入力してください', 'Please enter in {n}-minute steps'],
  over60: ['今月の時間外が60時間を超えています（{n}）。割増率が変わります。',
    'Overtime passed 60 hours this month ({n}). A higher premium applies.'],
  saving: ['保存中…', 'Saving…'],
  saved: ['保存しました', 'Saved'],
  saveFail: ['保存できませんでした', 'Could not save'],
  none: ['—', '—'],
  close: ['閉じる', 'Close'],
  noticeReq: ['届が必要です', 'A notice is required'],
  noticeApp: ['事前申請が必要です', 'Needs a prior application'],
  blank: ['未入力', 'Not entered'],
  submit: ['勤怠を提出', 'Submit timesheet'],
  submitBlank: ['勤怠を提出（未入力 {n}日）', 'Submit timesheet ({n} days blank)'],
  submitted: ['提出済', 'Submitted'],
  notSubmitted: ['未提出', 'Not submitted'],
  submitTitle: ['提出しますか？', 'Submit this month?'],
  submitBody: ['提出後はご自身で修正できません。修正が必要な場合は管理責任者へご連絡ください。',
    'You cannot edit it yourself afterwards. Ask your manager if a correction is needed.'],
  lockedNote: ['提出済みのため編集できません。', 'Submitted — no longer editable.'],
  cancel: ['キャンセル', 'Cancel'],
  blankDays: ['未入力の日があります。出勤していない日は勤怠状況を選んでください。',
    'Some days are blank. Pick a 勤怠状況 for days you were not at work.'],
  todokeHead: ['届', 'Notices'],
  todokeNone: ['この月度に届が必要な日はありません。', 'No day this period needs a notice.'],
  todokeNote: ['勤怠状況を選んだ日から自動で作成します。連続する同じ種別は1枚にまとめます。',
    'Built from the days you marked. Consecutive days of the same kind become one form.'],
  todokeMake: ['届を作成', 'Create the notice'],
  todokeReason: ['理由', 'Reason'],
  todokeReasonPh: ['簡単で結構です（例：一時帰国のため）', 'A short line is enough'],
  todokeRemark: ['備考', 'Remark'],
  todokeNeedReason: ['理由を入力してください。', 'Please give a reason.'],
  days_: ['日間', ' days'],
  isHoliday: ['祝日', 'Public holiday'],
  isSaturday: ['土曜日', 'Saturday'],
  isSunday: ['日曜日', 'Sunday'],
  allOvertime: ['所定労働日ではないため、働いた分はすべて時間外になります。',
    'Not a contracted working day, so everything worked counts as overtime.'],
};

/* ------------------------------------------------------------------ atoms */

/* A single native time field rather than two dropdowns: on a phone this is
   one tap to the system wheel, which already understands 15-minute steps.
   A finish before the start is read as the next morning, so an overnight
   shift needs nothing special from whoever is typing it. */
function TimeField({ h, m, unit, onChange, label, disabled }) {
  const value = h == null ? '' : `${pad2(h % 24)}:${pad2(m || 0)}`;
  return (
    <label className="fld kt-time">
      <span>{label}</span>
      <input
        type="time" step={unit * 60} value={value} disabled={disabled}
        onChange={(e) => {
          if (!e.target.value) { onChange(null, null); return; }
          const [nh, nm] = e.target.value.split(':').map(Number);
          onChange(nh, nm);
        }}
      />
    </label>
  );
}

/** 時間 / 分, the way the paper form prints a total. */
function HM({ hours, t }) {
  const { h, m } = splitHM(hours);
  if (!h && !m) return <strong className="kt-zero">0</strong>;
  return (
    <strong>
      {h}<em>{t('hour')}</em>{m ? <>{m}<em>{t('min')}</em></> : null}
    </strong>
  );
}

/* The day's fields, in one place because they appear in two: inline at the
   top of the screen for きょう, and in the sheet for any other day. 佐野
   asked for "this to appear first", pointing at the sheet — so rather than
   open a dialog over the page on arrival, the same fields simply are the
   first thing on it. Two copies of this would drift apart within a month. */
function DayFields({ row, rules, locked, setDay, t, lang }) {
  const iso = row.iso;
  const c = row.calc;
  return (
    <>
      {(row.holiday || row.dow === 0 || row.dow === 6) && (
        <p className="kt-why">
          {row.holidayName
            ? `${t('isHoliday')}（${row.holidayName}）`
            : row.dow === 0 ? t('isSunday') : t('isSaturday')}
          — {t('allOvertime')}
        </p>
      )}
      {locked && <p className="kt-why">{t('lockedNote')}</p>}

      <div className="navrow" hidden={locked}>
        <button className="btn primary grow" onClick={() => setDay(iso, {
          inH: Number(rules.workStart.split(':')[0]), inM: Number(rules.workStart.split(':')[1]),
          outH: Number(rules.workEnd.split(':')[0]), outM: Number(rules.workEnd.split(':')[1]),
        })}
        >
          {t('standard')} {rules.workStart}–{rules.workEnd}
        </button>
        <button
          className="btn ghost"
          onClick={() => setDay(iso, { inH: null, inM: null, outH: null, outM: null })}
        >
          {t('clear')}
        </button>
      </div>

      <div className="kt-two">
        <TimeField
          label={t('start')} h={row.inH} m={row.inM} unit={rules.unitMin} disabled={locked}
          onChange={(h, mm) => setDay(iso, { inH: h, inM: mm })}
        />
        <TimeField
          label={t('end')} h={row.outH} m={row.outM} unit={rules.unitMin} disabled={locked}
          onChange={(h, mm) => setDay(iso, { outH: h, outM: mm })}
        />
      </div>

      <div className="kt-two">
        <label className="fld"><span>{t('status')}</span>
          {/* Nine in a flat list mixed days off with late trains and
              weekend work, so somebody booking leave read past most of it
              to reach 有給休暇. Same nine, in the three kinds they are. */}
          <select
            value={row.status1 || ''} disabled={locked}
            onChange={(e) => setDay(iso, { status1: e.target.value })}
          >
            <option value="">{t('none')}</option>
            {STATUS_GROUPS.map((g) => (
              <optgroup key={g.id} label={lang === 'ja' ? g.ja : g.en}>
                {g.items.map((x) => <option key={x}>{x}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="fld"><span>{t('status2')}</span>
          <select
            value={row.status2 || ''} disabled={locked}
            onChange={(e) => setDay(iso, { status2: e.target.value })}
          >
            <option value="">{t('none')}</option>
            {STATUS_2.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
      </div>

      <label className="fld"><span>{t('note')}</span>
        <input
          value={row.note || ''} maxLength={40} disabled={locked}
          onChange={(e) => setDay(iso, { note: e.target.value })}
        />
      </label>

      <div className="kt-day-sum">
        <div><span>{t('brk')}</span><b>{c.breakMin || 0}<em>{t('min')}</em></b></div>
        <div><span>{t('inside')}</span><b>{fmtHM(c.inside) || '—'}</b></div>
        <div><span>{t('overtime')}</span><b>{fmtHM(c.show?.overtime) || '—'}</b></div>
        <div><span>{t('night')}</span><b>{fmtHM(c.show?.night) || '—'}</b></div>
      </div>
      {c.notice === '要' && <p className="kt-warn">{t('noticeReq')}</p>}
      {c.notice === '申' && <p className="kt-note">{t('noticeApp')}</p>}
      {c.entered && offUnit(c.inside + c.show.overtime, rules.unitMin) && (
        <p className="kt-warn">{t('unitWarn').replace('{n}', rules.unitMin)}</p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ screen */

export default function KintaiTab({ user, cfg = {}, y, m, days, holidays, lang, toast, base = '' }) {
  const t = useCallback((k) => (L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);
  const pk = `${String(y % 100).padStart(2, '0')}${pad2(m)}`;
  const key = kintaiKey(pk, user.id);

  const [entry, setEntry] = useState(null);
  const [saveState, setSaveState] = useState('');
  const [busy, setBusy] = useState('');
  const [ask, setAsk] = useState(false);
  /* きょう opens showing its details when the day has not been answered —
     which is the state somebody arriving at the screen is usually in. */
  const [more, setMore] = useState(true);
  /* Whether this server has LibreOffice and a Japanese font. */
  const [canPdf, setCanPdf] = useState(false);
  useEffect(() => { apiFeatures().then((f) => setCanPdf(!!f.pdf)).catch(() => {}); }, []);

  /* 働き方 is per person and already differs: 新長田 works 8:45–17:15 and
     明海 9:00–17:45. Taking it off the record rather than the constant is
     what makes the figures that follow — 所定時間内, 時間外, 遅刻・早退 —
     right for whoever is looking at them. Everything else about the rules
     is still the house default until the committee send theirs.

     useMemo because computeDay runs over every day of the month on every
     keystroke, and a rules object rebuilt each render would redo all of it. */
  /* 就業条件: the house rules, what the company changed, then this person's
     own 始業・終業. cfg arrives from 設定, so a change there reaches every
     figure on this screen without a deploy. */
  const rules = useMemo(() => rulesForPerson(cfg, user),
    [cfg?.companies, user?.workStart, user?.workEnd]);

  useEffect(() => {
    let live = true;
    setEntry(null);
    S.get(key).then((e) => { if (live) setEntry(e || { days: {} }); });
    return () => { live = false; };
  }, [key]);

  /* Saved on a short debounce with a ceiling, the same way the step entry is:
     a long uninterrupted run of typing must still reach the server. */
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

  /* The period's days, each carrying whatever has been entered for it. */
  /* 稼働カレンダー: the company's own 休業日 on top of the public holidays.
     A day shut for either reason is shut, and the day row cannot tell the
     difference — which is right, because the arithmetic should not. */
  const shut = useMemo(() => ({ ...holidays, ...closureMap(cfg, user) }), [holidays, cfg?.companies]);

  const rows = useMemo(() => days.map((d) => ({
    iso: d.iso, dom: d.dom, dow: d.dow,
    holiday: !!shut[d.iso], holidayName: shut[d.iso] || '',
    ...(entry?.days?.[d.iso] || {}),
  })), [days, shut, entry]);

  const month = useMemo(() => computeMonth(rows, rules), [rows, rules]);
  const alert60 = overtimeAlert(month);
  const locked = !!entry?.submitted;

  /* A day counts as answered if it has both times or a 勤怠状況 — a Sunday
     nobody worked needs neither, so only working days can be outstanding.
     Both times, not just a start: 出勤 without 退勤 is now an ordinary
     state to be in halfway through a Tuesday, and it computes to nothing,
     so a month holding one is not finished. */
  const blanks = month.rows.filter(
    (r) => r.calc.isWeekday && !r.status1 && (r.inH == null || r.outH == null),
  ).length;

  const setDay = (iso, patch) => {
    if (locked) return;
    const cur = entry?.days?.[iso] || {};
    const next = { ...cur, ...patch };
    const empty = next.inH == null && next.outH == null && !next.status1 && !next.status2 && !next.note;
    const nd = { ...(entry?.days || {}) };
    if (empty) delete nd[iso]; else nd[iso] = next;
    persist({ ...entry, days: nd });
  };

  /* A row's time input hands back 'HH:MM' or ''. Clearing it clears the day
     rather than parsing '' into zero, which would read as a midnight start —
     a blank day and a day beginning at 00:00 are not the same claim. */
  const setTimeOn = (iso, which, v) => {
    if (!v) {
      setDay(iso, which === 'in' ? { inH: null, inM: null } : { outH: null, outM: null });
      return;
    }
    const [h, mm] = v.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(mm)) return;
    setDay(iso, which === 'in' ? { inH: h, inM: mm } : { outH: h, outM: mm });
  };

  /* きょう. The pedometer asks for one number for today and gets out of the
     way; this asks for one time. 出勤 stamps the clock now, 退勤 stamps it
     again at the end, and the month fills itself a day at a time without
     anybody opening a form. Rounded to the 割増単位 the sheet works in, so
     a tap at 08:58 does not quietly create two minutes of early overtime —
     and shown in a field right beside the button, because the one thing
     certain about stamping a clock is that sometimes you forget until
     later. */
  const nowOnUnit = () => {
    const unit = rules.unitMin;
    const t0 = tokyoNow();
    const mins = Math.round((t0.h * 60 + t0.m) / unit) * unit;
    return [Math.floor(mins / 60) % 24, mins % 60];
  };

  const todayIso = tokyoNow().iso;
  const todayRow = month.rows.find((r) => r.iso === todayIso) || null;

  /* 佐野:「スクロールしないで、ここに日付を選べるカレンダーをつけてほしい」
     The card was today and nothing else, so booking leave for the 20th meant
     scrolling past thirty rows to find it. It now shows whichever day the
     date field names — today until someone picks another — and the month
     list below is unchanged for anyone who prefers it.

     null means "follow today", so the card does not keep pointing at a stale
     date once midnight passes or the period is changed. */
  const [cardIso, setCardIso] = useState(null);
  useEffect(() => { setCardIso(null); }, [key]);
  const cardRow = (cardIso && month.rows.find((r) => r.iso === cardIso))
    || todayRow
    || month.rows[0]
    || null;
  const isToday = !!cardRow && cardRow.iso === todayIso;
  const firstIso = month.rows[0]?.iso;
  const lastIso = month.rows[month.rows.length - 1]?.iso;

  const clockIn = () => {
    const [h, mm] = nowOnUnit();
    setDay(todayIso, { inH: h, inM: mm });
    toast(t('clockedIn'));
  };
  const clockOut = () => {
    const [h, mm] = nowOnUnit();
    setDay(todayIso, { outH: h, outM: mm });
    toast(t('clockedOut'));
  };

  /* Most months are twenty standard days and two exceptions. This fills the
     twenty so only the exceptions need touching. Days already entered, and
     days that are not working days, are left alone. */
  const submit = async () => {
    setAsk(false);
    const next = { ...entry, submitted: true, submittedAt: Date.now() };
    setEntry(next); latest.current = next;
    setSaveState('saving');
    const ok = await S.set(key, next);
    setSaveState(ok ? 'saved' : 'error');
    if (!ok) { setEntry({ ...entry, submitted: false }); toast(t('saveFail')); }
  };

  const fillWeekdays = () => {
    if (locked) return;
    const [sh, sm] = rules.workStart.split(':').map(Number);
    const [eh, em] = rules.workEnd.split(':').map(Number);
    const nd = { ...(entry?.days || {}) };
    let n = 0;
    rows.forEach((r) => {
      if (r.dow === 0 || r.dow === 6 || r.holiday) return;
      if (nd[r.iso]) return;
      nd[r.iso] = { inH: sh, inM: sm, outH: eh, outM: em };
      n += 1;
    });
    if (!n) return;
    persist({ ...entry, days: nd });
    toast(t('fillAllDone').replace('{n}', n));
  };

  /* Which days need a 届, grouped into runs. The timesheet already knows —
     this is the same information its 届 column shows, collected up. */
  const notices = useMemo(() => noticesFor(month.rows), [month.rows]);
  const [reasons, setReasons] = useState({});

  const makeTodoke = async (n, format) => {
    const reason = (reasons[n.from.iso + n.kind] || '').trim();
    if (!reason) { toast(t('todokeNeedReason')); return; }
    if (busy) return;
    const pdf = format === 'pdf';
    setBusy(t(pdf ? 'makingPdf' : 'downloading'));
    try {
      const res = await fetch(`${base}/api/kintai/todoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ y, m, from: n.from.iso, kind: n.kind, reason, ...(pdf ? { format: 'pdf' } : {}) }),
      });
      if (!res.ok) { toast(t(res.status === 503 ? 'pdfUnavailable' : 'downloadFail')); return; }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `届_${n.kind}_${n.from.iso.replace(/-/g, '')}_${user.id}.${pdf ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10000);
    } catch {
      toast(t('downloadFail'));
    } finally {
      setBusy('');
    }
  };

  /* The file is built on the server and comes back as the form itself, so
     this posts and saves the response rather than assembling anything here.
     The holiday list goes with it: the browser has the authoritative one and
     the sheet must agree with what was on screen. */
  const download = async (format) => {
    if (busy) return;
    const pdf = format === 'pdf';
    /* Converting takes a couple of seconds, which is long enough that the
       button has to say it is working or it will be pressed again. */
    setBusy(t(pdf ? 'makingPdf' : 'downloading'));
    try {
      const res = await fetch(`${base}/api/kintai/xlsx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ y, m, holidays, ...(pdf ? { format: 'pdf' } : {}) }),
      });
      if (!res.ok) {
        const why = res.status === 503 ? 'pdfUnavailable' : 'downloadFail';
        toast(t(why));
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `業務報告書_${pk}_${user.id}.${pdf ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10000);
    } catch {
      toast(t('downloadFail'));
    } finally {
      setBusy('');
    }
  };

  if (!entry) return <div className="pad muted">…</div>;

  return (
    <div className="tabbody kt-page">
      <div className={'banner ' + (locked ? 'ok' : 'warn')}>
        <span className="dot" />
        {locked ? t('submitted') : t('notSubmitted')}
      </div>

      {/* On a phone these three run one under the next, exactly as they
          always have. On a desktop the month goes down the left and stays
          there, so picking a day no longer means scrolling past thirty
          rows and scrolling back. The order here is the phone order; the
          grid does the moving. */}
      <div className="kt-cols">
      <div className="kt-top">

        {/* きょう — one tap in, one tap out. She asked for it to work like the
            pedometer, which asks for today and nothing else; the month list
            below is still there for the days you fill in afterwards. */}
        {cardRow && !locked && (
          <div className="card kt-today">
            <div className="kt-today-h">
              <span className="clabel">
                {isToday && `${t('today')} `}{md(cardRow.iso)}（{DOW_JA[cardRow.dow]}）
              </span>
              {cardRow.calc.entered && <span className="kt-today-ok">{t('todayDone')}</span>}
            </div>

            {/* The calendar she asked for. A native date field opens the phone's
                own picker, which is the calendar people already know, and min/max
                keep it inside the period on screen. */}
            <div className="kt-today-pick">
              <input
                type="date" value={cardRow.iso} min={firstIso} max={lastIso}
                aria-label={t('pickDate')}
                onChange={(e) => setCardIso(e.target.value || null)}
              />
              {!isToday && todayRow && (
                <button className="kt-today-back" onClick={() => setCardIso(null)}>
                  {t('backToday')}
                </button>
              )}
            </div>

            <div className="kt-today-t">
              {cardRow.inH != null
                ? (
                  <>
                    <b>{pad2(cardRow.inH)}:{pad2(cardRow.inM || 0)}</b>
                    <i>–</i>
                    {cardRow.outH != null
                      ? <b>{pad2(cardRow.outH)}:{pad2(cardRow.outM || 0)}</b>
                      : <b className="kt-wait">--:--</b>}
                    {cardRow.calc.inside > 0 && (
                      <span className="kt-today-w">
                        {t('worked')} {fmtHM(cardRow.calc.inside + cardRow.calc.show.overtime)}
                      </span>
                    )}
                  </>
                )
                : <span className="kt-today-none">{cardRow.status1 || t('todayNone')}</span>}
            </div>

            {/* The one tap, for the ordinary day. 出勤 and 退勤 stamp the clock
                as it reads now, so they belong to today alone; on any other day
                the fields below are the way in. */}
            {isToday && (
              <div className="kt-today-b">
                {cardRow.inH == null
                  ? <button className="btn primary wide" onClick={clockIn}>{t('clockIn')}</button>
                  : cardRow.outH == null
                    ? <button className="btn primary wide" onClick={clockOut}>{t('clockOut')}</button>
                    : null}
              </div>
            )}

            {/* 休みにする — the other thing a month is made of.

                This screen could only clock in and out; a day off meant
                finding 勤怠状況 among nine entries in a panel you had to
                open first. Booking leave is half of what people come here
                to do, and on any day rather than only today: the date
                picker above loads next Thursday as readily as this
                morning, so a day can be taken in advance.

                Tapping the one already set clears it, because the common
                correction is undoing yesterday's wrong tap. */}
            {!locked && cardRow.inH == null && (
              <div className="kt-leave">
                <span className="kt-leave-l">{t('takeLeave')}</span>
                <div className="kt-leave-b">
                  {LEAVE_QUICK.map((kind) => (
                    <button
                      key={kind} type="button"
                      className={`btn sm${cardRow.status1 === kind ? ' primary' : ''}`}
                      onClick={() => setDay(cardRow.iso, {
                        status1: cardRow.status1 === kind ? '' : kind,
                      })}
                    >{kind}</button>
                  ))}
                </div>
              </div>
            )}
            {cardRow.status1 && LEAVE.includes(cardRow.status1) && (
              <p className="kt-leave-n">{t('leaveNote').replace('{k}', cardRow.status1)}</p>
            )}

            {/* and everything else about the day, open, not behind a dialog */}
            {isToday && (
              <button
                className="kt-today-more" onClick={() => setMore((v) => !v)}
                aria-expanded={more}
              >
                {more ? t('todayLess') : t('todayMore')}<i>{more ? '▲' : '▼'}</i>
              </button>
            )}
            {(more || !isToday) && (
              <div className="kt-today-f">
                <DayFields
                  row={cardRow} rules={rules} locked={locked}
                  setDay={setDay} t={t} lang={lang}
                />
              </div>
            )}
          </div>
        )}

        <div className="card pad-less">
          {!locked && <button className="btn wide" onClick={fillWeekdays}>{t('fillAll')}</button>}
          <button className={`btn wide${locked ? ' primary' : ''}${locked ? '' : ' mt8'}`} disabled={!!busy} onClick={() => download()}>
            {busy || t('download')}
          </button>
          {/* Only where the server can convert. A button that answers 503 is
              worse than one that is not there. */}
          {canPdf && (
            <button className="btn wide mt8" disabled={!!busy} onClick={() => download('pdf')}>
              {t('downloadPdf')}
            </button>
          )}
          <p className="muted sm mt8">{t('downloadNote')}</p>
          {locked && <p className="muted sm">{t('lockedNote')}</p>}
        </div>

      </div>

      <aside className="kt-aside">
        <div className="sechead">
          <span>{t('entryHead')}</span>
          {saveState && (
            <span className={'savestate ' + saveState}>
              {saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('saved') : t('saveFail')}
            </span>
          )}
        </div>

        {/* 佐野と本人:「日付を押すたびにポップアップが出るのが煩わしい」.
            So the row is the editor. 始業 and 終業 are real time inputs you
            type into, 勤怠状況 is a select, and the figures beside them move
            as you type — which is what a timesheet is, and no dialog can be
            in the way of a thing that is already on screen.

            Not a <button> any more: a row that contains inputs cannot be one
            without swallowing their clicks. The date is the button, and it
            loads the day into the card above for 備考 and 勤怠状況②. */}
        <div className="kt-list">
          {month.rows.map((r) => {
            const c = r.calc;
            const cls = r.dow === 0 ? 'sun' : r.dow === 6 ? 'sat' : r.holiday ? 'sun' : '';
            const has = r.inH != null || r.status1;
            return (
              <div
                key={r.iso}
                className={`kt-row ${cls} ${has ? '' : 'empty'}${r.iso === cardIso ? ' on' : ''}`}
              >
                <button
                  type="button" className="kt-d" onClick={() => setCardIso(r.iso)}
                  title={t('openInCard')}
                >
                  {r.dom}<em>{DOW_JA[r.dow]}</em>
                </button>

                <input
                  type="time" className="kt-in" value={hhmmOf(r.inH, r.inM)} disabled={locked}
                  aria-label={`${r.dom} ${t('start')}`}
                  onChange={(e) => setTimeOn(r.iso, 'in', e.target.value)}
                />
                <input
                  type="time" className="kt-in" value={hhmmOf(r.outH, r.outM)} disabled={locked}
                  aria-label={`${r.dom} ${t('end')}`}
                  onChange={(e) => setTimeOn(r.iso, 'out', e.target.value)}
                />
                <select
                  className="kt-st" value={r.status1 || ''} disabled={locked}
                  aria-label={`${r.dom} ${t('status')}`}
                  onChange={(e) => setDay(r.iso, { status1: e.target.value })}
                >
                  <option value="">—</option>
                  {STATUS_1.map((x) => <option key={x}>{x}</option>)}
                </select>

                <span className="kt-v">{c.inside ? fmtHM(c.inside) : ''}</span>
                <span className="kt-v ot">{c.show?.overtime ? fmtHM(c.show.overtime) : ''}</span>
                {c.notice
                  ? <span className={`kt-n ${c.notice === '要' ? 'req' : ''}`}>{c.notice}</span>
                  : <span className="kt-n blank" />}
              </div>
            );
          })}
        </div>
      </aside>

      <div className="kt-rest">

        <div className="sechead"><span>{t('todokeHead')}</span></div>
        <div className="card pad-less">
          <p className="muted sm">{t('todokeNote')}</p>
          {!notices.length && <p className="muted sm mt8">{t('todokeNone')}</p>}
          {notices.map((n) => {
            const k = n.from.iso + n.kind;
            const span = n.days > 1
              ? `${n.from.dom}日（${DOW_JA[n.from.dow]}）〜 ${n.to.dom}日（${DOW_JA[n.to.dow]}）`
              : `${n.from.dom}日（${DOW_JA[n.from.dow]}）`;
            return (
              <div className="kt-td" key={k}>
                <div className="kt-td-h">
                  <strong>{n.kind}</strong>
                  <span>{span}{n.days > 1 ? ` · ${n.days}${t('days_')}` : ''}</span>
                </div>
                <label className="fld">
                  <span>{t('todokeReason')}</span>
                  <input
                    value={reasons[k] || ''} maxLength={60} placeholder={t('todokeReasonPh')}
                    onChange={(e) => setReasons((r) => ({ ...r, [k]: e.target.value }))}
                  />
                </label>
                {canPdf && (
                  <button className="btn wide mt8" disabled={!!busy} onClick={() => makeTodoke(n, 'pdf')}>
                    {t('downloadPdf')}
                  </button>
                )}
                <button className="btn wide" disabled={!!busy} onClick={() => makeTodoke(n)}>
                  {busy || t('todokeMake')}
                </button>
              </div>
            );
          })}
        </div>

        <div className="sechead"><span>{t('totals')}</span></div>
        <div className="card kt-tot">
          <div className="kt-tot-g">
            <div><span>{t('tInside')}</span><HM hours={month.inside} t={t} /></div>
            <div><span>{t('tDeduct')}</span><HM hours={month.deduct} t={t} /></div>
            <div><span>{t('tOtDay')}</span><HM hours={month.otWeekday} t={t} /></div>
            <div><span>{t('tOtNight')}</span><HM hours={month.otWeekdayNight} t={t} /></div>
            <div><span>{t('tOtHol')}</span><HM hours={month.otHoliday} t={t} /></div>
            <div><span>{t('tOtHolNight')}</span><HM hours={month.otHolidayNight} t={t} /></div>
          </div>
          {alert60 > 0 && (
            <p className="kt-warn">{t('over60').replace('{n}', fmtHM(alert60 + 60))}</p>
          )}
          <div className="kt-cnt">
            {[
              ['cShotei', month.counts.shotei], ['cWorked', month.counts.worked],
              ['cPaid', month.counts.paidLeave], ['cAbsent', month.counts.absent],
              ['cSpecial', month.counts.special], ['cHolSat', month.counts.holidaySat],
              ['cHolSun', month.counts.holidaySun], ['cFurikae', month.counts.furikae],
            ].map(([k, v]) => (
              <div key={k}><span>{t(k)}</span><b>{v}<em>{t('day')}</em></b></div>
            ))}
          </div>
        </div>

        {!locked && (
          <div className="card pad-less kt-submit">
            <button
              className="btn primary big wide" disabled={blanks > 0}
              onClick={() => setAsk(true)}
            >
              {blanks > 0 ? t('submitBlank').replace('{n}', blanks) : t('submit')}
            </button>
            {blanks > 0 && <p className="muted sm mt8">{t('blankDays')}</p>}
          </div>
        )}
      </div>
      </div>

      {ask && (
        <div className="ovl" onClick={() => setAsk(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-h">
              <strong>{t('submitTitle')}</strong>
              <button className="x" onClick={() => setAsk(false)} aria-label="close">✕</button>
            </div>
            <div className="sheet-b">
              <p className="muted">{t('submitBody')}</p>
              <div className="kv"><span>{t('tInside')}</span><HM hours={month.inside} t={t} /></div>
              <div className="kv"><span>{t('tOtDay')}</span><HM hours={month.otWeekday} t={t} /></div>
              <div className="kv"><span>{t('tOtNight')}</span><HM hours={month.otWeekdayNight} t={t} /></div>
              <div className="kv"><span>{t('cWorked')}</span><strong>{month.counts.worked}</strong></div>
              <div className="navrow mt8">
                <button className="btn ghost" onClick={() => setAsk(false)}>{t('cancel')}</button>
                <button className="btn primary grow" onClick={submit}>{t('submit')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export const KINTAI_CSS = `
.kt-tot .kt-tot-g{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--hair);
  border:1px solid var(--hair);border-radius:8px;overflow:hidden}
.kt-tot-g>div{background:#fff;padding:9px 11px;min-width:0}
.kt-tot-g span{display:block;font-size:10.5px;color:var(--ink-2);line-height:1.4;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kt-tot-g strong{font-size:19px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.kt-tot-g strong em{font-style:normal;font-size:11px;font-weight:500;color:var(--dim);margin:0 3px 0 1px}
.kt-tot-g strong.kt-zero{color:var(--faint)}
.kt-cnt{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-top:13px}
.kt-cnt>div{display:flex;justify-content:space-between;align-items:baseline;
  font-size:11.5px;color:var(--ink-2);border-bottom:1px dotted var(--hair);padding-bottom:3px}
.kt-cnt b{font-size:14px;color:var(--ink);font-variant-numeric:tabular-nums}
.kt-cnt b em{font-style:normal;font-size:10.5px;color:var(--dim);margin-left:2px;font-weight:400}
.kt-warn{margin:10px 0 0;font-size:12px;color:var(--warn);line-height:1.6}
.kt-why{margin:0 0 14px;padding:9px 11px;border-radius:7px;background:var(--warn-wash);
  border:1px solid #EBD3CF;font-size:12px;color:var(--ink-2);line-height:1.6}
.kt-note{margin:10px 0 0;font-size:12px;color:var(--brand);line-height:1.6}

/* きょう — the one card someone opens the app to use. Big enough to hit
   without looking, and it says what state the day is in before it says
   anything else. */
.kt-today{border:1px solid var(--brand);box-shadow:0 1px 3px rgba(12,104,179,.08)}
.kt-today-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.kt-today-h .clabel{font-size:12.5px;font-weight:600;color:var(--brand)}
.kt-today-pick{display:flex;gap:8px;align-items:center;margin:8px 0 2px}
.kt-today-pick input[type=date]{flex:1;min-width:0;padding:9px 11px;font-size:15px;
  font-variant-numeric:tabular-nums;border:1px solid var(--rule-2);border-radius:8px;
  background:#fff;color:var(--ink)}
.kt-today-back{flex:none;padding:9px 12px;font-size:13px;font-weight:600;
  color:var(--brand);background:#fff;border:1px solid var(--brand);border-radius:8px}
.kt-today-ok{font-size:10.5px;font-weight:600;color:var(--brand);
  background:var(--brand-wash);padding:2px 7px;border-radius:3px}
.kt-today-t{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;margin:10px 0 13px}
.kt-today-t b{font-size:27px;font-weight:700;color:var(--ink);
  font-variant-numeric:tabular-nums;line-height:1.1}
.kt-today-t b.kt-wait{color:var(--faint)}
.kt-today-t i{font-style:normal;font-size:19px;color:var(--dim)}
.kt-today-w{font-size:12px;color:var(--ink-2);margin-left:4px}
.kt-today-none{font-size:15px;color:var(--faint)}
.kt-today-b:empty{display:none}
.kt-today-b{display:flex;gap:9px}
/* Booking a day off. Sits under 出勤/退勤 because it is the other half of
   what a month is made of, not a setting tucked inside a panel. */
.kt-leave{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;
  padding-top:10px;border-top:1px solid var(--hair)}
.kt-leave-l{font-size:12.5px;font-weight:600;color:var(--ink-2);flex:none}
.kt-leave-b{display:flex;gap:6px;flex-wrap:wrap}
.kt-leave-b .btn{padding:6px 11px;font-size:12.5px}
.kt-leave-n{margin:8px 0 0;font-size:12.5px;font-weight:600;color:var(--brand)}
.kt-today-b .grow{flex:1}
.kt-today-b .btn{padding:13px 14px;font-size:14.5px}
.kt-today-more{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;
  margin-top:11px;padding:8px;border:0;background:none;font:inherit;font-size:12px;
  font-weight:600;color:var(--brand)}
.kt-today-more i{font-style:normal;font-size:8px}
.kt-today-f{margin-top:4px;padding-top:13px;border-top:1px solid var(--hair)}
.kt-today-f .kt-day-sum{margin-bottom:2px}

.kt-submit{margin-top:14px}
.kt-td{padding:12px 0;border-top:1px solid var(--hair);margin-top:10px}
.kt-td:first-of-type{border-top:0}
.kt-td-h{display:flex;justify-content:space-between;align-items:baseline;
  gap:10px;margin-bottom:9px}
.kt-td-h strong{font-size:14px;color:var(--ink)}
.kt-td-h span{font-size:12px;color:var(--ink-2);text-align:right}
.kt-td .fld{margin-bottom:10px}
/* The month, as a sheet you type into. Every row is the same grid so the
   columns line up down the page and the eye can run down 始業 alone. */
.kt-list{border-top:1px solid var(--hair)}
.kt-row{display:grid;grid-template-columns:44px 1fr 1fr 1fr 42px 42px 20px;
  align-items:center;gap:5px;width:100%;padding:3px 10px;background:#fff;
  border-bottom:1px solid var(--hair);text-align:left;font:inherit}
.kt-row.sun{background:var(--warn-wash)} .kt-row.sat{background:var(--sat-wash)}
.kt-row.on{box-shadow:inset 3px 0 0 var(--brand)}
.kt-row .kt-d{font-size:13.5px;font-weight:600;color:var(--ink);background:none;
  border:0;padding:3px 0;text-align:left;font-family:inherit}
.kt-row .kt-d:hover{color:var(--brand)}
.kt-row .kt-d em{font-style:normal;font-size:11px;color:var(--ink-2);margin-left:3px;font-weight:400}
.kt-row.sun .kt-d{color:var(--warn)} .kt-row.sat .kt-d{color:var(--sat)}

/* Inputs that look like text until you touch them: thirty bordered boxes
   down a page is a wall, and the figures beside them are what matters. */
.kt-row .kt-in,.kt-row .kt-st{width:100%;min-width:0;font-size:12.5px;
  font-family:inherit;color:var(--ink);background:transparent;
  border:1px solid transparent;border-radius:3px;padding:2px 3px}
.kt-row .kt-in{font-variant-numeric:tabular-nums}
.kt-row .kt-in:hover,.kt-row .kt-st:hover{border-color:var(--rule);background:#fff}
.kt-row .kt-in:focus,.kt-row .kt-st:focus{border-color:var(--brand);background:#fff;outline:0}
.kt-row .kt-in:disabled,.kt-row .kt-st:disabled{color:var(--dim);border-color:transparent}
.kt-row.empty .kt-in,.kt-row.empty .kt-st{color:var(--faint)}

.kt-row .kt-v{text-align:right;font-size:12px;
  color:var(--ink-2);font-variant-numeric:tabular-nums}
.kt-row .kt-v.ot{color:var(--warn);font-weight:600}
.kt-row .kt-n{font-size:10px;padding:1px 4px;border-radius:3px;text-align:center;
  background:var(--brand-wash);color:var(--brand);font-weight:600}
.kt-row .kt-n.req{background:var(--warn-wash);color:var(--warn)}
.kt-row .kt-n.blank{background:none}

/* On a phone the same six columns are 60px each, which clips a time input
   to '07:30' with the PM cut off and squeezes 有給休暇 out of its cell. So
   below the two-column breakpoint the row takes two lines: the day and its
   figures on top, the times and the status underneath, both at a width you
   can actually read and tap. */
@media(max-width:1023px){
  .kt-row{grid-template-columns:44px 1fr 1fr 44px 44px 20px;
    grid-template-areas:'d  in  out  v1 v2 n'
                        'd  st  st   st st st';
    row-gap:2px;padding:5px 10px}
  .kt-row .kt-d{grid-area:d;align-self:start;padding-top:5px}
  .kt-row .kt-in:nth-of-type(1){grid-area:in}
  .kt-row .kt-in:nth-of-type(2){grid-area:out}
  .kt-row .kt-st{grid-area:st}
  .kt-row .kt-v:nth-of-type(1){grid-area:v1}
  .kt-row .kt-v:nth-of-type(2){grid-area:v2}
  .kt-row .kt-n{grid-area:n}
  .kt-row .kt-in,.kt-row .kt-st{border-color:var(--hair);background:#fff;padding:3px 4px}
}

.kt-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.kt-time input[type=time]{width:100%;font-size:19px;font-weight:600;letter-spacing:.02em;
  font-variant-numeric:tabular-nums;text-align:center;padding:11px 8px}
/* iOS leaves a time input looking like text until it is told otherwise */
.kt-time input[type=time]::-webkit-date-and-time-value{text-align:center;margin:0}

/* the sheet's own header: ‹ day › and a close, so a week of exceptions is one
   pass rather than seven open-and-close rounds */
.kt-sheet-h{gap:4px}
.kt-sheet-h strong{flex:1;text-align:center;font-size:15px}
.kt-step{border:0;background:rgba(255,255,255,.14);color:#fff;font-size:17px;line-height:1;
  width:32px;height:32px;border-radius:6px;flex:none}
.kt-step:disabled{opacity:.3}
.kt-day-sum{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:4px;
  background:var(--hair);border:1px solid var(--hair);border-radius:8px;overflow:hidden}
.kt-day-sum>div{background:var(--wash);padding:8px 6px;text-align:center}
.kt-day-sum span{display:block;font-size:10.5px;color:var(--ink-2)}
.kt-day-sum b{font-size:14px;color:var(--ink);font-variant-numeric:tabular-nums}
.kt-day-sum b em{font-style:normal;font-size:10px;color:var(--dim);margin-left:1px;font-weight:400}
.btn.wide{width:100%}
.mt8{margin-top:9px}
.card.pad-less{padding:12px 14px}

/* ---- 勤怠 on a wide screen --------------------------------------------
   Three things were wrong with one column here, and they were the same
   thing: the month list is thirty rows, so everything after it was off
   the bottom of the screen. Choosing the 9th meant scrolling down to find
   it, clicking, and scrolling back up to type.

   The list moves to a column of its own and stays put while the page
   scrolls, so the day you are editing and the day you are choosing are
   visible at the same time. The fields that were stacked two-high become
   one row of four, which is the whole day on one line.

   The breakpoint matches the shell's. Below it nothing here applies and
   the phone layout stands, which is why the markup is still in phone
   order and only the grid moves it.
----------------------------------------------------------------------- */
@media(min-width:1024px){
  .kt-cols{display:grid;grid-template-columns:430px minmax(0,1fr);
    align-items:start}
  .kt-aside{grid-column:1;grid-row:1/span 2;position:sticky;top:64px;
    max-height:calc(100vh - 64px);overflow:auto;
    border-right:1px solid var(--rule);background:#fff}
  .kt-top{grid-column:2;grid-row:1;min-width:0}
  .kt-rest{grid-column:2;grid-row:2;min-width:0}

  /* The list is now a column rather than a page, so it can lose the
     breathing room it needed when it was the full width of a phone. */
  .kt-aside .kt-row{padding-top:6px;padding-bottom:6px}

  .kt-today-f>.navrow{margin-top:4px}
  .kt-today-f>.navrow .btn{flex:0 1 auto}

  /* 出勤 is the one tap most days need, so it stays prominent — but a
     button the width of the window is not prominence, it is just a wall.

     The day being edited, how it currently stands and the tap that changes
     it are one thought, so on a wide screen they are one line instead of
     three stacked bands with nothing to their right. */
  .card.kt-today{display:grid;grid-template-columns:auto minmax(0,1fr) auto;
    align-items:center;column-gap:18px}
  .kt-today-h,.kt-today-more,.kt-today-f{grid-column:1/-1}
  .kt-today-pick{grid-column:1;margin:6px 0}
  .kt-today-t{grid-column:2;margin:6px 0}
  .kt-today-b{grid-column:3}
  .kt-today-b .btn.wide{width:auto;min-width:200px}
  .kt-today-pick input[type=date]{flex:0 1 210px}
  .kt-today-more{padding:5px 0;margin-top:0;font-size:12px}

  /* 「でかいフォントとでかいボタン」. The card is a status line and one
     action, not a poster: the clock reads at 18px instead of 27, the
     labels at 11, and 出勤 is a button rather than a banner. */
  .kt-today-t b{font-size:18px}
  .kt-today-t i{font-size:14px}
  .kt-today-b .btn.wide{width:auto;min-width:132px;padding:8px 18px;font-size:14px}
  .kt-today-f .fld>span,.kt-today-f label>span{font-size:11px}
  .kt-today-f .navrow{margin-top:2px}
  .kt-today-f .navrow .btn{padding:6px 13px;font-size:13px}
  /* .kt-today-f input is one class and one type, which is exactly what
     .fld input is — and the app's sheet is concatenated after this one, so
     the tie went to the base rule and these were never actually smaller.
     Going through .fld wins it on specificity rather than on order. */
  .kt-today-f .fld input,.kt-today-f .fld select,
  .kt-today-f .fld textarea{padding:5px 9px;font-size:13.5px;line-height:1.6}
  .kt-today-f .fld select{padding-right:26px;background-position:right 9px center}
  .kt-today-f .fld{margin-bottom:8px}

  /* The four figures underneath were a 58px band for four short numbers. */
  .kt-today-f .kt-day-sum{margin-top:2px}
  .kt-today-f .kt-day-sum>div{padding:3px 6px;line-height:1.45}
  .kt-today-f .kt-day-sum span{font-size:9.5px;line-height:1.4}
  .kt-today-f .kt-day-sum b{font-size:12.5px;line-height:1.4}
  .kt-today-f .kt-time input[type=time]{font-size:13.5px;padding:5px 8px;line-height:1.6}
  .kt-day-sum>div{padding:5px 6px}
  .kt-day-sum span{font-size:10px}
  .kt-day-sum b{font-size:13px}
  .card.pad-less>.btn{padding:7px 14px;font-size:13.5px}
}

/* 始業・終業・勤怠状況・勤怠状況② on one line — the whole day in a single
   row. It needs more than the two-column layout alone does: with the month
   list taking 332px, four fields do not have room until the window is this
   wide, and below it the existing pairs stack two-and-two as they always
   have. display:contents is what lets those pairs hand their children
   straight to this grid, so the markup never has to change for either. */
@media(min-width:1280px){
  .kt-today-f{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
    column-gap:14px}
  .kt-today-f>.kt-two{display:contents}
  .kt-today-f>.navrow,.kt-today-f>.fld,.kt-today-f>.kt-day-sum,
  .kt-today-f>.kt-why,.kt-today-f>.kt-warn,.kt-today-f>.kt-note{grid-column:1/-1}
}
`;
