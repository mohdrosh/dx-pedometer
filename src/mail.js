/* ============================================================================
   Reminder mail — shared by the browser app (preview / manual send) and by
   server.js (the automatic 26th-of-the-month send). Keep it dependency-free
   so plain Node can import it without a build step.
========================================================================== */

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PERSONAL_DOMAINS = [
  'hotmail', 'gmail', 'yahoo', 'icloud', 'outlook', 'live.', 'msn',
  'ezweb', 'docomo', 'softbank', 'au.com', 'nifty', 'ocn', 'biglobe', 'me.com',
];

/** The roster keeps several addresses in one cell ("a@morabu.com; b@hotmail.co.jp").
    Reminders go to the company address only. */
export function companyEmail(raw) {
  if (!raw) return '';
  const list = String(raw).split(/[;,\s]+/).map((x) => x.trim()).filter((x) => x.includes('@'));
  if (!list.length) return '';
  const morabu = list.find((a) => /morabu\.com$/i.test(a));
  if (morabu) return morabu;
  const work = list.find((a) => !PERSONAL_DOMAINS.some((d) => a.toLowerCase().includes(d)));
  return work || list[0];
}

/** Period m of year y closes on the 20th; the final deadline is the 1st of the
    following month. Reminders go out on the 26th. */
export function finalDeadline(y, m) {
  const d = new Date(y, m, 1);            // month index m == the month after the period end
  return { date: d, y: d.getFullYear(), m: d.getMonth() + 1, d: 1, dow: d.getDay() };
}

export function deadlineTextJa(y, m) {
  const f = finalDeadline(y, m);
  return `${f.m}月${f.d}日（${DOW_JA[f.dow]}）`;
}

export function deadlineTextEn(y, m) {
  const f = finalDeadline(y, m);
  const mon = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'][f.m - 1];
  return `${mon} ${f.d} (${DOW_EN[f.dow]})`;
}

function rangeText(y, m) {
  const s = new Date(y, m - 2, 21), e = new Date(y, m - 1, 20);
  return `${s.getMonth() + 1}/${s.getDate()}〜${e.getMonth() + 1}/${e.getDate()}`;
}

/**
 * Build the reminder message. Japanese first, English below the rule.
 * @param {{name:string, y:number, m:number, consent:boolean, url:string}} o
 */
export function reminderMail(o) {
  const { name, y, m, consent, url = '' } = o;
  const ja = deadlineTextJa(y, m);
  const en = deadlineTextEn(y, m);
  const range = rangeText(y, m);

  const subject = `【健康対策委員会】万歩計実績表 未提出のお知らせ（${y}年${m}月度）／ Pedometer record not yet submitted`;

  const consentJa = consent
    ? '\n※ご同意いただいている設定により、期限までにご提出がない場合は、未入力の日を0歩として自動的に提出されます。'
    : '';
  const consentEn = consent
    ? '\nBased on the consent you gave at sign-in, if nothing is submitted by the deadline your record will be submitted automatically with blank days counted as 0.'
    : '';

  const body =
`${name} 様

いつも健康対策推進活動にご協力いただきありがとうございます。
${y}年${m}月度（${range}）の万歩計実績表が、現在未提出となっています。

お手数ですが、${ja}までにシステムからご提出ください。
${url}

※1日でも5,000歩に届かなかった月でも、実績のご提出をお願いしています。完歩賞の対象外となる場合でも、参加記録として集計いたします。${consentJa}

────────────────────────────────

Dear ${name},

Your pedometer record for ${y}/${m} (${range}) has not been submitted yet.

Please submit it through the system by ${en}.
${url}

Please submit even if you did not reach 5,000 steps on every day — the record is still counted as participation.${consentEn}

────────────────────────────────
健康対策委員会 / Health Promotion Committee
モラブ阪神工業株式会社
`;

  return { subject, body };
}

/** Summary sent to 総務 after each automatic run. */
export function summaryMail(o) {
  const { y, m, reminded = [], autoSubmitted = [], kind } = o;
  const list = (arr) => (arr.length ? arr.map((p) => `  ・${p.id} ${p.name}`).join('\n') : '  （なし / none）');

  if (kind === 'reminder') {
    return {
      subject: `【自動送信】${y}年${m}月度 未提出者リマインド送信結果（${reminded.length}名）`,
      body: `${y}年${m}月度の未提出者へリマインドを送信しました。\nSent reminder to ${reminded.length} participant(s).\n\n送信先 / Recipients:\n${list(reminded)}\n\n最終締切 / Final deadline: ${deadlineTextJa(y, m)}\n`,
    };
  }
  return {
    subject: `【自動送信】${y}年${m}月度 自動提出結果（${autoSubmitted.length}名）`,
    body: `${y}年${m}月度について、同意済みかつ未提出の方の実績を自動提出しました。\nAuto-submitted ${autoSubmitted.length} record(s). Blank days were recorded as 0.\n\n対象者 / Records:\n${list(autoSubmitted)}\n`,
  };
}
