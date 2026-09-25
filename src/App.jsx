import React, { useState, useEffect, useMemo, useCallback, useContext, createContext } from 'react';
import * as XLSX from 'xlsx';
import MoraBot, { MORABOT_CSS } from './MoraBot';
import {
  S, registerTrial, saveFeedback, fetchFeedback,
  IS_LOCAL, fetchBootstrap, apiLogin, apiLogout, apiMe, apiSaveMe, setLeaving,
} from './storage';
import { DEFAULT_REGIONS, DEFAULT_CFG, ROSTER_SEED, orderRegions } from './defaults';
import emailjs from '@emailjs/browser';
import { reminderMail, companyEmail, deadlineTextJa, deadlineTextEn } from './mail';

/* ============================================================================
   社内DXポータル / In-house DX Portal
   Module 1: 万歩計集計 (Pedometer step-count aggregation)

   Designed so additional modules (勤怠 / 旅費精算) drop into MODULES below.
   Storage: window.storage (shared) — swap the S.* adapter for an AWS API
   client (API Gateway + Lambda + DynamoDB/RDS) with no UI changes.
============================================================================ */




/* --- Japanese public holidays: fallback table, refreshed from the web on load
       (spec 9: 祝日情報は Web 上の日本の祝日データを参照) ------------------- */
const HOLIDAYS_FALLBACK = {
  '2025-01-01': '元日', '2025-01-13': '成人の日', '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日', '2025-02-24': '休日', '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日', '2025-05-03': '憲法記念日', '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日', '2025-05-06': '休日', '2025-07-21': '海の日',
  '2025-08-11': '山の日', '2025-09-15': '敬老の日', '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日', '2025-11-03': '文化の日', '2025-11-23': '勤労感謝の日',
  '2025-11-24': '休日',
  '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日', '2026-03-20': '春分の日', '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日', '2026-05-05': 'こどもの日',
  '2026-05-06': '休日', '2026-07-20': '海の日', '2026-08-11': '山の日',
  '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日', '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
  '2027-01-01': '元日', '2027-01-11': '成人の日', '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日', '2027-03-21': '春分の日', '2027-03-22': '休日',
  '2027-04-29': '昭和の日', '2027-05-03': '憲法記念日', '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日', '2027-07-19': '海の日', '2027-08-11': '山の日',
  '2027-09-20': '敬老の日', '2027-09-23': '秋分の日', '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日', '2027-11-23': '勤労感謝の日',
};

/* --- Future modules plug in here ------------------------------------------ */
const MODULES = [
  { id: 'steps', ja: '万歩計', en: 'Pedometer', ready: true },
  { id: 'timesheet', ja: '勤怠', en: 'Timesheet', ready: false },
  { id: 'expense', ja: '旅費精算', en: 'Expenses', ready: false },
];

/* ============================== i18n ====================================== */
const LangCtx = createContext('ja');
const useLang = () => useContext(LangCtx);

const STR = {
  portal: ['社内DXポータル', 'In-house DX Portal'],
  formTitle: ['健康対策推進活動・万歩計実績表', 'Health Promotion Activity — Pedometer Record'],
  record: ['今月の記録', 'This month'],
  entryHead: ['日別歩数', 'Daily steps'],
  moduleSub: ['健康対策委員会', 'Health Promotion Committee'],
  employeeId: ['社員番号', 'Employee ID'],
  login: ['ログイン', 'Sign in'],
  loginHint: ['社員番号を入力してください', 'Enter your employee ID'],
  tooMany: ['試行回数が多すぎます。しばらくしてからお試しください。', 'Too many attempts — please wait a moment.'],
  notFound: ['該当する社員番号がありません', 'No matching employee ID'],
  logout: ['ログアウト', 'Sign out'],
  admin: ['管理者', 'Administrator'],
  soon: ['準備中', 'Coming soon'],
  soonBody: ['この機能は今後のリリースで追加されます。', 'This module will be added in a future release.'],
  entry: ['歩数入力', 'Step entry'],
  mypage: ['マイページ', 'My page'],
  dashboard: ['集計', 'Summary'],
  bonusTab: ['完歩賞', 'Bonus'],
  people: ['対象者', 'Participants'],
  settings: ['設定', 'Settings'],
  period: ['対象期間', 'Target period'],
  monthly: ['月度', ''],
  calendar: ['カレンダー', 'Calendar'],
  list: ['リスト', 'List'],
  total: ['合計歩数', 'Total steps'],
  entered: ['入力済', 'Entered'],
  days: ['日', 'days'],
  bonusStatus: ['完歩賞', 'Walking bonus'],
  onTrack: ['達成見込み', 'On track'],
  notQualified: ['対象外', 'Not qualified'],
  incomplete: ['未入力あり', 'Incomplete'],
  submitted: ['提出済', 'Submitted'],
  notSubmitted: ['未提出', 'Not submitted'],
  submit: ['提出する', 'Submit'],
  submitConfirmTitle: ['提出しますか？', 'Submit this month?'],
  submitConfirmBody: ['提出後は修正できません。', 'You cannot edit after submitting.'],
  cancel: ['キャンセル', 'Cancel'],
  confirm: ['提出する', 'Submit'],
  lockedNote: ['提出済みのため編集できません。修正が必要な場合は総務へ連絡してください。', 'Locked after submission. Contact General Affairs if you need a correction.'],
  missingNote: ['未入力の日があります。歩かなかった日は 0 を入力してください。', 'Some days are blank. Enter 0 for days you did not walk.'],
  windowClosed: ['提出期間外です', 'Outside the submission window'],
  windowNote: ['提出期間：締め後（21日）〜翌月1日（25日にお知らせ、26日にリマインド）', 'Submission: from the 21st to the 1st of the next month (notice on the 25th, reminder on the 26th)'],
  consentLabel: ['5,000歩に届かない月でもリマインドメールを受け取り、期限（翌月1日）までに提出がない場合は、未入力の日を0歩として自動的に提出されることに同意します。', 'I agree to receive a reminder email even in months where I do not reach 5,000 steps, and to have my record submitted automatically with blank days counted as 0 if I have not submitted by the deadline (the 1st of the following month).'],
  consentDone: ['自動提出に同意済み', 'Auto-submission consent recorded'],
  consentOptional: ['任意です。チェックしなくてもログインできます。', 'Optional — you can sign in either way.'],
  unsubmitted: ['未提出', 'Outstanding'],
  reminders: ['未提出・リマインド', 'Reminders'],
  finalDeadline: ['最終締切', 'Final deadline'],
  consent: ['自動提出同意', 'Auto-submit consent'],
  autoTag: ['自動提出', 'Auto'],
  showMail: ['文面を表示', 'Preview mail'],
  copyBody: ['本文をコピー', 'Copy body'],
  openMail: ['メールを開く', 'Open in mail'],
  runAuto: ['自動提出を実行', 'Run auto-submission'],
  runAutoNote: ['同意済みかつ未提出の方について、未入力の日を0歩として提出済みにします。通常は翌月2日以降にサーバーが自動実行します。', 'Marks consented, unsubmitted records as submitted with blank days as 0. Normally the server runs this from the 2nd of the following month.'],
  autoDone: ['{n}名を自動提出しました', 'Auto-submitted {n}'],
  notDueYet: ['まだ自動提出の期日（翌月2日）ではありません。実行しますか？', 'The auto-submission date (the 2nd) has not arrived. Run anyway?'],
  noneOutstanding: ['未提出者はいません', 'Nobody outstanding'],
  cannotUnlockAuto: ['自動提出された記録は取り消せません', 'Auto-submitted records cannot be reopened'],
  save: ['保存', 'Save'],
  clear: ['クリア', 'Clear'],
  prevDay: ['前', 'Prev'],
  nextDay: ['次', 'Next'],
  steps: ['歩数', 'Steps'],
  sat: ['土曜日', 'Saturday'],
  sunHol: ['日・祝日', 'Sunday / holiday'],
  blank: ['未入力', 'Blank'],
  name: ['氏名', 'Name'],
  region: ['所属地域', 'Region'],
  gender: ['性別', 'Gender'],
  male: ['男', 'Male'],
  female: ['女', 'Female'],
  pedometerNo: ['万歩計№', 'Pedometer No.'],
  email: ['メールアドレス', 'Email'],
  saved: ['保存しました', 'Saved'],
  saveSettings: ['設定を保存', 'Save settings'],
  saveFailed: ['保存できませんでした', 'Could not save'],
  unsaved: ['未保存の変更があります', 'You have unsaved changes'],
  adminIdsRequired: ['管理者IDは1つ以上必要です', 'At least one administrator ID is required'],
  participants: ['対象者数', 'Participants'],
  submittedCount: ['提出済', 'Submitted'],
  bonusCount: ['完歩賞対象者', 'Bonus recipients'],
  payout: ['合計支給額', 'Total payout'],
  download: ['万歩計集計表をダウンロード', 'Download Excel'],
  exportLayout: ['Excelの列構成', 'Excel column layout'],
  layoutSpec: ['仕様書準拠（送信方法・支給金額なし）', 'Per spec (no submission-method / payout columns)'],
  layoutLegacy: ['現行ファイル互換（送信方法・支給金額あり）', 'Legacy compatible (keeps both columns)'],
  search: ['検索', 'Search'],
  allRegions: ['すべての地域', 'All regions'],
  allStatus: ['すべての状態', 'All statuses'],
  sortBy: ['並び替え', 'Sort'],
  asc: ['昇順', 'Asc'],
  desc: ['降順', 'Desc'],
  botAlt: ['モラボット', 'MoraBot'],
  botHello: ['こんにちは！\n今日も歩きましたか？', 'Hello! Did you get your steps in today?'],
  today: ['きょう', 'Today'],
  goalSteps: ['目標 {n}歩', 'Goal {n} steps'],
  toGoal: ['あと {n}歩でゴール', '{n} steps to go'],
  goalHit: ['今日のゴール達成！', 'Today\u2019s goal reached'],
  notWalkedYet: ['入力するとモラボットが歩きはじめます', 'Enter a day and MoraBot sets off'],
  bonusWon: ['完歩賞 獲得', '完歩賞 earned'],
  bonusWonNote: ['全日 {n}歩を達成しました。おめでとうございます！', 'Every day cleared {n} steps. Congratulations!'],
  periodShort: ['今回は届きませんでした', 'Not quite, this time'],
  periodShortNote: ['また来月いっしょに歩きましょう。', 'Let\u2019s walk again next month.'],
  hitTitle: ['やりましたね！', 'Nicely done'],
  hitBody: ['{d}　合計 {n}歩', '{d} — {n} steps in total'],
  hitCount: ['{n}日すべてで {g}歩を達成しました', 'All {n} days cleared {g} steps'],
  hitClose: ['つづける', 'Carry on'],
  saving: ['保存中…', 'Saving…'],
  savedOk: ['保存済み', 'Saved'],
  saveFail: ['保存できませんでした。通信を確認してください。', 'Could not save — check your connection.'],
  unlock: ['提出を取り消す', 'Reopen'],
  unlockDone: ['提出を取り消しました', 'Reopened for editing'],
  detail: ['明細', 'Detail'],
  close: ['閉じる', 'Close'],
  copyEmails: ['未提出者のメールをコピー', 'Copy emails of non-submitters'],
  copied: ['コピーしました', 'Copied'],
  addPerson: ['対象者を追加', 'Add participant'],
  edit: ['編集', 'Edit'],
  remove: ['削除', 'Delete'],
  removeConfirm: ['この対象者を削除しますか？\n記録は残り、「削除済みを表示」から確認・復元できます。',
    'Remove this participant?\nTheir records are kept and can be seen or restored from 削除済みを表示.'],
  restore: ['復元', 'Restore'],
  restored: ['復元しました', 'Restored'],
  removed: ['削除しました', 'Removed'],
  showDeleted: ['削除済みを表示', 'Show removed'],
  deletedTag: ['削除済み', 'Removed'],
  deletedNote: ['削除した対象者は一覧と集計から外れますが、記録は残ります。ログインはできません。',
    'A removed participant drops out of the list and the totals, but their records are kept. They cannot sign in.'],
  regionMaster: ['地域マスタ', 'Region master'],
  addRegion: ['地域を追加', 'Add region'],
  rules: ['集計ルール', 'Aggregation rules'],
  threshold: ['完歩賞の基準歩数', 'Bonus threshold (steps)'],
  bonusAmount: ['完歩賞の支給額（円）', 'Bonus amount (JPY)'],
  adminIds: ['管理者のログインID（カンマ区切り）', 'Administrator IDs (comma separated)'],
  maxSteps: ['1日に入力できる上限歩数（この歩数以上は入力できません。）',
    'Maximum steps per day (entries of this many steps or more are rejected)'],
  overMax: ['{n}歩以上は入力できません', 'Enter fewer than {n} steps'],
  enforceWindow: ['提出期間の制限を有効にする', 'Enforce the submission window'],
  enforceNote: ['デモ中はOFFのままにするといつでも提出できます。', 'Leave off during the demo so submission works any day.'],
  demoData: ['デモデータを生成', 'Generate demo data'],
  demoNote: ['先頭40名にサンプル歩数を入れて提出済みにします。', 'Fills sample steps for the first 40 people and marks them submitted.'],
  resetAll: ['この月度のデータを削除', 'Delete this period’s data'],
  resetConfirm: ['この月度の入力データをすべて削除しますか？', 'Delete all entries for this period?'],
  loading: ['読み込み中…', 'Loading…'],
  noData: ['データがありません', 'No data yet'],
  required: ['必須', 'Required'],
  duplicateId: ['この社員番号は既に登録されています', 'That employee ID already exists'],
  qualified: ['○ 対象', '○ Qualified'],
  refresh: ['再読み込み', 'Refresh'],
  saveProfile: ['プロフィールを保存', 'Save profile'],
  status: ['状態', 'Status'],
  bonusRule: ['対象期間中、毎日 5,000 歩以上で 2,000 円', '5,000+ steps every single day of the period → ¥2,000'],
  targetStatus: ['目標達成状況', 'Target status'],
  trialSignup: ['お試し登録（対象者以外の方）', 'Trial sign-up (non-participants)'],
  trialTitle: ['お試し登録', 'Trial sign-up'],
  trialNote: ['対象者以外の方が、お試しでご利用いただくための登録です。入力された記録は、健康対策推進活動の集計・完歩賞には含まれません。', 'For people outside the official participant list who would like to try the system. Trial records are excluded from the aggregation and the walking bonus.'],
  dob: ['生年月日', 'Date of birth'],
  dobNote: ['今後パスワードとして使用する予定です。', 'This will be used as your password in a future update.'],
  register: ['登録する', 'Register'],
  registered: ['登録しました。ログインします。', 'Registered — signing you in.'],
  idExists: ['この社員番号はすでに登録されています。そのままログインしてください。', 'That employee number is already registered — please just sign in.'],
  trialTag: ['お試し', 'Trial'],
  showTrial: ['お試し登録者を表示', 'Show trial users'],
  trialCount: ['お試し登録', 'Trial users'],
  feedback: ['ご意見・不具合の報告', 'Feedback'],
  fbSend: ['送信する', 'Send'],
  fbThanks: ['ありがとうございました。受け付けました。', 'Thank you — your feedback has been received.'],
  fbCategory: ['種類', 'Category'],
  fbBug: ['不具合', 'Bug'],
  fbRequest: ['要望・提案', 'Request'],
  fbOther: ['その他', 'Other'],
  fbMessage: ['内容', 'Message'],
  fbList: ['いただいたご意見', 'Feedback received'],
  fbTab: ['ご意見', 'Feedback'],
  fbWhen: ['受信日時', 'Received'],
  fbFrom: ['送信者', 'From'],
  fbNone: ['まだご意見はありません', 'No feedback yet'],
  fbCount: ['{n}件', '{n} received'],
  fbMailed: ['通知済', 'Notified'],
  fbNotMailed: ['未通知', 'Not notified'],
  fbMailOff: ['メール通知は未設定です。ご意見はこの画面で確認してください。', 'Email notification is not configured — read feedback here.'],
  fbAnonymous: ['管理者', 'Administrator'],
  required: ['必須', 'Required'],
  company: ['モラブ阪神工業株式会社', 'Morabu Hanshin Kogyo Co., Ltd.'],
  eyebrow: ['健康対策推進活動', 'Health Promotion Activity'],
  mainTitle: ['万歩計実績表', 'Pedometer Record'],
  thisMonth: ['今月度', 'Current month'],
  subWindow: ['提出期間', 'Submission'],
  profileHead: ['登録情報', 'Your details'],
  hit: ['達成', 'Met'],
  notHit: ['未達成', 'Not met'],
  inProgress: ['入力中', 'In progress'],
  daysBelow: ['未達の日', 'Days below'],
  daysBlank: ['未入力', 'Blank'],
  targetPerDay: ['1日の目標', 'Daily target'],
};

