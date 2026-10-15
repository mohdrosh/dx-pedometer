/* ============================================================================
   会社情報と就業条件
   The company, its working conditions, and its calendar.

   健康対策委員会:「会社情報や時間・割増は基幹システムにありますが、連携できる
   かまだわかりません。できるようであれば連携したいです。当面は、会社名・条件・
   稼働カレンダーをこちら側で登録できるようにしてください（将来の連携も見据え
   て）。」

   So this is registered here and shaped to be replaced. Everything a company
   decides lives in one object with a stable id; when the core system can be
   read, the same objects arrive from there and nothing above this file has to
   know the difference.

   A list rather than a single company, from the start, because 「会社ごとに
   条件が異なる」 — but with one entry today. Which person belongs to which
   company is not modelled yet: all thirteen are モラブ阪神's own, so a column
   for it would be a guess at a question nobody has asked. When a second
   company appears, that is the piece to add, and it goes on the employee
   record beside 所属.

   Three layers decide what a day is worth, each overriding the one before:

     DEFAULT_RULES   the house rules, in kintai.js, verified against the
                     September sheet somebody actually submitted
     company.rules   what this company has changed about them
     the person      始業 and 終業, which already differ between 新長田 and
                     明海 and so cannot wait for a company to be set up
   ========================================================================= */

import { DEFAULT_RULES } from './kintai.js';

export const DEFAULT_COMPANY = {
  id: 'morabu',
  name: 'モラブ阪神工業株式会社',
  /* Only what differs from DEFAULT_RULES is stored, so a change to the house
     rules reaches every company that has not deliberately overridden it. */
  rules: {},
  /* 稼働カレンダー. The weekdays that are working days, and the dates this
     company is shut on top of the public holidays — new year, 夏季休暇, a
     founding day. Japanese public holidays arrive separately and are not
     repeated here. */
  workDays: [1, 2, 3, 4, 5],
  closures: [],
};

/* What a settings form may set, and the shape each value has to be in.
   Times are 'HH:MM' and may run past midnight — 深夜まで is 29:00, meaning
   five the next morning — so they are not parsed as clock times. */
const TIME = /^([01]?\d|2[0-9]):[0-5]\d$/;
const isTime = (v) => TIME.test(String(v ?? '').trim());
const minutes = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 60 ? n : null;
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalise one company on the way in. Anything unreadable falls back to the
 * default rather than being stored — a half-parsed 始業 would silently change
 * what every timesheet in the company computes.
 */
export function cleanCompany(c) {
  const d = DEFAULT_COMPANY;
  const src = c && typeof c === 'object' ? c : {};
  const r = src.rules && typeof src.rules === 'object' ? src.rules : {};
  const rules = {};

  for (const k of ['workStart', 'workEnd', 'nightStart', 'nightEnd', 'earlyStart']) {
    if (isTime(r[k])) rules[k] = String(r[k]).trim();
  }
  for (const k of ['break1', 'break2']) {
    const pair = Array.isArray(r[k]) ? r[k] : null;
    if (pair && pair.length === 2 && isTime(pair[0]) && isTime(pair[1])) {
      rules[k] = [String(pair[0]).trim(), String(pair[1]).trim()];
    }
  }
  for (const k of ['unitMin', 'deductUnitMin']) {
    const n = minutes(r[k]);
    if (n != null) rules[k] = n;
  }
  if (Array.isArray(r.premiumDow)) {
    const dows = [...new Set(r.premiumDow.map(Number).filter((n) => n >= 0 && n <= 6))].sort();
    rules.premiumDow = dows;
  }

  const workDays = Array.isArray(src.workDays)
    ? [...new Set(src.workDays.map(Number).filter((n) => n >= 0 && n <= 6))].sort()
    : d.workDays;

  const closures = (Array.isArray(src.closures) ? src.closures : [])
    .map((x) => (typeof x === 'string' ? { date: x, name: '' } : x))
    .filter((x) => x && ISO.test(String(x.date || '')))
    .map((x) => ({ date: String(x.date), name: String(x.name || '').trim().slice(0, 40) }))
    .filter((x, i, a) => a.findIndex((y) => y.date === x.date) === i)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 200);

  return {
    id: String(src.id || d.id).trim().slice(0, 40) || d.id,
    name: String(src.name ?? d.name).trim().slice(0, 80),
    rules,
    workDays,
    closures,
  };
}

/** The companies a settings object holds — always at least one. */
export const companiesOf = (cfg) => {
  const list = Array.isArray(cfg?.companies) ? cfg.companies : [];
  return list.length ? list.map(cleanCompany) : [cleanCompany(DEFAULT_COMPANY)];
};

/** The one a person belongs to. One company today, so it is the first. */
export const companyFor = (cfg, _person) => companiesOf(cfg)[0];

/**
 * The rules that decide a person's day: the house rules, what their company
 * changed, then their own 始業・終業.
 */
export function rulesForPerson(cfg, person) {
  const base = { ...DEFAULT_RULES, ...companyFor(cfg, person).rules };
  return person?.workStart && person?.workEnd
    ? { ...base, workStart: person.workStart, workEnd: person.workEnd }
    : base;
}

/**
 * The company's own closures as the timesheet wants them — the same shape the
 * public-holiday feed arrives in, so the two merge and a day shut for either
 * reason is shut.
 */
export function closureMap(cfg, person) {
  const out = {};
  for (const c of companyFor(cfg, person).closures) out[c.date] = c.name || '休業日';
  return out;
}
