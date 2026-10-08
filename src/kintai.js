/* ============================================================================
   勤怠 — the month's hours, worked out the way 業務報告書 works them out.

   This is a port of the spreadsheet, not a fresh interpretation of it. Every
   rule below exists because a formula in 業務報告書・社内用（20日締）says so,
   and the cell is named in the comment beside it. Where the sheet does
   something surprising, the port does the same surprising thing: payroll has
   been reading those numbers for years and the web version has to agree with
   them to the minute, or nobody will trust it.

   The day is cut into bands — morning, lunch, afternoon, the evening break,
   overtime, late night, early morning — and a day's entry is scored by how
   much of it falls in each. That is the whole trick; everything after it is
   addition.

   Hours are decimal (7.75 = 7h45m) because the sheet is decimal. Minutes are
   whole: the sheet rounds each band with TEXT(...,"h:mm"), which truncates to
   the minute, and so does bandHours below.
   ========================================================================= */

/** 勤怠状況 — the first dropdown (AJ). */
export const STATUS_1 = [
  '有給休暇', '直行', '遅刻（電車遅延）', '遅刻', '欠勤',
  '特別休暇', '振替休日', '振替予定休日出勤', '休日出勤',
];

/** 勤怠状況 — the second dropdown (AN). */
export const STATUS_2 = ['直帰', '早退'];

/** The ones that mean "not at work", which zero the day's times (BI). */
const LEAVE = ['有給休暇', '欠勤', '振替休日', '特別休暇'];

/* The defaults are モラブ阪神's, read off the 就業時間 panel of the sheet
   (AW16/AZ16, AW24, AW27 and the 平日/休憩/深夜/早朝 block at BE3:BG7). A
   client site with different hours gets its own copy of this. */
export const DEFAULT_RULES = {
  workStart: '09:00',   // 平日 始業      BF3
  workEnd: '17:45',     // 平日 終業      BG3
  break1: ['12:00', '13:00'],  // 休憩     BF4–BG4
  break2: ['17:45', '18:00'],  // 休憩     BF5–BG5
  nightStart: '22:00',  // 深夜 から      BF6
  nightEnd: '29:00',    // 深夜 まで(翌5時) BG6
  earlyStart: '05:00',  // 早朝 から      BF7
  unitMin: 15,          // 割増単位       AW24
  deductUnitMin: 15,    // 控除単位       AW27
  premiumDow: [0],      // 休日割増適用日  AQ30 — 日曜日
};

/* ------------------------------ time helpers ----------------------------- */

/** "17:45" or "29:00" (meaning 5am the next day) as hours past midnight. */
export const hhmm = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h + (m || 0) / 60;
};