function useT() {
  const lang = useLang();
  const i = lang === 'ja' ? 0 : 1;
  return useCallback((k) => (STR[k] ? (STR[k][i] || STR[k][0]) : k), [i]);
}

/* ============================ date helpers ================================ */
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
const DOW_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Period m of year y runs from (y, m-1, 21) to (y, m, 20). Key = YYMM. */
function periodKey(y, m) { return String(y % 100).padStart(2, '0') + pad(m); }
function periodStart(y, m) { return new Date(y, m - 2, 21); }
function periodEnd(y, m) { return new Date(y, m - 1, 20); }

function periodDays(y, m) {
  const out = [];
  const end = periodEnd(y, m);
  const cur = periodStart(y, m);
  while (cur <= end) {
    const d = new Date(cur);
    out.push({ date: d, iso: isoOf(d), dom: d.getDate(), dow: d.getDay(), mon: d.getMonth() + 1 });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** The 31 fixed slots of the paper form: 21..31 then 1..20. */
function formSlots(y, m) {
  const days = periodDays(y, m);
  const byDom = new Map(days.map((d) => [`${d.mon}-${d.dom}`, d]));
  const sm = periodStart(y, m).getMonth() + 1;
  const em = periodEnd(y, m).getMonth() + 1;
  const slots = [];
  for (let d = 21; d <= 31; d++) slots.push(byDom.get(`${sm}-${d}`) || { dom: d, none: true });
  for (let d = 1; d <= 20; d++) slots.push(byDom.get(`${em}-${d}`) || { dom: d, none: true });
  return slots;
}

function currentPeriod(today = new Date()) {
  let y = today.getFullYear();
  let m = today.getMonth() + 1;
  if (today.getDate() >= 21) { m += 1; if (m > 12) { m = 1; y += 1; } }
  return { y, m };
}

/** Opens the day after the 20th cutoff, closes end of the 1st of the next
    month. The 25th is only the first notice; the 26th reminder goes out to
    anyone still outstanding. */
function inSubmissionWindow(y, m, today = new Date()) {
  const from = new Date(y, m - 1, 21);
  const to = new Date(y, m, 1, 23, 59, 59);
  return today >= from && today <= to;
}
/** Auto-submission runs from the 2nd of the month after the period end. */
function autoSubmitDue(y, m, today = new Date()) {
  return today >= new Date(y, m, 2);
}

function fmtRange(y, m, lang) {
  const s = periodStart(y, m), e = periodEnd(y, m);
  return `${s.getMonth() + 1}/${s.getDate()} 〜 ${e.getMonth() + 1}/${e.getDate()}`;
}
const nf = (n) => (n == null ? '' : Number(n).toLocaleString('en-US'));

/* ============================== storage ===================================
   Swapped out for src/storage.js — see that file to point this at your own
   backend (AWS API Gateway / Lambda / DynamoDB) later.
========================================================================== */
const entryKey = (pk, id) => `st:${pk}:${id}`;

async function chunked(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/* ========================= auto-submission =================================
   Consented participants who have not submitted by the deadline are submitted
   for them, with every blank day recorded as 0. Someone who entered nothing at
   all gets an all-zero row. Normally the server runs this on the 2nd; the
   admin screen also runs it so the system stays correct without a server.
========================================================================== */
async function runAutoSubmit({ y, m, roster, cfg }) {
  const pk = periodKey(y, m);
  const days = periodDays(y, m);
  const done = [];
  for (const p of roster.filter((x) => x.active !== false && x.consent)) {
    const e = (await S.get(entryKey(pk, p.id))) || { steps: {} };
    if (e.submitted) continue;
    const steps = { ...(e.steps || {}) };
    days.forEach((d) => { if (steps[d.iso] == null || steps[d.iso] === '') steps[d.iso] = 0; });
    await S.set(entryKey(pk, p.id), {
      ...e, steps, submitted: true, auto: true, submittedAt: Date.now(),
    });
    done.push(p);
  }
  return done;
}

/* ============================ Excel export ================================ */
function buildWorkbook({ y, m, roster, entries, cfg, layout, lang }) {
  const days = periodDays(y, m);
  const slots = formSlots(y, m);
  const legacy = layout === 'legacy';
  const c = legacy
    ? { no: 0, id: 1, name: 2, method: 3, region: 4, gender: 5, day0: 6 }
    : { no: 0, id: 1, name: 2, region: 3, gender: 4, day0: 5 };
  c.total = c.day0 + 31;
  c.flag = c.total + 1;
  c.name2 = c.flag + 1;
  c.region2 = c.name2 + 1;
  c.email = c.region2 + 1;
  if (legacy) c.amount = c.email + 1;
  const lastCol = legacy ? c.amount : c.email;

  const A = (r, col) => XLSX.utils.encode_cell({ r, c: col });
  const L = (col) => XLSX.utils.encode_col(col);
  const ws = {};
  const put = (r, col, cell) => { ws[A(r, col)] = cell; };
  const s = (v) => ({ t: 's', v: String(v) });
  const n = (v) => ({ t: 'n', v: Number(v) });

  /* header block (rows 1-2) */
  put(0, 1, n(y)); put(0, 2, s('年')); put(0, 4, n(m)); put(0, 5, s('月分'));
  put(0, 6, s('（'));
  put(0, 7, { t: 'd', v: periodStart(y, m), z: 'yyyy/m/d' });
  put(0, 8, s('／')); put(0, 9, n(21)); put(0, 10, s('～'));
  put(0, 11, { t: 'd', v: periodEnd(y, m), z: 'yyyy/m/d' });
  put(0, 12, s('／')); put(0, 13, n(20)); put(0, 14, s('）'));
  put(1, 2, s('健康対策委員会'));

  /* column headers (row 4) + weekday row (row 5) */
  const regionHdr = '地区別\n１．姫路\n２．三田\n３．神戸\n４．大阪';
  put(3, c.no, s('参加人数')); put(3, c.id, s('社員№')); put(3, c.name, s('名前'));
  if (legacy) put(3, c.method, s('送信方法'));
  put(3, c.region, s(regionHdr)); put(3, c.gender, s('性別'));
  slots.forEach((sl, i) => {
    if (sl.none) return;
    put(3, c.day0 + i, { t: 'd', v: sl.date, z: 'd' });
    put(4, c.day0 + i, { t: 'd', v: sl.date, z: 'aaa' });
  });
  put(3, c.total, s('合計'));
  put(3, c.flag, s(`${nf(cfg.threshold)}歩以上\n（月間連続）`));
  put(3, c.name2, s('名前')); put(3, c.region2, s(regionHdr));
  put(3, c.email, s('メールアドレス'));
  if (legacy) put(3, c.amount, s('支給金額'));

  /* data rows (row 6 onwards) */
  const people = roster.filter((p) => p.active !== false);
  people.forEach((p, i) => {
    const r = 5 + i;
    const xl = r + 1;
    const e = entries[p.id] || { steps: {} };
    put(r, c.no, { t: 'n', v: i + 1, f: 'ROW()-5' });
    put(r, c.id, /^\d+$/.test(String(p.id)) ? n(p.id) : s(p.id));
    put(r, c.name, s(p.name));
    if (legacy) put(r, c.method, s('システム'));
    put(r, c.region, s(p.region || ''));
    put(r, c.gender, s(p.gender || ''));

    let total = 0; let below = 0; let any = false;
    slots.forEach((sl, j) => {
      if (sl.none) return;
      const v = e.steps ? e.steps[sl.iso] : null;
      if (v == null || v === '') return;
      any = true; total += Number(v);
      if (Number(v) < cfg.threshold) below++;
      put(r, c.day0 + j, n(v));
    });
    const dFrom = `${L(c.day0)}${xl}`, dTo = `${L(c.day0 + 30)}${xl}`;
    const totCell = `${L(c.total)}${xl}`;
    const ok = any && below === 0;
    put(r, c.total, { t: 'n', v: total, f: `SUM(${dFrom}:${dTo})` });
    put(r, c.flag, {
      t: 's', v: ok ? '○' : '-',
      f: `IF(${totCell}=0,"-",IF(COUNTIF(${dFrom}:${dTo},"<${cfg.threshold}")=0,"○","-"))`,
    });
    put(r, c.name2, { t: 's', v: p.name, f: `${L(c.name)}${xl}` });
    put(r, c.region2, { t: 's', v: p.region || '', f: `${L(c.region)}${xl}` });
    put(r, c.email, s(p.email || ''));
    if (legacy) {
      put(r, c.amount, {
        t: 'n', v: ok ? cfg.bonus : 0,
        f: `IF(${totCell}=0,0,IF(COUNTIF(${dFrom}:${dTo},"<${cfg.threshold}")=0,${cfg.bonus},0))`,
      });
    }
  });

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 4 + people.length + 1, c: lastCol } });
  const cols = [];
  cols[c.no] = { wch: 6 }; cols[c.id] = { wch: 10 }; cols[c.name] = { wch: 18 };
  if (legacy) cols[c.method] = { wch: 9 };
  cols[c.region] = { wch: 9 }; cols[c.gender] = { wch: 6 };
  for (let i = 0; i < 31; i++) cols[c.day0 + i] = { wch: 6 };
  cols[c.total] = { wch: 10 }; cols[c.flag] = { wch: 12 };
  cols[c.name2] = { wch: 18 }; cols[c.region2] = { wch: 9 }; cols[c.email] = { wch: 28 };
  if (legacy) cols[c.amount] = { wch: 10 };
  ws['!cols'] = Array.from({ length: lastCol + 1 }, (_, i) => cols[i] || { wch: 8 });

  /* --- sheet 2: 完歩賞対象者一覧 --- */
  const ws2 = {};
  const put2 = (r, col, cell) => { ws2[XLSX.utils.encode_cell({ r, c: col })] = cell; };
  put2(0, 0, s('万歩計実績表（開発部用）'));
  put2(1, 1, s('健康対策委員会'));
  put2(2, 0, s('参加人数')); put2(2, 1, s('社員№')); put2(2, 2, s('名前'));
  put2(2, 3, s(`${nf(cfg.threshold)}歩以上\n（月間連続）`));
  people.forEach((p, i) => {
    const r = 4 + i;
    const e = entries[p.id] || { steps: {} };
    const vals = days.map((d) => (e.steps ? e.steps[d.iso] : null)).filter((v) => v != null && v !== '');
    const ok = vals.length > 0 && vals.every((v) => Number(v) >= cfg.threshold);
    put2(r, 0, n(i + 1)); put2(r, 1, s(String(p.id))); put2(r, 2, s(p.name)); put2(r, 3, s(ok ? '○' : '-'));
  });
  ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 4 + people.length, c: 3 } });
  ws2['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, periodKey(y, m));
  XLSX.utils.book_append_sheet(wb, ws2, '完歩賞対象者一覧');
  return wb;
}

/* ============================== UI atoms ================================== */
function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="ovl" onClick={onClose}>
      <div className={'sheet' + (wide ? ' wide' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-h">
          <strong>{title}</strong>
          <button className="x" onClick={onClose} aria-label="close">✕</button>
        </div>
        <div className="sheet-b">{children}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className={'stat' + (tone ? ' ' + tone : '')}>
      <div className="stat-l">{label}</div>
      <div className="stat-v">{value}{sub ? <em>{sub}</em> : null}</div>
    </div>
  );
}

/* ====================== Signature: 完歩リボン ============================== */
/* A label under every bar is unreadable on a phone, so only the ends and
   every fifth day are written out; the rest keep their slot so the labels
   stay under the right bars. */
const ribbonLabel = (d, i, len) => (i === 0 || i === len - 1 || d.dom % 5 === 0 ? `${d.mon}/${d.dom}` : '');

function Ribbon({ days, steps, threshold }) {
  const max = Math.max(threshold * 1.6, ...days.map((d) => Number(steps[d.iso] || 0)));
  return (
    <div className="ribbon">
      <div className="ribbon-line" style={{ bottom: `${(threshold / max) * 100}%` }}>
        <span>{nf(threshold)}</span>
      </div>
      <div className="ribbon-bars">
        {days.map((d) => {
          const v = steps[d.iso];
          const h = v == null || v === '' ? 0 : Math.max(3, (Number(v) / max) * 100);
          const cls = v == null || v === '' ? 'b none' : Number(v) >= threshold ? 'b go' : 'b short';
          return <div key={d.iso} className={cls} style={{ height: `${h}%` }} title={`${d.mon}/${d.dom}: ${nf(v)}`} />;
        })}
      </div>
      <div className="ribbon-dates">
        {days.map((d, i) => <span key={d.iso}>{ribbonLabel(d, i, days.length)}</span>)}
      </div>
    </div>
  );
}

/* =========================== feedback widget ============================== */
/* The EmailJS template is shared with the ごみ管理 system — the free plan
   allows two, and both are spoken for. Nothing about it is waste-specific:
   the recipients arrive as to_email and the heading as subject, so the two
   systems stay apart as long as each sends its own. Send the variable names
   that template expects, not names of our own. */
const EMAILJS = {
  service: import.meta.env.VITE_EMAILJS_SERVICE_ID || '',
  template: import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '',
  key: import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '',
  to: import.meta.env.VITE_EMAILJS_TO || '',
};

function FeedbackButton({ user, toast }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ category: '不具合', message: '' });
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!f.message.trim()) return;
    setBusy(true);
    const payload = {
      name: user?.name || '',
      email: user?.email || '',
      employeeId: user ? String(user.id) : '',
      category: f.category,
      message: f.message.trim(),
    };
    let sent = false;
    if (EMAILJS.service && EMAILJS.template && EMAILJS.key && EMAILJS.to) {
      /* 区分 and 社員番号 have no field of their own in the shared template,
         so they go at the top of the body. */
      const body = [
        `区分　　：${payload.category}`,
        `社員番号：${payload.employeeId || '－'}`,
        '',
        payload.message,
      ].join('\n');
      try {
        await emailjs.send(EMAILJS.service, EMAILJS.template, {
          subject: `【万歩計実績表】ご意見（${payload.category}）`,
          /* The shared template puts this in the From Name, so the system
             comes first — otherwise the mail reads as if another system
             sent it. */
          from_name: `万歩計実績表（${payload.name || '管理者'}）`,
          /* An administrator has no address of their own, so replies go back
             to the committee rather than nowhere. */
          from_email: payload.email || EMAILJS.to.split(',')[0].trim(),
          message: body,
          image_attached: '（画像の添付はありません）',
          to_email: EMAILJS.to,
        }, { publicKey: EMAILJS.key });
        sent = true;
      } catch (e) {
        console.warn('EmailJS send failed', e);
      }
    }
    /* Stored either way, so nothing is lost if mail is not configured yet. */
    await saveFeedback({ ...payload, sent });
    setBusy(false); setOpen(false); setF({ category: '不具合', message: '' });
    toast(t('fbThanks'));
  };

  return (
    <>
      <button className="fab" onClick={() => setOpen(true)}>{t('feedback')}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('feedback')}>
        <label className="fld"><span>{t('fbCategory')}</span>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="不具合">{t('fbBug')}</option>
            <option value="要望・提案">{t('fbRequest')}</option>
            <option value="その他">{t('fbOther')}</option>
          </select>
        </label>
        <label className="fld"><span>{t('fbMessage')}</span>
          <textarea rows={6} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
        </label>
        <button className="btn primary big" disabled={busy || !f.message.trim()} onClick={send}>
          {busy ? '…' : t('fbSend')}
        </button>
      </Modal>
    </>
  );
}