export const fmtHM = (hours) => {
  if (!hours) return '';
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** Hours as the form prints them: a 時間 box and a 分 box (AQ40 / AX40). */
export const splitHM = (hours) => {
  const total = Math.round((hours || 0) * 60);
  return { h: Math.floor(total / 60), m: total % 60 };
};

/** How much of [from,to] falls inside [a,b], truncated to the minute.
    The sheet writes this as TEXT(MAX(0,MIN(end,b)-MAX(start,a)),"h:mm")*24 —
    the TEXT is what drops any stray seconds, so the port floors to minutes. */
const bandHours = (from, to, a, b) => {
  const overlap = Math.min(to, b) - Math.max(from, a);
  return overlap <= 0 ? 0 : Math.floor(overlap * 60 + 1e-6) / 60;
};

/* ------------------------------ one day ---------------------------------- */

/**
 * @param {object} day   { dow: 0-6, holiday: bool, inH, inM, outH, outM,
 *                         status1, status2 }
 * @param {object} rules DEFAULT_RULES or a client's own
 * @returns the day's bands and the four overtime buckets, in decimal hours
 */
export function computeDay(day, rules = DEFAULT_RULES) {
  const R = rules;
  const s1 = day.status1 || '';
  const s2 = day.status2 || '';

  /* BH — a working day: not a public holiday, not Saturday, not Sunday.
     The sheet also counts a blank 曜 cell as not a working day, because the
     column is typed by hand and an empty row is a row off the end of the
     month. That is faithful but fragile: in the September sheet 9/14–9/18
     had no 曜 typed in and quietly dropped out of 所定労働日数. Here the
     weekday comes from the date, so it can only be blank if a caller omits
     it — handled the same way, and never reached from the app. */
  const isWeekday = day.dow != null && !day.holiday && day.dow !== 0 && day.dow !== 6;
  /* BI — away: the times are ignored entirely. */
  const isLeave = LEAVE.includes(s1);
  /* BJ — in on a day that was going to be taken off, so it counts as normal. */
  const isSwapWork = s1 === '振替予定休日出勤';
  /* BK — 1 on a Sunday, 2 otherwise; the two are counted separately. */
  const holidayWork = s1 === '休日出勤' ? (day.dow === 0 ? 1 : 2) : 0;

  const blank = day.inH == null || day.inH === '' || day.outH == null || day.outH === '';
  if (isLeave || blank) {
    return {
      isWeekday, isLeave, isSwapWork, holidayWork, worked: false,
      breakMin: 0, inside: 0, deduct: 0, early: 0,
      otWeekday: 0, otWeekdayNight: 0, otHoliday: 0, otHolidayNight: 0,
    };
  }

  /* BL / BM — and a finish earlier than the start means it ran past midnight.
     The sheet compares the two *hour* boxes to decide, so this does too. */
  const from = Number(day.inH) + Number(day.inM || 0) / 60;
  let to = Number(day.outH) + Number(day.outM || 0) / 60;
  if (Number(day.outH) < Number(day.inH)) to += 24;

  const ws = hhmm(R.workStart);
  const we = hhmm(R.workEnd);
  const b1s = hhmm(R.break1[0]); const b1e = hhmm(R.break1[1]);
  const b2s = hhmm(R.break2[0]); const b2e = hhmm(R.break2[1]);
  const ns = hhmm(R.nightStart); const ne = hhmm(R.nightEnd);
  const es = hhmm(R.earlyStart);

  const am = bandHours(from, to, ws, b1s);      // BN
  const lunch = bandHours(from, to, b1s, b1e);  // BO
  const pm = bandHours(from, to, b1e, we);      // BP
  const tea = bandHours(from, to, b2s, b2e);    // BQ
  const ot = bandHours(from, to, we, ns) - tea; // BR — the evening break is not overtime
  const night = bandHours(from, to, ns, ne);    // BS
  const early = bandHours(from, to, es, ws);    // BT

  /* The 休憩 column on the form is the breaks actually taken, in minutes (M). */
  const breakMin = Math.round((lunch + tea) * 60);

  /* BU — hours inside the contracted day. Only weekdays earn these. */
  const inside = (isWeekday || isSwapWork) ? am + pm : 0;

  /* BV — short of the contracted day, so deducted. A train delay is excused. */
  const shotei = we - ws - (b1e - b1s);         // BH3 — 7.75 by default
  const deduct = inside > 0 && s1 !== '遅刻（電車遅延）'
    ? Math.max(0, shotei - inside) : 0;

  /* BW — left before the end having otherwise made the hours up. */
  const leftEarly = inside > 0 && deduct === 0 && to < we ? we - to : 0;

  /* BY–CB — overtime, split four ways because each is paid at its own rate.
     Saturday is "holiday" for the purposes of the premium only on the days
     listed in 休日割増適用日 (Sunday by default); any other non-working day
     is still counted as weekday overtime. */
  const premiumDay = R.premiumDow.includes(day.dow) && !isSwapWork;
  const normal = isWeekday || isSwapWork;

  const otWeekday = normal ? ot + early
    : (premiumDay ? 0 : am + pm + ot + early);
  const otWeekdayNight = normal ? night : 0;
  const otHoliday = premiumDay ? am + pm + ot + early : 0;
  const otHolidayNight = premiumDay ? night : 0;

  /* AP reads the three printed overtime columns, so the notice has to look at
     the buckets rather than the raw bands — a Saturday's hours land in
     otWeekday with nothing in the evening band at all. */
  const overtimeShown = otWeekday + otWeekdayNight + otHoliday + otHolidayNight;

  return {
    isWeekday, isLeave, isSwapWork, holidayWork, worked: inside > 0 || overtimeShown > 0,
    breakMin, inside, deduct: deduct + leftEarly, early,
    otWeekday, otWeekdayNight, otHoliday, otHolidayNight,
    /* what the day row prints (O / S / W / AA) */
    show: {
      inside, overtime: otWeekday + otHoliday, night: otWeekdayNight + otHolidayNight,
      holiday: otHoliday + otHolidayNight,
    },
    /* 届 (AP) — this day needs a notice, or a prior application */
    notice: noticeFor(s1, s2, deduct + leftEarly, overtimeShown),
  };
}

/* AP — 要 when a status or a deduction needs a 届; 申 when overtime needs to
   have been applied for. 直行 with 直帰 is the one combination that needs
   neither, since it is a whole day out of the office rather than an absence. */
function noticeFor(s1, s2, deduct, overtime) {
  const straightThrough = (s1 === '直行' || s1 === '') && (s2 === '直帰' || s2 === '')
    && (s1 !== '' || s2 !== '');
  if (s1 || s2 || deduct > 0) return straightThrough ? '' : '要';
  return overtime > 0 ? '申' : '';
}

/* ------------------------------ the month -------------------------------- */

/**
 * @param {array} days  one entry per day of the period, in order
 * @returns the eight totals of the 就業時間 box and the day counts beside it
 */
export function computeMonth(days, rules = DEFAULT_RULES) {
  const rows = days.map((d) => ({ ...d, calc: computeDay(d, rules) }));
  const sum = (f) => rows.reduce((t, r) => t + f(r.calc), 0);
  const count = (f) => rows.filter((r) => f(r.calc, r)).length;

  const furikae = count((c, r) => r.status1 === '振替休日');

  return {
    rows,
    /* the 就業時間 box, right-hand column */
    inside: sum((c) => c.inside),                       // 所定時間内時間合計
    deduct: sum((c) => c.deduct),                       // 遅刻・早退
    otWeekday: sum((c) => c.otWeekday),                 // 時間外（平日普通）
    otWeekdayNight: sum((c) => c.otWeekdayNight),       // 時間外（平日深夜）
    otHoliday: sum((c) => c.otHoliday),                 // 時間外（休日普通）
    otHolidayNight: sum((c) => c.otHolidayNight),       // 時間外（休日深夜）
    /* the day counts, left-hand column */
    counts: {
      shotei: count((c) => c.isWeekday) - furikae
        + count((c) => c.isSwapWork),                   // 所定労働日数
      worked: count((c) => c.inside > 0)
        + count((c, r) => r.status1 === '休日出勤'),      // 出勤日数
      paidLeave: count((c, r) => r.status1 === '有給休暇'),
      absent: count((c, r) => r.status1 === '欠勤'),
      special: count((c, r) => r.status1 === '特別休暇'),
      holidaySat: count((c) => c.holidayWork === 2),    // 休日出勤（土・祝祭日）
      holidaySun: count((c) => c.holidayWork === 1),    // 法定休日出勤
      furikae,
    },
  };
}

/* 60 hours of overtime in a month attracts a higher premium than 25%. The
   spreadsheet has the two boxes for it but they are typed in as 0 rather than
   calculated, so nobody would be told. Reported here instead of silently
   dropped; whether payroll acts on it is their call. */
export const OVERTIME_ALERT_HOURS = 60;

export function overtimeAlert(month) {
  const total = month.otWeekday + month.otWeekdayNight
    + month.otHoliday + month.otHolidayNight;
  return total > OVERTIME_ALERT_HOURS ? total - OVERTIME_ALERT_HOURS : 0;
}

/** Whether a figure sits on the 15-minute boundary the sheet insists on. */
export const offUnit = (hours, unitMin) => {
  const mins = Math.round(hours * 60);
  return mins % unitMin !== 0;
};