/* ======================== trial self-registration ========================= */
function TrialForm({ cfg, onDone, onCancel, toast }) {
  const t = useT();
  const [f, setF] = useState({ id: '', name: '', region: cfg.regions[0], gender: '男', email: '', dob: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!f.id.trim() || !f.name.trim()) { setErr(t('required')); return; }
    setBusy(true);
    const r = await registerTrial({ ...f, id: f.id.trim(), name: f.name.trim() });
    setBusy(false);
    if (r.error === 'exists') { setErr(t('idExists')); return; }
    if (r.error) { setErr(t('notFound')); return; }
    toast(t('registered'));
    onDone({ id: f.id.trim(), name: f.name.trim(), region: f.region, gender: f.gender, email: f.email, trial: true });
  };

  return (
    <div className="login">
      <div className="login-inner">
        <div className="login-top">
          <img className="logo" src={`${import.meta.env.BASE_URL}morabu-logo.png`} alt="" />
          <button className="lang" onClick={onCancel}>✕</button>
        </div>
        <div className="login-title">
          <span className="eyebrow">{t('eyebrow')}</span>
          <h1>{t('trialTitle')}</h1>
        </div>
        <p className="muted sm" style={{ marginBottom: '18px' }}>{t('trialNote')}</p>

        <label className="fld"><span>{t('employeeId')}</span>
          <input value={f.id} inputMode="numeric" onChange={(e) => { setF({ ...f, id: e.target.value }); setErr(''); }} />
        </label>
        <label className="fld"><span>{t('name')}</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="fld"><span>{t('region')}</span>
          <select value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
            {cfg.regions.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="fld"><span>{t('gender')}</span>
          <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
            <option value="男">{t('male')}</option><option value="女">{t('female')}</option>
          </select>
        </label>
        <label className="fld"><span>{t('email')}</span>
          <input value={f.email} type="email" onChange={(e) => setF({ ...f, email: e.target.value })} />
        </label>
        <label className="fld"><span>{t('dob')}</span>
          <input value={f.dob} type="date" onChange={(e) => setF({ ...f, dob: e.target.value })} />
          <em className="fld-note">{t('dobNote')}</em>
        </label>

        {err && <div className="err">{err}</div>}
        <button className="btn primary big" disabled={busy} onClick={go}>{busy ? '…' : t('register')}</button>
        <button className="linkbtn" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  );
}

/* ============================ Login screen ================================ */
function Login({ onLogin, onTrial, lang, setLang }) {
  const t = useT();
  const [id, setId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);

  const go = async () => {
    const v = id.trim();
    if (!v || busy) return;
    setBusy(true);
    const r = await onLogin(v, consent);
    setBusy(false);
    if (r?.error) setErr(t(r.error === 'too_many' ? 'tooMany' : 'notFound'));
  };

  return (
    <div className="login">
      <div className="login-inner">
        <div className="login-top">
          <img className="logo" src={`${import.meta.env.BASE_URL}morabu-logo.png`} alt={t('company')} />
          <button className="lang" onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>
            {lang === 'ja' ? 'EN' : '日本語'}
          </button>
        </div>

        <div className="login-hello">
          <MoraBot pose="hello" title={t('botAlt')} />
          <p className="bubble">{t('botHello')}</p>
        </div>

        <div className="login-title">
          <span className="eyebrow">{t('eyebrow')}</span>
          <h1>{t('mainTitle')}</h1>
        </div>

        <label className="fld">
          <span>{t('employeeId')}</span>
          <input
            /* An example, not a colleague. This used to be a real employee
               number, displayed to everyone who opened the sign-in page. */
            value={id} inputMode="numeric" autoComplete="off" placeholder="1234567"
            onChange={(e) => { setId(e.target.value); setErr(''); }}
            onKeyDown={(e) => e.key === 'Enter' && go()}
          />
        </label>
        {err && <div className="err">{err}</div>}

        {/* Shown to everyone now: whether this person has already answered is
            on their roster row, which the sign-in screen can no longer read.
            The server records it only the first time. */}
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            {t('consentLabel')}
            <em>{t('consentOptional')}</em>
          </span>
        </label>

        <button className="btn primary big" disabled={busy} onClick={go}>{t('login')}</button>
        <button className="btn trial-cta" onClick={onTrial}>{t('trialSignup')}</button>

        <div className="login-foot">
          <span>{t('company')}</span>
          <span>{t('moduleSub')}</span>
        </div>
      </div>
    </div>
  );
}

/* =========================== Employee: entry ============================== */
function StepsTab({ user, cfg, holidays, y, m, setPeriod, toast }) {
  const t = useT(); const lang = useLang();
  const pk = periodKey(y, m);
  const [entry, setEntry] = useState(null);
  const [view, setView] = useState('cal');
  const [editIso, setEditIso] = useState(null);
  const [draft, setDraft] = useState('');
  const [askSubmit, setAskSubmit] = useState(false);
  const [hit, setHit] = useState(false);
  /* Null until the saved record has loaded, so a month that was already
     complete when the screen opened does not congratulate you again. */
  const wasQualified = React.useRef(null);

  const days = useMemo(() => periodDays(y, m), [y, m]);
  const slots = useMemo(() => formSlots(y, m), [y, m]);

  useEffect(() => {
    let live = true;
    setEntry(null);
    wasQualified.current = null;
    S.get(entryKey(pk, user.id)).then((e) => { if (live) setEntry(e || { steps: {}, submitted: false }); });
    return () => { live = false; };
  }, [pk, user.id]);

  const steps = entry?.steps || {};
  const locked = !!entry?.submitted;
  const filled = days.filter((d) => steps[d.iso] != null && steps[d.iso] !== '');
  const total = filled.reduce((a, d) => a + Number(steps[d.iso]), 0);
  const allIn = filled.length === days.length;
  const qualified = allIn && filled.every((d) => Number(steps[d.iso]) >= cfg.threshold);
  const windowOpen = !cfg.enforceWindow || inSubmissionWindow(y, m);

  const timer = React.useRef(null);
  const latest = React.useRef(null);
  const listRef = React.useRef(null);
  /* When the oldest unwritten change was made. Typing restarts the debounce,
     so without a ceiling on it a person filling the form without pausing
     never triggers a write at all — which is how a whole month's entry could
     be lost to a reload while logging out saved it. */
  const oldest = React.useRef(0);
  const [saveState, setSaveState] = useState('');

  /* On a PC the list is filled top to bottom, so Enter should behave like
     Tab and land on the next day rather than doing nothing. */
  const focusNext = (el) => {
    const boxes = [...(listRef.current?.querySelectorAll('input:not([disabled])') || [])];
    const nx = boxes[boxes.indexOf(el) + 1];
    if (nx) { nx.focus(); nx.select(); } else el.blur();
  };

  const MAX_WAIT = 1500;

  const write = async () => {
    timer.current = null; oldest.current = 0;
    setSaveState('saving');
    const ok = await S.set(entryKey(pk, user.id), { ...latest.current, updatedAt: Date.now() });
    setSaveState(ok ? 'saved' : 'error');
    return ok;
  };

  const persist = (next, immediate) => {
    setEntry(next); latest.current = next;
    if (!oldest.current) oldest.current = Date.now();
    if (timer.current) clearTimeout(timer.current);
    if (immediate || Date.now() - oldest.current >= MAX_WAIT) return write();
    timer.current = setTimeout(write, 500);
    setSaveState('saving');
    return Promise.resolve();
  };

  /* Closing or reloading the tab cancels an ordinary fetch, so the last
     changes went with it. keepalive lets the browser finish the write. */
  useEffect(() => {
    const flush = () => {
      if (!timer.current || !latest.current) return;
      clearTimeout(timer.current); timer.current = null; oldest.current = 0;
      setLeaving(entryKey(pk, user.id), { ...latest.current, updatedAt: Date.now() });
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [pk, user.id]);

  /* A day above the ceiling is refused outright rather than silently
     clamped — a mistyped 100,000 should be visible, not absorbed. */
  const maxSteps = Number(cfg.maxSteps) > 0 ? Number(cfg.maxSteps) : 100000;
  const overMax = (val) => val !== '' && val != null && Number(val) >= maxSteps;
  const warnMax = () => toast(t('overMax').replace('{n}', nf(maxSteps)));

  const saveDay = async (iso, val, immediate) => {
    if (overMax(val)) { warnMax(); return false; }
    const base = latest.current || entry;
    const next = { ...base, steps: { ...(base.steps || {}) } };
    if (val === '' || val == null) delete next.steps[iso];
    else next.steps[iso] = Math.max(0, Number(val));
    await persist(next, immediate);
    return true;
  };

  const openDay = (iso) => { if (locked) return; setEditIso(iso); setDraft(steps[iso] != null ? String(steps[iso]) : ''); };
  /* 保存 means saved. Nothing about this one is worth batching. */
  const commit = async () => {
    if (!await saveDay(editIso, draft === '' ? '' : Number(draft), true)) return;
    setEditIso(null);
  };
  const step = async (dir) => {
    if (!await saveDay(editIso, draft === '' ? '' : Number(draft), true)) return;
    const i = days.findIndex((d) => d.iso === editIso) + dir;
    if (i < 0 || i >= days.length) { setEditIso(null); return; }
    const nx = days[i].iso;
    setEditIso(nx); setDraft(steps[nx] != null ? String(steps[nx]) : '');
  };

  const doSubmit = async () => {
    const base = latest.current || entry;
    await persist({ ...base, submitted: true, submittedAt: Date.now() }, true);
    setAskSubmit(false); toast(t('submitted'));
  };

  /* Today's line on the track. He only ever walks forward: the tumble is
     saved for a period that has closed short, so nobody is met by a fallen
     mascot at nine in the morning for not having walked yet. */
  const todayIso = isoOf(new Date());
  const companion = useMemo(() => {
    const d = days.find((x) => x.iso === todayIso);
    if (!d) return null;
    const raw = steps[d.iso];
    const has = raw != null && raw !== '';
    const val = has ? Number(raw) : null;
    const goal = Number(cfg.threshold) || 5000;
    const done = has && val >= goal;
    return {
      mon: d.mon, dom: d.dom, steps: val, done,
      pose: done ? 'cheer' : has && val > 0 ? 'walk' : 'idle',
      pct: Math.min(100, Math.round(((val || 0) / goal) * 100)),
      note: done ? t('goalHit')
        : has && val > 0 ? t('toGoal').replace('{n}', nf(goal - val))
        : t('notWalkedYet'),
    };
  }, [days, steps, cfg.threshold, todayIso, lang]);

  /* Once the period is over, how it went. */
  const result = useMemo(() => {
    const over = new Date() > periodEnd(y, m);
    if (!over || !filled.length) return null;
    const goal = Number(cfg.threshold) || 5000;
    return qualified
      ? { kind: 'bonus', title: t('bonusWon'), note: t('bonusWonNote').replace('{n}', nf(goal)) }
      : { kind: 'short', title: t('periodShort'), note: t('periodShortNote') };
  }, [y, m, qualified, filled.length, cfg.threshold, lang]);

  /* People often fill the whole month in one sitting, so congratulating a
     single day meant a popup to dismiss after every number. It waits for
     the month to be complete instead — which is the 完歩賞 itself. */
  useEffect(() => {
    if (!entry) return;
    if (wasQualified.current === null) { wasQualified.current = qualified; return; }
    if (qualified && !wasQualified.current) setHit(true);
    wasQualified.current = qualified;
  }, [qualified, entry]);

  const dayClass = (d) => {
    const hol = holidays[d.iso];
    if (d.dow === 0 || hol) return 'sun';
    if (d.dow === 6) return 'sat';
    return '';
  };

  const shift = (delta) => {
    let ny = y, nm = m + delta;
    if (nm > 12) { nm = 1; ny++; } if (nm < 1) { nm = 12; ny--; }
    setPeriod({ y: ny, m: nm });
  };

  if (!entry) return <div className="pad muted">{t('loading')}</div>;

  const grid = [];
  const lead = days[0].dow;
  for (let i = 0; i < lead; i++) grid.push(null);
  days.forEach((d) => grid.push(d));

  return (
    <div className="tabbody">
      <div className="periodbar">
        <button onClick={() => shift(-1)} aria-label="prev">‹</button>
        <div>
          <strong>{y}年 {m}月度</strong>
          <em>{fmtRange(y, m, lang)}</em>
        </div>
        <button onClick={() => shift(1)} aria-label="next">›</button>
      </div>

      <div className={'banner ' + (locked ? 'ok' : 'warn')}>
        <span className="dot" />
        {locked ? t('submitted') : t('notSubmitted')}
        {locked && <em>{t('lockedNote')}</em>}
      </div>

      {companion && (
        <div className="card companion">
          <div className="crow">
            <span className="clabel">{t('today')} {companion.mon}/{companion.dom}</span>
            <span className="cgoal">{t('goalSteps').replace('{n}', nf(cfg.threshold))}</span>
          </div>
          <div className="track">
            <div className="walker" style={{ '--p': companion.pct / 100 }}>
              <MoraBot pose={companion.pose} />
            </div>
            <div className="goalpost" />
            <div className="rail" />
            <div className="railfill" style={{ width: `${companion.pct}%` }} />
          </div>
          <div className="crow foot">
            <strong className="csteps">{companion.steps == null ? '–' : nf(companion.steps)}</strong>
            <span className="cunit">{companion.steps == null ? '' : (lang === 'ja' ? '歩' : 'steps')}</span>
            <span className={'cnote' + (companion.done ? ' ok' : '')}>{companion.note}</span>
          </div>
        </div>
      )}

      {result && (
        <div className={'card result ' + result.kind}>
          <div className="rbot"><MoraBot pose={result.kind === 'bonus' ? 'flag' : 'tumble'} /></div>
          <div>
            <strong>{result.title}</strong>
            <p>{result.note}</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row2">
          <Stat label={t('total')} value={nf(total)} sub={lang === 'ja' ? '歩' : 'steps'} />
          <Stat label={t('entered')} value={`${filled.length}/${days.length}`} sub={t('days')} />
        </div>
        <Ribbon days={days} steps={steps} threshold={cfg.threshold} />
        <div className="legend">
          <i className="lg sat" />{t('sat')}
          <i className="lg sun" />{t('sunHol')}
          <i className="lg go" />{nf(cfg.threshold)}+
          <i className="lg short" />&lt;{nf(cfg.threshold)}
        </div>
      </div>

      <div className="sechead">
        <span>{t('entryHead')}</span>
        {!locked && saveState && (
          <span className={'savestate ' + saveState}>
            {saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('savedOk') : t('saveFail')}
          </span>
        )}
        <div className="seg">
          <button className={view === 'cal' ? 'on' : ''} onClick={() => setView('cal')}>{t('calendar')}</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>{t('list')}</button>
        </div>
      </div>

      {view === 'cal' ? (
        <div className="cal">
          {(lang === 'ja' ? DOW_JA : DOW_EN).map((w, i) => (
            <div key={w} className={'cal-h' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</div>
          ))}
          {grid.map((d, i) => {
            if (!d) return <div key={'e' + i} className="cell empty" />;
            const v = steps[d.iso];
            const has = v != null && v !== '';
            return (
              <button
                key={d.iso}
                className={`cell ${dayClass(d)} ${has ? (Number(v) >= cfg.threshold ? 'go' : 'short') : 'blank'} ${locked ? 'lock' : ''}`}
                onClick={() => openDay(d.iso)}
              >
                <span className="dnum">{d.dom}</span>
                <span className="dval">{has ? nf(v) : '–'}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="listv" ref={listRef}>
          {slots.filter((sl) => !sl.none).map((sl) => {
            const v = steps[sl.iso];
            const hol = holidays[sl.iso];
            return (
              <div key={sl.iso} className={'lrow ' + dayClass(sl)}>
                <span className="ld">{sl.mon}/{sl.dom}<em>{(lang === 'ja' ? DOW_JA : DOW_EN)[sl.dow]}</em></span>
                {hol && <span className="hol">{hol}</span>}
                <input
                  inputMode="numeric" disabled={locked} value={v == null ? '' : v}
                  placeholder="0"
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, '');
                    saveDay(sl.iso, raw === '' ? '' : Number(raw));
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext(e.target); } }}
                  className={v != null && v !== '' ? (Number(v) >= cfg.threshold ? 'go' : 'short') : ''}
                />
              </div>
            );
          })}
        </div>
      )}

      {!locked && (
        <div className="submitbar">
          {!windowOpen && <div className="note">{t('windowClosed')} — {t('windowNote')}</div>}
          <button className="btn primary big" disabled={!allIn || !windowOpen} onClick={() => setAskSubmit(true)}>
            {allIn
              ? t('submit')
              : lang === 'ja'
                ? `${t('submit')}（未入力 ${days.length - filled.length}日）`
                : `${t('submit')} (${days.length - filled.length} blank)`}
          </button>
        </div>
      )}

      <Modal open={!!editIso} onClose={() => setEditIso(null)} title={editIso ? editIso.replace(/^\d+-/, '').replace('-', '/') : ''}>
        <div className="numpad">
          <input
            autoFocus inputMode="numeric" className="bignum" value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
          <div className="navrow">
            <button className="btn" onClick={() => step(-1)}>‹ {t('prevDay')}</button>
            <button className="btn ghost" onClick={() => { setDraft(''); }}>{t('clear')}</button>
            <button className="btn" onClick={() => step(1)}>{t('nextDay')} ›</button>
          </div>
          <button className="btn primary big" onClick={commit}>{t('save')}</button>
        </div>
      </Modal>

      <Modal open={hit} onClose={() => setHit(false)} title={t('bonusWon')}>
        {hit && (
          <div className="hit">
            <div className="confetti" aria-hidden="true">
              <i style={{ left: '8%',  background: '#FF9934', animationDelay: '0s' }} />
              <i style={{ left: '22%', background: '#1F50B9', animationDelay: '.35s' }} />
              <i style={{ left: '37%', background: '#138708', animationDelay: '.9s' }} />
              <i style={{ left: '52%', background: '#FF9934', animationDelay: '.15s' }} />
              <i style={{ left: '67%', background: '#4A78D6', animationDelay: '.7s' }} />
              <i style={{ left: '81%', background: '#138708', animationDelay: '1.2s' }} />
              <i style={{ left: '93%', background: '#1F50B9', animationDelay: '.5s' }} />
            </div>
            <div className="hitbot"><MoraBot pose="flag" /></div>
            <h2>{t('hitTitle')}</h2>
            <p>{t('hitBody').replace('{d}', `${y}年 ${m}月度`).replace('{n}', nf(total))}</p>
            <p className="muted sm">{t('hitCount').replace('{n}', days.length).replace('{g}', nf(cfg.threshold))}</p>
            <button className="btn primary big" onClick={() => setHit(false)}>{t('hitClose')}</button>
          </div>
        )}
      </Modal>

      <Modal open={askSubmit} onClose={() => setAskSubmit(false)} title={t('submitConfirmTitle')}>
        <p className="muted">{t('submitConfirmBody')}</p>
        <div className="kv"><span>{t('total')}</span><strong>{nf(total)}</strong></div>
        <div className="kv"><span>{t('bonusStatus')}</span><strong>{qualified ? '○' : '—'}</strong></div>
        <div className="navrow">
          <button className="btn ghost" onClick={() => setAskSubmit(false)}>{t('cancel')}</button>
          <button className="btn primary" onClick={doSubmit}>{t('confirm')}</button>
        </div>
      </Modal>
    </div>
  );
}

/* ========================== Employee: my page ============================= */
function ProfileTab({ user, cfg, roster, setRoster, toast, y, m, onUpdated }) {
  const t = useT(); const lang = useLang();
  const pk = periodKey(y, m);
  const [entry, setEntry] = useState(null);
  const [f, setF] = useState({ region: user.region || '', gender: user.gender || '男', pedometer: user.pedometer || '', email: user.email || '' });

  useEffect(() => {
    let live = true;
    S.get(entryKey(pk, user.id)).then((e) => { if (live) setEntry(e || { steps: {} }); });
    return () => { live = false; };
  }, [pk, user.id]);

  const days = useMemo(() => periodDays(y, m), [y, m]);
  const steps = entry?.steps || {};
  const done = days.filter((d) => steps[d.iso] != null && steps[d.iso] !== '');
  const below = done.filter((d) => Number(steps[d.iso]) < cfg.threshold).length;
  const blank = days.length - done.length;
  const met = done.length > 0 && blank === 0 && below === 0;
  const state = blank === days.length ? '—' : blank > 0 ? t('inProgress') : met ? t('hit') : t('notHit');

  /* Writing the whole roster back to save one person's own details meant any
     participant could rewrite everybody. This sends only their own fields, and
     the server ignores whose they claim to be. */
  const save = async () => {
    if (IS_LOCAL) {
      const next = roster.map((p) => (String(p.id) === String(user.id) ? { ...p, ...f } : p));
      setRoster(next); await S.set('roster', next); toast(t('saved'));
      return;
    }
    const updated = await apiSaveMe(f);
    if (!updated) { toast(t('saveFailed')); return; }
    onUpdated(updated); toast(t('saved'));
  };
  return (
    <div className="tabbody">
      <div className="sechead"><span>{t('targetStatus')}</span></div>
      <div className="card">
        <div className="row3">
          <Stat label={`${y}年${m}月度`} value={state} tone={met ? 'mark' : ''} />
          <Stat label={t('daysBelow')} value={below} sub={t('days')} />
          <Stat label={t('daysBlank')} value={blank} sub={t('days')} />
        </div>
      </div>

      <div className="sechead"><span>{t('profileHead')}</span></div>
      <div className="card">
        <div className="kv"><span>{t('employeeId')}</span><strong>{user.id}</strong></div>
        <div className="kv"><span>{t('name')}</span><strong>{user.name}</strong></div>
        <label className="fld"><span>{t('region')}</span>
          <select value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
            {cfg.regions.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="fld"><span>{t('gender')}</span>
          <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
            <option value="男">{t('male')}</option><option value="女">{t('female')}</option>
          </select>
        </label>
        <label className="fld"><span>{t('pedometerNo')}</span>
          <input value={f.pedometer} onChange={(e) => setF({ ...f, pedometer: e.target.value })} />
        </label>
        <label className="fld"><span>{t('email')}</span>
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </label>
        <button className="btn primary big" onClick={save}>{t('saveProfile')}</button>
      </div>
    </div>
  );
}

/* ============================ Admin: summary ============================== */
function AdminTab({ cfg, setCfg, roster, setRoster, y, m, setPeriod, toast, holidays }) {
  const t = useT(); const lang = useLang();
  const pk = periodKey(y, m);
  const [sub, setSub] = useState('dash');
  const [entries, setEntries] = useState(null);
  const [q, setQ] = useState('');
  const [regionF, setRegionF] = useState('');
  const [sortK, setSortK] = useState('id');
  const [sortD, setSortD] = useState(1);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState('');

  const days = useMemo(() => periodDays(y, m), [y, m]);

  const load = useCallback(async () => {
    setEntries(null);
    const keys = await S.list(`st:${pk}:`);
    const rows = await chunked(keys, 8, async (k) => [k.split(':').pop(), await S.get(k)]);
    const map = {};
    rows.forEach(([id, v]) => { if (v) map[id] = v; });
    setEntries(map);
  }, [pk]);

  useEffect(() => { load(); }, [load]);

  /* Trial sign-ups are excluded from every real figure: the counts, the bonus
     list, the Excel export and the reminder list. They are managed on the
     対象者 tab, where they can be shown with a filter. */
  const people = roster.filter((p) => p.active !== false && !p.trial);
  const trialCount = roster.filter((p) => p.trial).length;
  const calc = (p) => {
    const e = (entries || {})[p.id];
    const steps = e?.steps || {};
    const vals = days.map((d) => steps[d.iso]).filter((v) => v != null && v !== '');
    const total = vals.reduce((a, v) => a + Number(v), 0);
    const ok = vals.length === days.length && vals.every((v) => Number(v) >= cfg.threshold);
    return { total, ok, submitted: !!e?.submitted, filled: vals.length, steps };
  };

  const rows = useMemo(() => {
    if (!entries) return [];
    let r = people.map((p, i) => ({ p, i, ...calc(p) }));
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((x) => x.p.name.toLowerCase().includes(s) || String(x.p.id).includes(s));
    }
    if (regionF) r = r.filter((x) => x.p.region === regionF);
    r.sort((a, b) => {
      const av = sortK === 'id' ? String(a.p.id).padStart(12, '0') : a.p.name;
      const bv = sortK === 'id' ? String(b.p.id).padStart(12, '0') : b.p.name;
      return av < bv ? -sortD : av > bv ? sortD : 0;
    });
    return r;
  }, [entries, people, q, regionF, sortK, sortD, cfg.threshold, days]);

  const all = entries ? people.map((p) => calc(p)) : [];
  const nSub = all.filter((x) => x.submitted).length;
  const nOk = all.filter((x) => x.ok).length;

  const download = () => {
    const wb = buildWorkbook({ y, m, roster: people, entries: entries || {}, cfg, layout: cfg.exportLayout, lang });
    XLSX.writeFile(wb, `健康運動実績表_${pk}.xlsx`, { cellDates: true, bookType: 'xlsx' });
  };

  const copyMails = async () => {
    const list = people.filter((p) => !((entries || {})[p.id]?.submitted)).map((p) => p.email).filter(Boolean).join('; ');
    try { await navigator.clipboard.writeText(list); toast(t('copied')); } catch { toast(list.slice(0, 60) + '…'); }
  };

  const unlock = async (id) => {
    const e = (entries || {})[id]; if (!e) return;
    if (e.auto) { toast(t('cannotUnlockAuto')); return; }
    const next = { ...e, submitted: false };
    await S.set(entryKey(pk, id), next);
    setEntries({ ...entries, [id]: next }); toast(t('unlockDone')); setDetail(null);
  };

  const genDemo = async () => {
    setBusy(t('loading'));
    const pick = people.slice(0, 40);
    await chunked(pick, 6, async (p) => {
      const good = Math.random() < 0.55;
      const steps = {};
      days.forEach((d) => {
        const base = good ? 5200 + Math.random() * 3500 : 3800 + Math.random() * 4200;
        steps[d.iso] = Math.round(base / 10) * 10;
      });
      if (!good && Math.random() < 0.8) steps[days[Math.floor(Math.random() * days.length)].iso] = 3200;
      return S.set(entryKey(pk, p.id), { steps, submitted: true, submittedAt: Date.now() });
    });
    setBusy(''); await load(); toast(t('saved'));
  };

  const wipe = async () => {
    if (!window.confirm(t('resetConfirm'))) return;
    setBusy(t('loading'));
    const keys = await S.list(`st:${pk}:`);
    await chunked(keys, 8, (k) => S.del(k));
    setBusy(''); await load();
  };

  const shift = (delta) => {
    let ny = y, nm = m + delta;
    if (nm > 12) { nm = 1; ny++; } if (nm < 1) { nm = 12; ny--; }
    setPeriod({ y: ny, m: nm });
  };

  return (
    <div className="tabbody">
      <div className="periodbar">
        <button onClick={() => shift(-1)}>‹</button>
        <div><strong>{y}年 {m}月度</strong><em>{fmtRange(y, m, lang)} · {pk}</em></div>
        <button onClick={() => shift(1)}>›</button>
      </div>

      <div className="seg tabs">
        <button className={sub === 'dash' ? 'on' : ''} onClick={() => setSub('dash')}>{t('dashboard')}</button>
        <button className={sub === 'bonus' ? 'on' : ''} onClick={() => setSub('bonus')}>{t('bonusTab')}</button>
        <button className={sub === 'rem' ? 'on' : ''} onClick={() => setSub('rem')}>{t('unsubmitted')}</button>
        <button className={sub === 'people' ? 'on' : ''} onClick={() => setSub('people')}>{t('people')}</button>
        <button className={sub === 'fb' ? 'on' : ''} onClick={() => setSub('fb')}>{t('fbTab')}</button>
        <button className={sub === 'set' ? 'on' : ''} onClick={() => setSub('set')}>{t('settings')}</button>
      </div>

      {busy && <div className="pad muted">{busy}</div>}

      {sub === 'dash' && (
        <>
          <div className="card">
            <div className={trialCount > 0 ? 'row4' : 'row3'}>
              <Stat label={t('participants')} value={people.length} />
              <Stat label={t('submittedCount')} value={`${nSub}`} sub={`/ ${people.length}`} />
              <Stat label={t('bonusCount')} value={nOk} tone="mark" />
              {trialCount > 0 && <Stat label={t('trialCount')} value={trialCount} />}
            </div>
            <div className="navrow wrap">
              <button className="btn primary" onClick={download}>{t('download')}</button>
              <button className="btn ghost" onClick={copyMails}>{t('copyEmails')}</button>
              <button className="btn ghost" onClick={load}>{t('refresh')}</button>
            </div>
          </div>

          <div className="filters">
            <input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={regionF} onChange={(e) => setRegionF(e.target.value)}>
              <option value="">{t('allRegions')}</option>
              {cfg.regions.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>

          {entries == null ? <div className="pad muted">{t('loading')}</div> : (
            <div className="tablewrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="sortable" onClick={() => { setSortK('id'); setSortD(sortK === 'id' ? -sortD : 1); }}>
                      {t('employeeId')}{sortK === 'id' ? (sortD > 0 ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th className="sortable" onClick={() => { setSortK('name'); setSortD(sortK === 'name' ? -sortD : 1); }}>
                      {t('name')}{sortK === 'name' ? (sortD > 0 ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th>{t('region')}</th>
                    <th className="num">{t('total')}</th>
                    <th>○</th>
                    <th>{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.p.id} onClick={() => setDetail(r)}>
                      <td className="muted">{i + 1}</td>
                      <td className="mono">{r.p.id}</td>
                      <td>{r.p.name}</td>
                      <td className="muted">{r.p.region}</td>
                      <td className="num mono">{r.total ? nf(r.total) : '–'}</td>
                      <td className={r.ok ? 'mark b' : 'muted'}>{r.ok ? '○' : '－'}</td>
                      <td>
                        {r.submitted
                          ? <span className="pill ok">{(entries || {})[r.p.id]?.auto ? t('autoTag') : t('submitted')}</span>
                          : <span className="pill">{t('notSubmitted')}</span>}
                      </td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={7} className="pad muted">{t('noData')}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {sub === 'bonus' && (
        <div className="card">
          <div className="row2">
            <Stat label={t('bonusCount')} value={nOk} tone="mark" />
            <Stat label={t('payout')} value={`¥${nf(nOk * cfg.bonus)}`} tone="mark" />
          </div>
          <table className="tbl">
            <thead><tr><th>#</th><th>{t('name')}</th><th>{nf(cfg.threshold)}歩以上</th></tr></thead>
            <tbody>
              {people.map((p, i) => {
                const c = calc(p);
                return (
                  <tr key={p.id}>
                    <td className="muted">{i + 1}</td><td>{p.name}</td>
                    <td className={c.ok ? 'mark b' : 'muted'}>{c.ok ? '○' : '－'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sub === 'rem' && (
        <RemindersAdmin
          cfg={cfg} roster={people} entries={entries} y={y} m={m}
          onReload={load} toast={toast} setBusy={setBusy}
        />
      )}

      {sub === 'people' && <PeopleAdmin cfg={cfg} setCfg={setCfg} roster={roster} setRoster={setRoster} toast={toast} />}

      {sub === 'fb' && <FeedbackAdmin />}

      {sub === 'set' && (
        <SettingsAdmin cfg={cfg} setCfg={setCfg} toast={toast} onDemo={genDemo} onWipe={wipe} />
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.p.name} · ${detail.p.id}` : ''} wide>
        {detail && (
          <>
            <div className="row3">
              <Stat label={t('total')} value={nf(detail.total)} />
              <Stat label={t('entered')} value={`${detail.filled}/${days.length}`} />
              <Stat label={t('bonusStatus')} value={detail.ok ? '○' : '－'} tone={detail.ok ? 'mark' : ''} />
            </div>
            <div className="daygrid">
              {days.map((d) => {
                const v = detail.steps[d.iso];
                const has = v != null && v !== '';
                return (
                  <div key={d.iso} className={'dg ' + (has ? (Number(v) >= cfg.threshold ? 'go' : 'short') : 'blank')}>
                    <span>{d.mon}/{d.dom}</span><b>{has ? nf(v) : '–'}</b>
                  </div>
                );
              })}
            </div>
            {detail.submitted && !((entries || {})[detail.p.id]?.auto) && (
              <button className="btn ghost" onClick={() => unlock(detail.p.id)}>{t('unlock')}</button>
            )}
            {(entries || {})[detail.p.id]?.auto && <p className="muted sm">{t('cannotUnlockAuto')}</p>}
          </>
        )}
      </Modal>
    </div>
  );
}

/* ===================== Admin: outstanding & reminders ====================== */
function RemindersAdmin({ cfg, roster, entries, y, m, onReload, toast, setBusy }) {
  const t = useT(); const lang = useLang();
  const [preview, setPreview] = useState(null);

  const out = (entries == null) ? [] : roster.filter((p) => !entries[p.id]?.submitted);
  const auto = (entries == null) ? [] : roster.filter((p) => entries[p.id]?.auto);
  const url = typeof window !== 'undefined'
    ? window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '')
    : '';

  const mailFor = (p) => reminderMail({ name: p.name, y, m, consent: !!p.consent, url });

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast(t('copied')); }
    catch { toast(text.slice(0, 40) + '…'); }
  };

  const runAuto = async () => {
    if (!autoSubmitDue(y, m) && !window.confirm(t('notDueYet'))) return;
    setBusy(t('loading'));
    const done = await runAutoSubmit({ y, m, roster, cfg });
    setBusy(''); await onReload();
    toast(t('autoDone').replace('{n}', String(done.length)));
  };

  return (
    <>
      <div className="card">
        <div className="row3">
          <Stat label={t('unsubmitted')} value={out.length} sub={lang === 'ja' ? '名' : ''} />
          <Stat label={t('autoTag')} value={auto.length} sub={lang === 'ja' ? '名' : ''} />
          <Stat label={t('finalDeadline')} value={lang === 'ja' ? deadlineTextJa(y, m) : deadlineTextEn(y, m)} />
        </div>
        <div className="navrow wrap">
          <button className="btn" onClick={() => copy(out.map((p) => companyEmail(p.email)).filter(Boolean).join('; '))}>
            {t('copyEmails')}
          </button>
          <button className="btn" onClick={runAuto}>{t('runAuto')}</button>
        </div>
        <p className="muted sm mt">{t('runAutoNote')}</p>
      </div>

      <div className="tablewrap">
        <table className="tbl">
          <thead>
            <tr><th>#</th><th>{t('name')}</th><th>{t('consent')}</th><th>{t('email')}</th><th /></tr>
          </thead>
          <tbody>
            {out.map((p, i) => (
              <tr key={p.id}>
                <td className="muted">{i + 1}</td>
                <td>{p.name}</td>
                <td className={p.consent ? 'mark' : 'muted'}>{p.consent ? '○' : '－'}</td>
                <td className="muted">{companyEmail(p.email) || '—'}</td>
                <td className="right">
                  <button className="mini" onClick={() => setPreview(p)}>{t('showMail')}</button>
                </td>
              </tr>
            ))}
            {entries != null && !out.length && (
              <tr><td colSpan={5} className="pad muted">{t('noneOutstanding')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? preview.name : ''} wide>
        {preview && (() => {
          const mail = mailFor(preview);
          const to = companyEmail(preview.email);
          return (
            <>
              <div className="kv"><span>To</span><strong>{to || '—'}</strong></div>
              <div className="kv"><span>Subject</span><strong className="wrapv">{mail.subject}</strong></div>
              <pre className="mailbody">{mail.body}</pre>
              <div className="navrow">
                <button className="btn ghost" onClick={() => copy(mail.body)}>{t('copyBody')}</button>
                <a
                  className="btn primary"
                  href={`mailto:${to}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`}
                >{t('openMail')}</a>
              </div>
            </>
          );
        })()}
      </Modal>
    </>
  );
}

/* ======================= Admin: participants & regions ==================== */
function PeopleAdmin({ cfg, setCfg, roster, setRoster, toast }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [withTrial, setWithTrial] = useState(true);
  const [withDeleted, setWithDeleted] = useState(false);
  const [edit, setEdit] = useState(null);
  const [newRegion, setNewRegion] = useState('');

  const save = async (next, quiet) => {
    setRoster(next); await S.set('roster', next);
    if (!quiet) toast(t('saved'));
  };

  const commit = async () => {
    const f = edit;
    if (!f.id || !f.name) return;
    const dup = roster.some((p) => String(p.id) === String(f.id) && String(p.id) !== String(f._orig));
    if (dup) { toast(t('duplicateId')); return; }
    const next = f.isNew
      ? [...roster, { id: String(f.id), name: f.name, region: f.region, gender: f.gender, email: f.email || '', pedometer: f.pedometer || '', active: true }]
      : roster.map((p) => {
        if (String(p.id) !== String(f._orig)) return p;
        const { isNew, _orig, ...rest } = f;
        return { ...p, ...rest, id: String(f.id) };
      });
    await save(next); setEdit(null);
  };

  /* 削除 marks the row inactive instead of deleting it. 健康対策委員会 asked
     for a removed participant's figures to stay readable, and the aggregation
     already skips anyone who is not active — so does sign-in. */
  const del = async (id) => {
    if (!window.confirm(t('removeConfirm'))) return;
    await save(roster.map((p) => (String(p.id) === String(id) ? { ...p, active: false } : p)), true);
    toast(t('removed'));
  };

  const restore = async (id) => {
    await save(roster.map((p) => (String(p.id) === String(id) ? { ...p, active: true } : p)), true);
    toast(t('restored'));
  };

  const deletedCount = roster.filter((p) => p.active === false).length;
  const shown = roster
    .filter((p) => (withDeleted ? true : p.active !== false))
    .filter((p) => withTrial || !p.trial)
    .filter((p) => !q.trim() || p.name.includes(q) || String(p.id).includes(q));

  return (
    <>
      <div className="card">
        <div className="navrow wrap">
          <input className="grow" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary" onClick={() => setEdit({ isNew: true, id: '', name: '', region: cfg.regions[0], gender: '男', email: '', pedometer: '' })}>
            + {t('addPerson')}
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={withTrial} onChange={(e) => setWithTrial(e.target.checked)} />
          <span>{t('showTrial')}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={withDeleted} onChange={(e) => setWithDeleted(e.target.checked)} />
          <span>{t('showDeleted')}{deletedCount ? `（${deletedCount}）` : ''}</span>
        </label>
        <p className="muted sm">{t('deletedNote')}</p>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>{t('employeeId')}</th><th>{t('name')}</th><th>{t('region')}</th><th>{t('gender')}</th><th /></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className={p.active === false ? 'gone' : ''}>
                  <td className="mono">{p.id}</td>
                  <td>
                    {p.name}
                    {p.trial && <span className="pill trial">{t('trialTag')}</span>}
                    {p.active === false && <span className="pill gone">{t('deletedTag')}</span>}
                  </td>
                  <td className="muted">{p.region}</td><td className="muted">{p.gender}</td>
                  <td className="right">
                    {p.active === false ? (
                      <button className="mini" onClick={() => restore(p.id)}>{t('restore')}</button>
                    ) : (
                      <>
                        <button className="mini" onClick={() => setEdit({ ...p, _orig: p.id })}>{t('edit')}</button>
                        <button className="mini danger" onClick={() => del(p.id)}>{t('remove')}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <strong>{t('regionMaster')}</strong>
        <div className="chips wrap mt">
          {cfg.regions.map((r) => (
            <span key={r} className="chip">
              {r}
              <button onClick={async () => { const c = { ...cfg, regions: cfg.regions.filter((x) => x !== r) }; setCfg(c); await S.set('cfg', c); }}>✕</button>
            </span>
          ))}
        </div>
        <div className="navrow mt">
          <input className="grow" value={newRegion} onChange={(e) => setNewRegion(e.target.value)} placeholder={t('addRegion')} />
          <button className="btn" onClick={async () => {
            const v = newRegion.trim(); if (!v || cfg.regions.includes(v)) return;
            const c = { ...cfg, regions: [...cfg.regions, v] }; setCfg(c); await S.set('cfg', c); setNewRegion('');
          }}>+</button>
        </div>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.isNew ? t('addPerson') : t('edit')}>
        {edit && (
          <>
            <label className="fld"><span>{t('employeeId')}</span>
              <input value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} inputMode="numeric" />
            </label>
            <label className="fld"><span>{t('name')}</span>
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label className="fld"><span>{t('region')}</span>
              <select value={edit.region} onChange={(e) => setEdit({ ...edit, region: e.target.value })}>
                {cfg.regions.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="fld"><span>{t('gender')}</span>
              <select value={edit.gender} onChange={(e) => setEdit({ ...edit, gender: e.target.value })}>
                <option value="男">{t('male')}</option><option value="女">{t('female')}</option>
              </select>
            </label>
            <label className="fld"><span>{t('pedometerNo')}</span>
              <input value={edit.pedometer || ''} onChange={(e) => setEdit({ ...edit, pedometer: e.target.value })} />
            </label>
            <label className="fld"><span>{t('email')}</span>
              <input value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </label>
            <div className="navrow">
              <button className="btn ghost" onClick={() => setEdit(null)}>{t('cancel')}</button>
              <button className="btn primary" onClick={commit}>{t('save')}</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

/* ============================ Admin: feedback ============================= */
/* Everything submitted through ご意見・不具合の報告. It used to be rendered on
   マイページ, where every participant could read everyone else's; it belongs
   here, and the endpoint behind it is administrator-only. */
function FeedbackAdmin() {
  const t = useT(); const lang = useLang();
  const [items, setItems] = useState(null);

  useEffect(() => { fetchFeedback().then(setItems); }, []);

  const when = (ms) => new Date(ms).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  if (!items) return <div className="pad muted">{t('loading')}</div>;

  return (
    <>
      <div className="sechead">
        <span>{t('fbList')}</span>
        <em className="muted sm">{t('fbCount').replace('{n}', String(items.length))}</em>
      </div>

      {!items.length ? (
        <div className="pad muted">{t('fbNone')}</div>
      ) : (
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('fbWhen')}</th>
                <th>{t('fbFrom')}</th>
                <th>{t('fbCategory')}</th>
                <th>{t('fbMessage')}</th>
                <th>{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td>{when(x.at)}</td>
                  <td>
                    {x.name || t('fbAnonymous')}
                    {x.employeeId && <div className="muted sm">{x.employeeId}</div>}
                    {x.email && <div className="muted sm">{x.email}</div>}
                  </td>
                  <td className="muted">{x.category}</td>
                  <td className="wrapcell">{x.message}</td>
                  <td className="muted sm">{x.sent ? t('fbMailed') : t('fbNotMailed')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card soft">
        <p className="muted sm">{t('fbMailOff')}</p>
      </div>
    </>
  );
}

/* ============================ Admin: settings ============================= */
function SettingsAdmin({ cfg, setCfg, toast, onDemo, onWipe }) {
  const t = useT();
  const [fb, setFb] = useState(null);
  const upd = async (patch) => { const c = { ...cfg, ...patch }; setCfg(c); await S.set('cfg', c); };
  useEffect(() => { fetchFeedback().then(setFb); }, []);

  /* The typed fields are held as a draft and written on 保存. Saving on every
     keystroke used to store each half-typed value: clearing 基準歩数 wrote 0,
     and editing the administrator ID wrote 'k', 'ke', 'ken'… any of which
     could lock the last administrator out mid-word. */
  /* Figures are grouped as 5,000 rather than 5000, which a number input
     cannot do — it rejects the comma — so these are text fields that keep the
     digits and re-group them as you type. */
  const grouped = (v) => {
    const digits = String(v).replace(/[^\d]/g, '');
    return digits === '' ? '' : nf(Number(digits));
  };
  const plain = (v) => Number(String(v).replace(/[^\d]/g, '')) || 0;

  const [draft, setDraft] = useState({
    threshold: grouped(cfg.threshold), bonus: grouped(cfg.bonus),
    maxSteps: grouped(cfg.maxSteps), adminIds: cfg.adminIds.join(', '),
  });
  const setNum = (k) => (e) => setDraft((d) => ({ ...d, [k]: grouped(e.target.value) }));
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const dirty = draft.threshold !== grouped(cfg.threshold)
    || draft.bonus !== grouped(cfg.bonus)
    || draft.maxSteps !== grouped(cfg.maxSteps)
    || draft.adminIds !== cfg.adminIds.join(', ');

  const saveRules = async () => {
    const ids = draft.adminIds.split(',').map((x) => x.trim()).filter(Boolean);
    if (!ids.length) { toast(t('adminIdsRequired')); return; }
    await upd({
      threshold: plain(draft.threshold),
      bonus: plain(draft.bonus),
      maxSteps: plain(draft.maxSteps),
      adminIds: ids,
    });
    setDraft((d) => ({ ...d, adminIds: ids.join(', ') }));
    toast(t('saved'));
  };
  return (
    <>
      <div className="card">
        <strong>{t('rules')}</strong>
        <label className="fld"><span>{t('threshold')}</span>
          <input inputMode="numeric" value={draft.threshold} onChange={setNum('threshold')} />
        </label>
        <label className="fld"><span>{t('bonusAmount')}</span>
          <input inputMode="numeric" value={draft.bonus} onChange={setNum('bonus')} />
        </label>
        <label className="fld"><span>{t('maxSteps')}</span>
          <input inputMode="numeric" value={draft.maxSteps} onChange={setNum('maxSteps')} />
        </label>
        <label className="fld"><span>{t('adminIds')}</span>
          <input value={draft.adminIds} onChange={set('adminIds')} />
        </label>
        <div className="navrow">
          <button className="btn primary" disabled={!dirty} onClick={saveRules}>{t('saveSettings')}</button>
          {dirty && <span className="muted sm">{t('unsaved')}</span>}
        </div>
        <label className="check">
          <input type="checkbox" checked={cfg.enforceWindow} onChange={(e) => upd({ enforceWindow: e.target.checked })} />
          <span>{t('enforceWindow')}</span>
        </label>
        <p className="muted sm">{t('enforceNote')} {t('windowNote')}</p>
      </div>

      <div className="card">
        <strong>{t('exportLayout')}</strong>
        <label className="check"><input type="radio" checked={cfg.exportLayout === 'spec'} onChange={() => upd({ exportLayout: 'spec' })} /><span>{t('layoutSpec')}</span></label>
        <label className="check"><input type="radio" checked={cfg.exportLayout === 'legacy'} onChange={() => upd({ exportLayout: 'legacy' })} /><span>{t('layoutLegacy')}</span></label>
      </div>

      <div className="card soft">
        <div className="navrow wrap">
          <button className="btn" onClick={onDemo}>{t('demoData')}</button>
          <button className="btn danger" onClick={onWipe}>{t('resetAll')}</button>
        </div>
        <p className="muted sm">{t('demoNote')}</p>
      </div>
    </>
  );
}

/* ================================ Shell =================================== */
export default function App() {
  const [lang, setLang] = useState('ja');
  const [cfg, setCfg] = useState(null);
  const [roster, setRoster] = useState(null);
  const [user, setUser] = useState(null);
  const [mod, setMod] = useState('steps');
  const [tab, setTab] = useState('entry');
  const [holidays, setHolidays] = useState(HOLIDAYS_FALLBACK);
  const [{ y, m }, setPeriod] = useState(currentPeriod());
  const [showTrial, setShowTrial] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const toast = useCallback((msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2200); }, []);

  /* Sign-in is a server call: it checks the number, records consent the first
     time, and returns the one record this person is allowed to see. */
  const signIn = useCallback(async (id, consent) => {
    if (IS_LOCAL) {
      const rr = (await S.get('roster')) || [];
      const c = (await S.get('cfg')) || DEFAULT_CFG;
      const admin = (c.adminIds || []).map((a) => String(a).toLowerCase()).includes(id.toLowerCase());
      const p = rr.find((x) => String(x.id) === id);
      if (!admin && !p) return { error: 'not_found' };
      if (p && consent !== null && consent !== undefined && !p.consentAsked) {
        const next = rr.map((x) => (String(x.id) === String(p.id)
          ? { ...x, consent: !!consent, consentAsked: true, consentAt: Date.now() } : x));
        setRoster(next); await S.set('roster', next);
      }
      const u = admin ? { admin: true, id, name: '健康対策委員' } : { admin: false, ...p };
      setUser(u); setTab(admin ? 'admin' : 'entry');
      return { user: u };
    }
    const r = await apiLogin(id, consent);
    if (r.error) return r;
    setUser(r.user);
    setTab(r.user.admin ? 'admin' : 'entry');
    if (r.user.admin) {
      const [full, rr] = await Promise.all([S.get('cfg'), S.get('roster')]);
      if (full) setCfg({ ...DEFAULT_CFG, ...full });
      setRoster(rr || []);
    }
    return r;
  }, []);

  const signOut = useCallback(async () => {
    if (!IS_LOCAL) await apiLogout();
    setUser(null); setRoster([]); setTab('entry');
  }, []);

  /* Signed-out browsers get the public settings only, and no roster at all.
     The roster is loaded after sign-in, and only for an administrator. */
  useEffect(() => {
    (async () => {
      if (!IS_LOCAL) {
        const [pub, who] = await Promise.all([fetchBootstrap(), apiMe()]);
        setCfg({ ...DEFAULT_CFG, ...(pub || {}) });
        if (who) {
          setUser(who);
          setTab(who.admin ? 'admin' : 'entry');
          if (who.admin) {
            const [full, rr] = await Promise.all([S.get('cfg'), S.get('roster')]);
            if (full) setCfg({ ...DEFAULT_CFG, ...full });
            setRoster(rr || []);
          } else {
            setRoster([]);
          }
        } else {
          setRoster([]);
        }
        return;
      }
      const [c, r] = await Promise.all([S.get('cfg'), S.get('roster')]);
      let cc = c ? { ...DEFAULT_CFG, ...c } : DEFAULT_CFG;
      const ordered = orderRegions(cc.regions || DEFAULT_REGIONS);
      if (String(ordered) !== String(cc.regions)) { cc = { ...cc, regions: ordered }; await S.set('cfg', cc); }
      let rr = r;
      if (!rr) { rr = ROSTER_SEED; await S.set('roster', rr); }
      if (!c) await S.set('cfg', cc);
      setCfg(cc); setRoster(rr);
    })();
    fetch('https://holidays-jp.github.io/api/v1/date.json')
      .then((r) => r.json())
      .then((d) => setHolidays((h) => ({ ...h, ...d })))
      .catch(() => {});
  }, []);

  const T = STR;
  const tt = (k) => (T[k] ? T[k][lang === 'ja' ? 0 : 1] || T[k][0] : k);

  if (!cfg || !roster) {
    return <LangCtx.Provider value={lang}><div className="app theme-seiji"><Styles /><div className="pad muted">{tt('loading')}</div></div></LangCtx.Provider>;
  }

  if (!user) {
    if (showTrial) {
      return (
        <LangCtx.Provider value={lang}>
          <div className="app theme-seiji"><Styles />
            <TrialForm
              cfg={cfg} toast={toast} onCancel={() => setShowTrial(false)}
              onDone={async (p) => {
                const fresh = await S.get('roster');
                if (fresh) setRoster(fresh);
                setShowTrial(false); setUser({ admin: false, ...p }); setTab('entry');
              }}
            />
            <Toast msg={toastMsg} />
          </div>
        </LangCtx.Provider>
      );
    }
    return (
      <LangCtx.Provider value={lang}>
        <div className="app theme-seiji"><Styles />
          <Login
            onTrial={() => setShowTrial(true)}
            lang={lang} setLang={setLang}
            onLogin={signIn}
          />
        </div>
      </LangCtx.Provider>
    );
  }

  const me = user.admin || !IS_LOCAL
    ? user
    : roster.find((p) => String(p.id) === String(user.id)) || user;

  return (
    <LangCtx.Provider value={lang}>
      <div className="app theme-seiji">
        <Styles />
        <header className="hdr">
          <div className="hdr-l">
            <img className="hdr-mark" src={`${import.meta.env.BASE_URL}morabu-mark.png`} alt="" />
            <div className="hdr-txt">
              <div className="hdr-t">{tt('mainTitle')}</div>
              <div className="hdr-s">{me.name}{me.region ? `／${me.region}` : ''}{user.admin ? `／${tt('admin')}` : ''}</div>
            </div>
          </div>
          <div className="hdr-r">
            <button className="mini" onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>{lang === 'ja' ? 'EN' : '日本語'}</button>
            <button className="mini" onClick={signOut}>{tt('logout')}</button>
          </div>
        </header>

        <main className="main">
          {!user.admin && tab === 'profile' ? (
            <ProfileTab user={me} cfg={cfg} roster={roster} setRoster={setRoster} toast={toast} y={y} m={m} onUpdated={setUser} />
          ) : mod !== 'steps' ? (
            <div className="pad center">
              <div className="soonbox">
                <div className="soonicon">{MODULES.find((x) => x.id === mod)?.[lang === 'ja' ? 'ja' : 'en']}</div>
                <strong>{tt('soon')}</strong>
                <p className="muted sm">{tt('soonBody')}</p>
              </div>
            </div>
          ) : user.admin ? (
            <AdminTab cfg={cfg} setCfg={setCfg} roster={roster} setRoster={setRoster} y={y} m={m} setPeriod={setPeriod} toast={toast} holidays={holidays} />
          ) : (
            <StepsTab user={me} cfg={cfg} holidays={holidays} y={y} m={m} setPeriod={setPeriod} toast={toast} />
          )}
        </main>

        <nav className="nav">
          {MODULES.map((x) => (
            <button
              key={x.id}
              className={(mod === x.id && (user.admin || tab !== 'profile') ? 'on ' : '') + (x.ready ? '' : 'dim')}
              onClick={() => { setMod(x.id); setTab(user.admin ? 'admin' : 'entry'); }}
            >
              <span>{lang === 'ja' ? x.ja : x.en}</span>
              {!x.ready && <em className="badge">{tt('soon')}</em>}
            </button>
          ))}
          {!user.admin && (
            <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>
              <span>{tt('mypage')}</span>
            </button>
          )}
        </nav>

        <FeedbackButton user={user.admin ? null : me} toast={toast} />
        <Toast msg={toastMsg} />
      </div>
    </LangCtx.Provider>
  );
}

/* ================================ Styles ================================== */
function Styles() {
  return (
    <style>{MORABOT_CSS + `
/* ---------------------------------------------------------------------------
   Type: Inter for Latin and every figure (real tabular numerals, so step
   counts align in a column), Noto Sans JP for Japanese. Both are drawn for
   screen reading at small sizes and neither has quirks that tire the eye.
   Base size is 16px — a step up, since most people use this on a phone.

   Colour: one palette. Each colour has a single job — one for a day that
   met the target, one for a shortfall and for Sundays and public holidays,
   one for Saturdays. Nothing is coloured for decoration.
--------------------------------------------------------------------------- */

/* Corporate blue, sampled from the Morabu Hanshin mark. Constant across
   the palette: it identifies the system, so it is not a palette variable. */
:root{ --brand:#0C68B3; --brand-dk:#09528F; --brand-wash:#EAF2FA; }

/* 青磁 — soft blue-green neutrals, low glare */
.theme-seiji{
  --ink:#233038; --ink-2:#5A686F; --dim:#87949A; --faint:#B3BEC2;
  --wash:#F3F6F5; --field:#FAFCFB;
  --rule:#DCE4E2; --rule-2:#C1CDCA; --hair:#EBF0EE;
  --go:#2E7D6B; --go-wash:#E9F4F1;
  --warn:#B15A44; --warn-wash:#FBF1EE;
  --sat:#41678F; --sat-wash:#EDF2F8;
}

*{box-sizing:border-box}
.app{font-family:"Inter","Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic UI",system-ui,sans-serif;
  color:var(--ink);background:#fff;min-height:100vh;display:flex;flex-direction:column;
  font-size:16px;line-height:1.75;-webkit-font-smoothing:antialiased;text-size-adjust:100%;
  font-feature-settings:"tnum" 0}
.app button{font-family:inherit;cursor:pointer}
.app input,.app select{font-family:inherit;font-size:16px;color:var(--ink)}
.num,.mono,.stat-v,.dnum,.dval,.ld,.dg,.bignum,.periodbar em,.hit em,.ribbon-line span{
  font-variant-numeric:tabular-nums}
.muted{color:var(--ink-2)} .sm{font-size:13.5px;line-height:1.8}
.pad{padding:16px} .mt{margin-top:12px} .center{text-align:center}
.right{text-align:right} .grow{flex:1} .b{font-weight:600}

/* ---- login ------------------------------------------------------------- */
.login{flex:1;display:flex;justify-content:center;align-items:stretch;background:#fff;
  border-top:4px solid var(--brand)}
.login-inner{width:100%;max-width:452px;padding:26px 22px 34px;display:flex;flex-direction:column}
@media(min-width:600px){.login-inner{padding-top:52px}}
.login-top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:36px}
.logo{height:25px;width:auto;display:block}
.lang{background:#fff;color:var(--ink-2);border:1px solid var(--rule);padding:6px 12px;
  font-size:13px;flex:none;border-radius:4px}
.lang:hover{border-color:var(--ink);color:var(--ink)}
.login-title{margin-bottom:28px}
.eyebrow{display:block;font-size:13px;color:var(--brand);font-weight:600}
.login-title h1{margin:3px 0 0;font-size:30px;font-weight:600;line-height:1.28;letter-spacing:-.015em}
.facts{margin:0 0 30px;border-top:1px solid var(--rule-2)}
.facts>div{display:flex;justify-content:space-between;align-items:baseline;gap:14px;
  padding:9px 0;border-bottom:1px solid var(--hair);font-size:14px}
.facts dt{margin:0;color:var(--ink-2)}
.facts dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums}
.fld{display:block;margin-bottom:18px}
.fld>span{display:block;font-size:13px;color:var(--ink-2);margin-bottom:6px;font-weight:500}
.fld input,.fld select,.filters input,.filters select,.navrow input,.find input{
  width:100%;padding:13px;border:1px solid var(--rule);background:var(--field);
  border-radius:4px;outline:none;-webkit-appearance:none;appearance:none}
.fld select,.filters select{background:var(--field) url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0h10L5 6z' fill='%235A686F'/%3E%3C/svg%3E") no-repeat right 13px center/10px;padding-right:32px}
.fld input:focus,.fld select:focus,.filters input:focus,.find input:focus{border-color:var(--brand);background:#fff}
.fld input[inputmode=numeric]{font-size:21px;letter-spacing:.03em;font-weight:500}
.err{color:var(--warn);font-size:13.5px;margin:-10px 0 12px;font-weight:500}
.linkbtn{background:none;border:0;color:var(--ink-2);font-size:13.5px;
  border-bottom:1px solid var(--rule);padding:0 0 1px;display:block;margin:16px auto 0}
.linkbtn:hover{color:var(--brand);border-color:var(--brand)}
.login-foot{margin-top:auto;padding-top:36px;display:flex;flex-direction:column;gap:2px;
  font-size:12.5px;color:var(--dim)}

/* ---- chrome ------------------------------------------------------------ */
.hdr{display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:9px 14px;background:#fff;color:var(--ink);border-bottom:2px solid var(--brand);
  position:sticky;top:0;z-index:20}
.hdr-l{display:flex;align-items:center;gap:11px;min-width:0}
.hdr-mark{height:23px;width:auto;flex:none;display:block}
.hdr-txt{min-width:0}
.hdr-t{font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hdr-s{font-size:12.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hdr-r{display:flex;gap:6px;flex:none}
.main{flex:1;width:100%;max-width:840px;margin:0 auto;padding-bottom:76px;background:#fff}
@media(min-width:842px){.main{border-left:1px solid var(--rule);border-right:1px solid var(--rule)}}
.nav{position:fixed;bottom:0;left:0;right:0;display:flex;background:#fff;
  border-top:1px solid var(--rule-2);z-index:20}
.nav button{flex:1;background:var(--wash);border:0;border-right:1px solid var(--hair);
  padding:14px 4px;font-size:13.5px;color:var(--dim);position:relative}
.nav button:last-child{border-right:0}
.nav button:hover{background:var(--brand-wash);color:var(--brand)}
.nav button.on{background:#fff;color:var(--brand);font-weight:600;box-shadow:inset 0 2px 0 var(--brand)}
.nav button.dim{color:var(--faint)}
.badge{position:absolute;top:3px;right:7px;font-size:9px;font-style:normal;color:var(--faint)}

/* ---- structure --------------------------------------------------------- */
.tabbody{padding:0}
.periodbar{display:flex;align-items:stretch;border-bottom:1px solid var(--rule);background:#fff}
.periodbar>div{flex:1;text-align:center;padding:11px 0;line-height:1.4}
.periodbar strong{display:block;font-size:16.5px;font-weight:600}
.periodbar em{font-style:normal;font-size:12.5px;color:var(--ink-2)}
.periodbar button{width:48px;border:0;border-right:1px solid var(--hair);background:none;
  font-size:19px;color:var(--ink-2)}
.periodbar button:last-child{border-right:0;border-left:1px solid var(--hair)}
.periodbar button:hover{background:var(--wash)}
.card{background:#fff;border-bottom:1px solid var(--rule);padding:16px 14px}
.card.soft{background:var(--wash)}
/* ---- モラボット ---------------------------------------------------------- */
.login-hello{display:flex;align-items:flex-end;gap:6px;margin:6px 0 2px}
.login-hello .mbot{width:104px;height:118px;flex:0 0 auto}
.login-hello .bubble{margin:0 0 24px;background:var(--sat-wash);border-radius:14px 14px 14px 3px;
  padding:11px 14px;font-size:13px;font-weight:500;color:var(--ink);line-height:1.5;white-space:pre-line}

.companion{padding:14px 16px 13px}
.companion .crow{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.companion .clabel{font-size:12px;font-weight:700;color:var(--ink-2)}
.companion .cgoal{font-size:11px;color:var(--dim)}
.companion .track{position:relative;height:104px;margin-top:4px}
/* He travels between the rail's ends rather than being centred on them,
   so at 0% he stands at the start line instead of half off the card. */
.companion .walker{position:absolute;bottom:19px;width:80px;height:90px;margin-left:-40px;
  left:calc(40px + (100% - 80px) * var(--p, 0));
  transition:left .9s cubic-bezier(.33,.1,.3,1)}
.companion .rail{position:absolute;left:0;right:0;bottom:8px;height:10px;border-radius:5px;background:var(--hair)}
.companion .railfill{position:absolute;left:0;bottom:8px;height:10px;border-radius:5px;background:var(--brand);
  transition:width .9s cubic-bezier(.33,.1,.3,1)}
.companion .goalpost{position:absolute;right:0;bottom:18px;width:2px;height:26px;background:var(--rule-2)}
.companion .goalpost::after{content:"";position:absolute;right:2px;top:0;width:17px;height:12px;
  background:var(--go);border-radius:2px 0 0 2px}
.companion .foot{margin-top:10px}
.companion .csteps{font-size:26px;font-weight:700;color:var(--ink);letter-spacing:-.01em}
.companion .cunit{font-size:12px;color:var(--dim);margin:0 auto 0 5px}
.companion .cnote{font-size:12px;font-weight:500;color:var(--brand);text-align:right}
.companion .cnote.ok{color:var(--go)}

.result{display:flex;align-items:center;gap:14px;padding:14px 16px}
.result .rbot{width:94px;height:104px;flex:0 0 auto}
.result strong{display:block;font-size:15px;font-weight:700;color:var(--ink)}
.result p{margin:4px 0 0;font-size:12px;color:var(--ink-2);line-height:1.6}
.result.bonus{background:var(--go-wash);border-color:#BFDCD4}
.result.short{background:var(--wash)}

.hit{position:relative;text-align:center;padding:4px 2px 2px;overflow:hidden}
.hit .hitbot{position:relative;width:150px;height:170px;margin:0 auto}
.hit h2{position:relative;margin:14px 0 0;font-size:22px;font-weight:700;color:var(--ink)}
.hit p{position:relative;margin:8px 0 0;font-size:13px;color:var(--ink-2);line-height:1.7}
.hit .btn{position:relative;margin-top:18px}
.hit .confetti{position:absolute;inset:0;pointer-events:none}
.hit .confetti i{position:absolute;top:0;width:8px;height:12px;border-radius:2px;
  animation:hitFall 2.3s linear infinite}
@keyframes hitFall{
  0%{transform:translateY(-30px) rotate(0);opacity:0}
  14%{opacity:1}
  100%{transform:translateY(230px) rotate(520deg);opacity:0}
}
@media(prefers-reduced-motion:reduce){
  .hit .confetti i{animation:none;opacity:0}
  .companion .walker,.companion .railfill{transition:none}
}

.sechead{display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:12px 14px 11px;border-bottom:1px solid var(--rule-2);background:var(--wash)}
.sechead>span{font-size:13px;font-weight:600;color:var(--ink-2)}
/* Sits next to the heading rather than between it and the view switch. */
.sechead>span.savestate{margin-right:auto;font-weight:500;font-size:12px}
.savestate.saving{color:var(--dim)}
.savestate.saved{color:var(--go)}
.savestate.error{color:var(--warn);font-weight:600}

.row2,.row3,.row4{display:flex;border-bottom:1px solid var(--hair)}
.row4{flex-wrap:wrap}
.stat{flex:1 1 0;min-width:0;padding:11px 13px;border-left:1px solid var(--hair)}
.row4 .stat{flex:1 1 50%;border-top:1px solid var(--hair)}
@media(min-width:620px){.row4 .stat{flex:1 1 0;border-top:0}}
.stat:first-child{border-left:0}
.stat.mark{background:var(--go);color:#fff;border-left-color:var(--go)}
.stat-l{font-size:12px;color:var(--ink-2);font-weight:500;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.stat.mark .stat-l{color:rgba(255,255,255,.78)}
.stat-v{font-size:24px;font-weight:600;line-height:1.4;letter-spacing:-.015em}
.stat-v em{font-style:normal;font-size:12.5px;font-weight:400;color:var(--ink-2);margin-left:5px;letter-spacing:0}
.stat.mark .stat-v em{color:rgba(255,255,255,.78)}

.banner{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:12px 14px;
  font-size:14px;font-weight:600;border-bottom:1px solid var(--rule);border-left:4px solid var(--go)}
.banner.ok{background:var(--go-wash);color:var(--go)}
.banner.warn{border-left-color:var(--warn);color:var(--warn);background:var(--warn-wash)}
.banner .dot{display:none}
.banner em{font-style:normal;font-weight:400;font-size:13px;flex-basis:100%;color:var(--ink-2)}

/* ---- 完歩リボン -------------------------------------------------------- */
.ribbon{position:relative;height:74px;margin:18px 0 11px;border-bottom:1px solid var(--rule-2)}
.ribbon-bars{display:flex;align-items:flex-end;gap:1px;height:100%}
.ribbon .b{flex:1;min-height:2px;background:var(--go);border-radius:1px 1px 0 0}
.ribbon .b.short{background:var(--warn)}
.ribbon .b.none{background:var(--hair);height:2px!important}
.ribbon-dates{display:flex;gap:1px;margin-top:4px}
.ribbon-dates span{flex:1;min-width:0;text-align:center;font-size:9.5px;line-height:1.2;
  color:var(--dim);white-space:nowrap;overflow:visible}
.ribbon-line{position:absolute;left:0;right:0;border-top:1px dashed var(--dim);pointer-events:none}
.ribbon-line span{position:absolute;right:0;top:-16px;font-size:11.5px;color:var(--ink-2);
  background:#fff;padding:0 3px}
.legend{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2)}
.legend .lg{width:11px;height:11px;display:inline-block;margin-left:11px;border-radius:2px}
.legend .lg:first-child{margin-left:0}
.lg.sat{background:var(--sat-wash);border:1px solid var(--sat)}
.lg.sun{background:var(--warn-wash);border:1px solid var(--warn)}
.lg.go{background:var(--go)} .lg.short{background:var(--warn)}

/* ---- tabs -------------------------------------------------------------- */
.seg{display:flex;gap:6px}
.seg button{border:1px solid var(--rule-2);background:#fff;border-radius:5px;
  padding:6px 14px;font-size:14px;color:var(--ink-2);font-weight:500}
.seg button:hover{border-color:var(--brand);color:var(--brand)}
.seg button.on{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
.seg.four,.seg.tabs{gap:0;border-bottom:1px solid var(--rule-2)}
.seg.four button,.seg.tabs button{flex:1;padding:13px 2px;font-size:13.5px;
  border:0;border-radius:0;background:none;font-weight:500}
.seg.four button:hover,.seg.tabs button:hover{border-color:transparent}
.seg.tabs button{font-size:12px;padding:12px 1px;line-height:1.3}
.seg.four button.on,.seg.tabs button.on{background:var(--brand);color:#fff}

/* consent notice on the login screen */
.consent{display:flex;gap:10px;align-items:flex-start;margin:0 0 20px;padding:13px 14px;
  background:var(--brand-wash);border:1px solid #CFE0F1;border-radius:5px;font-size:13px;line-height:1.7}
.consent input{margin-top:4px;width:18px;height:18px;flex:none;accent-color:var(--brand)}
.consent em{display:block;font-style:normal;color:var(--ink-2);font-size:12px;margin-top:4px}
.consent.done{color:var(--go);background:var(--go-wash);border-color:#C6E2D8;font-weight:600}

/* reminder preview */
.mailbody{white-space:pre-wrap;word-break:break-word;background:var(--wash);
  border:1px solid var(--rule);border-radius:5px;padding:13px;font-size:12.5px;
  line-height:1.85;margin:14px 0 0;max-height:44vh;overflow:auto;
  font-family:inherit;color:var(--ink)}
.kv .wrapv{white-space:normal;text-align:right;margin-left:16px;font-weight:500;font-size:12.5px}
a.btn{text-decoration:none;text-align:center;display:inline-block}

/* ---- calendar ---------------------------------------------------------- */
.cal{display:grid;grid-template-columns:repeat(7,1fr);
  border-top:1px solid var(--rule);border-left:1px solid var(--rule)}
.cal-h{text-align:center;font-size:12px;color:var(--ink-2);font-weight:600;padding:7px 0;
  border-right:1px solid var(--rule);border-bottom:1px solid var(--rule-2);background:var(--wash)}
.cal-h.sun{color:var(--warn)} .cal-h.sat{color:var(--sat)}
.cell{aspect-ratio:1/1;border:0;border-right:1px solid var(--rule);
  border-bottom:1px solid var(--rule);background:#fff;border-radius:0;
  display:flex;flex-direction:column;justify-content:space-between;
  padding:4px 5px 7px;text-align:left;position:relative}
.cell.empty{background:var(--wash)}
.cell .dnum{font-size:12px;color:var(--ink-2)}
.cell .dval{font-size:14px;font-weight:600;text-align:right;letter-spacing:-.03em}
.cell.sun{background:var(--warn-wash)}
.cell.sun .dnum{color:var(--warn)}
.cell.sat{background:var(--sat-wash)}
.cell.sat .dnum{color:var(--sat)}
.cell.go::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--go)}
.cell.go .dval{color:var(--go)}
.cell.short .dval{color:var(--warn)}
.cell.blank .dval{color:var(--faint);font-weight:400}
.cell:not(.lock):hover{background:var(--wash)}

/* ---- list view --------------------------------------------------------- */
.listv{border-top:1px solid var(--rule)}
.lrow{display:flex;align-items:center;gap:10px;padding:7px 14px;border-bottom:1px solid var(--hair)}
.lrow.sun{background:var(--warn-wash)}
.lrow.sat{background:var(--sat-wash)}
.lrow.none{background:var(--wash);color:var(--faint)}
.lrow .ld{width:84px;font-size:14.5px;font-weight:600;flex:none}
.lrow .ld em{font-style:normal;font-size:12.5px;color:var(--ink-2);margin-left:6px;font-weight:400}
.lrow.sun .ld{color:var(--warn)} .lrow.sat .ld{color:var(--sat)}
.lrow .lm{font-size:13px}
.lrow .hol{font-size:12.5px;color:var(--warn);flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.lrow input{margin-left:auto;width:116px;padding:9px 11px;text-align:right;
  border:1px solid var(--rule);background:var(--field);font-weight:600;
  border-radius:4px;outline:none;font-variant-numeric:tabular-nums}
.lrow input:focus{border-color:var(--ink);background:#fff}
.lrow input.go{color:var(--go)}
.lrow input.short{color:var(--warn)}
.lrow input:disabled{background:var(--wash);color:var(--ink-2)}

.submitbar{position:sticky;bottom:62px;padding:14px;background:#fff;border-top:1px solid var(--rule-2)}
.note{font-size:13px;color:var(--ink-2);margin-bottom:10px;line-height:1.7}

/* ---- controls ---------------------------------------------------------- */
.btn{padding:12px 17px;border:1px solid var(--rule-2);background:#fff;color:var(--ink);
  font-weight:600;font-size:14.5px;border-radius:4px}
.btn:hover{background:var(--wash)}
.btn.primary{background:var(--brand);color:#fff;border-color:var(--brand)}
.btn.primary:hover{background:var(--brand-dk);border-color:var(--brand-dk)}
.btn.primary:disabled{background:var(--faint);border-color:var(--faint);cursor:not-allowed;filter:none}
.btn.ghost{border-color:var(--rule)}
.btn.danger{color:var(--warn);border-color:var(--warn);opacity:.85}
.btn.danger:hover{background:var(--warn-wash);opacity:1}
.btn.big{width:100%;padding:16px;font-size:16px}
.mini{padding:6px 11px;font-size:13px;border:1px solid var(--rule);background:#fff;
  color:var(--ink-2);border-radius:4px}
.mini:hover{background:var(--wash)}
.mini.danger{color:var(--warn);border-color:var(--rule)}


/* ---- modal ------------------------------------------------------------- */
.ovl{position:fixed;inset:0;background:rgba(30,36,42,.5);display:flex;
  align-items:flex-end;justify-content:center;z-index:60}
@media(min-width:620px){.ovl{align-items:center}}
.sheet{background:#fff;width:100%;max-width:440px;max-height:88vh;
  display:flex;flex-direction:column;border-radius:8px 8px 0 0;overflow:hidden}
@media(min-width:620px){.sheet{border-radius:8px}}
.sheet.wide{max-width:680px}
.sheet-h{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;
  background:var(--brand);color:#fff;font-size:14.5px;font-weight:600}
.sheet-b{padding:18px 16px 24px;overflow:auto}
.x{border:0;background:none;font-size:15px;color:rgba(255,255,255,.7);padding:4px 6px}
.kv{display:flex;justify-content:space-between;padding:10px 0;
  border-bottom:1px solid var(--hair);font-size:14.5px}
.kv strong{font-weight:600;font-variant-numeric:tabular-nums}
.numpad .bignum{width:100%;font-size:46px;font-weight:600;text-align:center;border:0;
  border-bottom:2px solid var(--rule-2);padding:4px 0 10px;outline:none;background:none;
  border-radius:0;letter-spacing:-.02em}
.numpad .bignum:focus{border-color:var(--brand)}
.chips{display:flex;gap:6px;margin:18px 0;flex-wrap:wrap}
.chips button{flex:1;min-width:64px;padding:10px 4px;border:1px solid var(--rule);
  background:#fff;font-size:13.5px;font-weight:500;border-radius:4px;color:var(--ink);
  font-variant-numeric:tabular-nums}
.chips button:hover{border-color:var(--brand);color:var(--brand)}
.chips.wrap .chip{display:inline-flex;align-items:center;gap:6px;background:#fff;
  border:1px solid var(--rule);padding:6px 8px 6px 12px;font-size:13.5px;flex:none;border-radius:4px}
.chip button{border:0;background:none;color:var(--dim);font-size:12px;padding:0 2px}
.navrow{display:flex;gap:8px;align-items:center;margin-top:14px}
.navrow input{flex:1 1 auto;min-width:0;width:auto}
.navrow.wrap{flex-wrap:wrap}
.navrow .btn{flex:1}
.navrow.wrap .btn{flex:1 1 auto}
.check{display:flex;gap:10px;align-items:flex-start;padding:8px 0;font-size:14.5px}
.check input{margin-top:5px;width:17px;height:17px;flex:none;accent-color:var(--go)}

/* ---- tables ------------------------------------------------------------ */
.filters{display:grid;grid-template-columns:1fr minmax(116px,150px);gap:8px;
  padding:12px 14px;border-bottom:1px solid var(--hair);align-items:center}
.filters input,.filters select{min-width:0}
.tablewrap{overflow:auto;border-bottom:1px solid var(--rule)}
.tbl{width:100%;border-collapse:collapse;font-size:14px}
.tbl th{text-align:left;padding:10px 11px;background:var(--wash);
  border-bottom:1px solid var(--rule-2);font-size:12.5px;font-weight:600;
  color:var(--ink-2);white-space:nowrap;position:sticky;top:0}
.tbl th.sortable{cursor:pointer;user-select:none}
.tbl th.sortable:hover{color:var(--ink)}
.tbl td{padding:10px 11px;border-bottom:1px solid var(--hair);white-space:nowrap}
.tbl tbody tr:hover{background:var(--wash)}
.tbl .num{text-align:right;font-variant-numeric:tabular-nums}
.tbl .mono{font-variant-numeric:tabular-nums}
.tbl .mark{color:var(--go);font-weight:700;font-size:16px}
.pill{display:inline-block;padding:2px 9px;border:1px solid var(--rule);
  font-size:12px;color:var(--ink-2);border-radius:4px}
.pill.ok{border-color:var(--go);color:var(--go);font-weight:600;background:var(--go-wash)}
.daygrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));
  border-top:1px solid var(--rule);border-left:1px solid var(--rule);margin:14px 0}
.dg{border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);
  padding:6px 4px;text-align:center;font-size:11.5px;color:var(--ink-2)}
.dg b{display:block;font-size:13.5px;color:var(--ink);font-weight:600}
.dg.go b{color:var(--go)}
.dg.short b{color:var(--warn)}
.dg.blank b{color:var(--faint);font-weight:400}

.fab{position:fixed;right:14px;bottom:82px;z-index:30;background:var(--ink);color:#fff;
  border:0;border-radius:99px;padding:10px 16px;font-size:12.5px;font-weight:600;
  box-shadow:0 4px 14px rgba(30,36,42,.28)}
.fab:hover{background:var(--brand)}
.fld textarea{width:100%;padding:12px;border:1px solid var(--rule);background:var(--field);
  border-radius:4px;outline:none;font-family:inherit;font-size:15px;line-height:1.7;resize:vertical}
.fld textarea:focus{border-color:var(--brand);background:#fff}
.fld-note{display:block;font-style:normal;font-size:12px;color:var(--dim);margin-top:5px}
.trial-cta{width:100%;margin-top:20px;border-color:var(--brand);color:var(--brand)}
.trial-cta:hover{background:var(--brand-wash)}
/* a removed participant, shown only when 削除済みを表示 is ticked */
.tbl tr.gone td{color:var(--dim)}
.pill.gone{margin-left:7px;border-color:var(--rule-2);color:var(--dim);background:var(--wash);
  font-weight:600;font-size:11px;padding:1px 7px}
.pill.trial{margin-left:7px;border-color:var(--brand);color:var(--brand);background:var(--brand-wash);
  font-weight:600;font-size:11px;padding:1px 7px}
/* Needs the td to out-specify the nowrap on .tbl td — as a bare class it
   lost on specificity, so long messages ran under the next column. */
.tbl td.wrapcell{white-space:normal;min-width:260px;max-width:460px;line-height:1.6}

.soonbox{border:1px solid var(--rule);padding:46px 20px;margin:24px 14px;border-radius:5px}
.soonicon{font-size:20px;font-weight:600;margin-bottom:10px}
.toast{position:fixed;bottom:78px;left:50%;transform:translateX(-50%);
  background:var(--ink);color:#fff;padding:11px 19px;font-size:14px;
  z-index:80;white-space:nowrap;border-radius:5px}
@media(prefers-reduced-motion:no-preference){
  .toast{animation:rise .16s ease-out}
  @keyframes rise{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
}
:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
`}</style>
  );
}
