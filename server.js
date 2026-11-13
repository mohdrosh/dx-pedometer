/* ============================================================================
   API server + scheduled jobs + static site.

     npm start        (production: serves dist/ as well)
     npm run server   (development: API only, Vite serves the frontend)

   Responsibilities:
     1. The key/value HTTP API the browser app reads and writes, backed by
        PostgreSQL (see src/db.js).
     2. On the 26th of each month, email everyone who has not submitted.
     3. On the 2nd, submit for consented participants who still have not,
        recording blank days as 0.

   Jobs run at 09:00 Asia/Tokyo and record the date they ran, so restarting
   the process never sends twice.
========================================================================== */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/* Load .env.local when developing. On a host like Render there is no such
   file — the environment variables come from the dashboard instead. */
if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else if (fs.existsSync('.env')) dotenv.config();

const nodemailer = (await import('nodemailer')).default;
import { reminderMail, summaryMail, reminderRecipients, companyEmail } from './src/mail.js';
import { PUBLIC_HOLIDAYS } from './src/holidays.js';
import { buildTimesheet, timesheetFilename } from './src/kintai-xlsx.js';
import { noticesFor, buildTodoke, todokeFilename } from './src/todoke.js';
import { buildKoutsuuhi, koutsuuhiFilename } from './src/koutsuuhi.js';
import { sheetCount, unverified } from './src/koutsuuhi-calc.js';
import * as fare from './src/fare.js';
import { matches as fareTableMatches } from './src/fare-table.js';
import { DEFAULT_CFG, ROSTER_SEED, orderRegions } from './src/defaults.js';
import { inSubmissionWindow } from './src/submission-window.js';
import { rulesForPerson, closureMap } from './src/company.js';
import { xlsxToPdf, pdfReady } from './src/topdf.js';
import { buildSheet } from './src/egg-sheet.js';
import {
  cleanVote, eggOpen, eggWindow, eggOffices, tally, EGG_RULES, EGG_NAMES,
  cleanRequest, eggMaxPacks, eggTerms, consentOk, requestTotals,
  EGG_PURPOSES, EGG_OFFICES, HQ_OFFICE, TOKYO_OFFICE,
} from './src/egg.js';
import {
  mondayOf, openShipMonday, requestDeadline, requestsOpen, pickupDeadline,
  weekInfo, shiftDay, statusOf, dueShip, weekPlan, harvestWindow,
} from './src/egg-week.js';
import { allot } from './src/egg-allot.js';
import { requesterMail, adminMail } from './src/egg-mail.js';
import {
  REACTIONS, PHOTOS_MAX, PHOTO_BYTES, PHOTO_EDGE, THUMB_EDGE,
  cleanPost, cleanComment, cleanReaction, photoOk, badgeFor, topDish, postCounts,
} from './src/dish.js';

if (!process.env.DATABASE_URL) {
  console.error('\n  DATABASE_URL is not set.');
  console.error('  Open .env.local and paste your Supabase connection string into it.\n');
  process.exit(1);
}

/* Imported after the check above, so the error message is the useful one. */
const {
  initSchema, getKey, setKey, delKey, listKeys, registerTrial, addFeedback, listFeedback,
  createSession, getSession, deleteSession, purgeSessions,
  getEmployee, updateEmployeeSelf, setConsent,
  addUpload, listUploads, getUpload, deleteUpload, uploadBytes,
  eggVote, eggMyVote, eggRows, eggAudience,
  eggOfficeRows, eggOfficeSave, eggOfficeDelete, eggContactFor,
  eggHarvest, eggHarvestBump, eggHarvestSet,
  eggRequestSave, eggRequestDrop, eggMyRequest, eggMyRequests,
  eggWeekRequests, eggMissed, eggWeek, eggDrawSave, eggWeekOffices, eggWeekFinalise,
  eggWeekUndo,
  eggArrived, eggPickup, eggConsent, eggConsentSave, eggRequestById,
  eggSignup, eggSignupSave, eggSignups, eggPoints, eggPointsSave,
  dishFeed, dishPost, dishCreate, dishEdit, dishDelete, dishHide,
  dishPhotoAdd, dishPhotoThumb, dishPhoto, dishPhotoCount,
  dishReact, dishComments, dishCommentAdd, dishCommentDelete, dishCommentHide,
  dishStats,
} = await import('./src/db.js');

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(DIR, 'dist');
const PORT = process.env.PORT || 8787;
const APP_URL = process.env.APP_URL || '';
const MAIL_FROM = process.env.MAIL_FROM || 'kenkou@morabu.com';
/* 佐野, 11/05:「モラエッグのメールは admin_egg@morabu.com から送ってくださ
   い。メールの設定は万歩計と同じで、送信元だけ変えてください」.

   One mail server, one login, two senders: the pedometer's reminders go
   on coming from 健康対策委員会's address, and only モラエッグ's three
   letters carry this one. A single setting for the whole site would have
   quietly re-signed the monthly pedometer reminder as well, which is not
   what she asked for and not something anybody would notice until a
   confused reply arrived.

   Settable, because whether a mail server will let this login send under
   another address is a question for IT and not for me: if it refuses,
   unsetting EGG_MAIL_FROM puts everything back on the address that
   already works. */
const EGG_MAIL_FROM = process.env.EGG_MAIL_FROM || 'admin_egg@morabu.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
/* 不具合の報告 goes here. Separate from ADMIN_EMAIL because that address
   also receives the Monday summary and the job notices, and whoever
   fixes the site is not always whoever reads those. A comma-separated
   list is fine. Unset, the reports go to ADMIN_EMAIL. */
const REPORT_EMAIL = process.env.REPORT_EMAIL || process.env.ADMIN_EMAIL || '';
const DRY_RUN = process.env.MAIL_DRY_RUN === '1' || !process.env.SMTP_HOST;
const SERVE_STATIC = fs.existsSync(DIST);
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);
const COOKIE = 'dxsid';

/* ------------------------------- mail ----------------------------------- */
const smtp = (user, pass) => ({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === '1',
  auth: user ? { user, pass } : undefined,
});

const mailer = DRY_RUN ? null
  : nodemailer.createTransport(smtp(process.env.SMTP_USER, process.env.SMTP_PASS));

/**
 * モラエッグ's own connection, when it has been given one.
 *
 * The mail host is shared hosting, where the SMTP username IS the
 * mailbox: signing in as kenkou@morabu.com and then putting another
 * address in the From is the thing such servers refuse outright. So
 * 「送信元だけ変えてください」 needs more than a From — it needs モラエッグ to
 * sign in as itself.
 *
 * Set EGG_SMTP_USER and EGG_SMTP_PASS and that is what happens. Leave
 * them unset and モラエッグ shares the pedometer's connection, which is
 * the right answer on a server that does allow sending under another
 * address, and the right answer while nobody has made the mailbox yet.
 */
const eggMailer = DRY_RUN || !process.env.EGG_SMTP_USER ? null
  : nodemailer.createTransport(smtp(process.env.EGG_SMTP_USER, process.env.EGG_SMTP_PASS));

async function send(to, subject, text, from = MAIL_FROM) {
  if (!to) return false;
  if (DRY_RUN) { console.log(`[DRY RUN] would send to ${to} from ${from} — ${subject}`); return true; }
  /* Its own connection for モラエッグ's letters when there is one; the
     shared one otherwise. */
  const via = from === EGG_MAIL_FROM && eggMailer ? eggMailer : mailer;
  await via.sendMail({ from, to, subject, text });
  return true;
}

/**
 * サブ・メールアドレス, as it should be stored.
 *
 * Returns the address, '' for none, or false when it is not an address
 * at all. The same address as the main one is stored as none: it is
 * optional, it exists to reach somebody somewhere else, and a browser
 * that autofills the work address into it would otherwise have every
 * letter sent to the same inbox twice.
 */
function subMail(raw, mainMail) {
  const v = String(raw || '').trim().slice(0, 120);
  if (!v) return '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return false;
  const main = String(mainMail || '').split(/[;\n,]/)[0].trim();
  return main && v.toLowerCase() === main.toLowerCase() ? '' : v;
}

/* ------------------------------ sessions --------------------------------- */
/* Identity comes from this cookie and nothing else. The browser never sends
   its own employee number to say who it is — an earlier version trusted the
   client for that, which meant the API answered to anybody. */

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const cookieAt = (sid, maxAgeSec, path) => [
  `${COOKIE}=${sid}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax',
  `Max-Age=${maxAgeSec}`, ...(process.env.COOKIE_INSECURE === '1' ? [] : ['Secure']),
].join('; ');

/* The session cookie is set at the root and nowhere else, so one header
   signs somebody in.

   Signing out takes more than one. A cookie whose Set-Cookie carried no
   Path at all — which is what an earlier build sent — is stored by the
   browser against the directory of the request that set it, so a sign-in
   through /pedometer/api/login left one at /pedometer. The browser then
   sends BOTH on every call, more specific path first, and the server
   reads the first it is given. Clearing Path=/ leaves the other one
   standing: the screen signs out, the next load finds the stale cookie
   and signs straight back in, and the only way out is clearing the site
   data by hand. 2026/11/13, ロシャン.

   A delete has to match the path it was stored under, and the server
   cannot see /pedometer — nginx strips it before the request arrives.
   So the sign-out clears every path the app has ever been served from.
   COOKIE_PATHS overrides the list where the prefix is something else;
   clearing a path that holds nothing is a header the browser ignores. */
const SIGNOUT_PATHS = [...new Set([
  '/',
  ...String(process.env.COOKIE_PATHS || '/pedometer,/pedometer/api,/egg')
    .split(',').map((x) => x.trim()).filter(Boolean),
])];

const cookieHeader = (sid, maxAgeSec) => (maxAgeSec > 0
  ? cookieAt(sid, maxAgeSec, '/')
  : SIGNOUT_PATHS.map((path) => cookieAt('', 0, path)));

/* Fixed-window counters, held in memory. Enough to stop an employee number
   being guessed by brute force; a restart clears them. */
const hits = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now > h.until) { hits.set(key, { n: 1, until: now + windowMs }); return false; }
  h.n += 1;
  return h.n > max;
}
/* A fare lookup fails in ways the person on the screen can act on — a
   station nobody recognises is theirs to fix, a key the plan does not cover
   is not — so the reason is passed back as a code. Still a code and nothing
   else: no provider message, no URL, no key. */
function fareError(res, err) {
  const known = {
    unknown_station: 404, two_stations: 400, no_key: 503,
    bad_key: 503, timeout: 504, unreachable: 502,
  };
  const code = known[err.code] ? err.code : 'lookup_failed';
  if (!known[err.code] || err.code === 'bad_key') {
    console.error('fare lookup failed', err.code || err.message, err.status || '');
  }
  return sendJson(res, known[code] || 502, { error: code });
}

const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';

/* Which key may this session touch? Entry keys are st:<period>:<employee>, so
   the owner is read from the key itself rather than from anything the caller
   claims. */
function mayTouchKey(sess, key, write) {
  if (!sess) return false;
  if (sess.isAdmin) return true;
  /* st: steps, kt: timesheet, tr: travel — each is one person's own month,
     and the id in the key has to be theirs. */
  const m = /^(?:st|kt|tr):([^:]+):(.+)$/.exec(key);
  if (m) return String(m[2]) === String(sess.employeeId);
  if (key === 'cfg') return !write;
  /* 運賃表 — the committee's, and only the committee's. Built from the
     expense forms people have handed in, it is a list of the journeys
     colleagues make to work: no names on it, but 新長田 to 三ノ宮 says
     where somebody lives clearly enough in a company this size. Handing
     the whole table to every browser to save a request is not worth that,
     so a participant asks about one pair of stations at a time through
     /api/fare/table and is told about those. */
  if (key === 'fares') return false;
  return false;
}

/* adminIds decides who is an administrator, so it never leaves the server for
   a participant — and a participant could not write it back in any case. */
const publicCfg = (cfg) => {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const { adminIds, ...rest } = cfg;
  return rest;
};

/* ---------------------------- period helpers ---------------------------- */
const pad = (n) => String(n).padStart(2, '0');
const periodKey = (y, m) => String(y % 100).padStart(2, '0') + pad(m);
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function periodDays(y, m) {
  const out = [];
  const end = new Date(y, m - 1, 20);
  const cur = new Date(y, m - 2, 21);
  while (cur <= end) { out.push(isoOf(cur)); cur.setDate(cur.getDate() + 1); }
  return out;
}

/* A record marked submitted with days still blank locks its owner out of a
   period they have not finished — the calendar stops opening and only an
   administrator can reopen it. The client disables the button, but the
   client is not a guard, so refuse it here too. Administrators are exempt:
   auto-submission fills the blanks with 0 before it sets the flag, and the
   committee's own tooling has to be able to correct a record. */
function submittedTooEarly(key, value) {
  if (!value || value.submitted !== true) return false;
  const m = /^st:(\d{2})(\d{2}):/.exec(key);
  if (!m) return false;
  const steps = value.steps || {};
  return periodDays(2000 + Number(m[1]), Number(m[2]))
    .some((iso) => steps[iso] == null || steps[iso] === '');
}

/* 健康対策委員会 asked whether 提出期間の制限 means the target month only.
   It does: a period's window opens on the 21st, once the period has ended,
   and closes on the 1st of the month after — so exactly one month is open at
   a time, and a month either side of it is shut. The screen already disables
   the button; this is the same rule where it cannot be stepped around, since
   the screen is not a guard.

   Only submission is held to the window. Entering and correcting steps for
   any month stays open, which is what makes a late correction possible at
   all. */
function submittedOutsideWindow(key, value, cfg) {
  if (!cfg?.enforceWindow) return false;
  if (!value || value.submitted !== true) return false;
  const m = /^st:(\d{2})(\d{2}):/.exec(key);
  if (!m) return false;
  return !inSubmissionWindow(2000 + Number(m[1]), Number(m[2]), tokyoNow().stamp);
}

function tokyoNow() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, stamp: `${p.year}-${p.month}-${p.day}` };
}

const roster = async () => (await getKey('roster')) || [];

/* ------------------------------- jobs ----------------------------------- */
async function sendReminders(y, m) {
  const people = (await roster()).filter((p) => p.active !== false);
  const sent = [];
  for (const p of people) {
    const e = await getKey(`st:${periodKey(y, m)}:${p.id}`);
    if (e && e.submitted) continue;
    const to = reminderRecipients(p);
    if (!to.length) { console.warn(`no address for ${p.id} ${p.name}`); continue; }
    const { subject, body } = reminderMail({ name: p.name, y, m, consent: !!p.consent, url: APP_URL });
    try { await send(to.join(', '), subject, body); sent.push(p); }
    catch (err) { console.error(`send failed ${p.id}`, err.message); }
  }
  if (ADMIN_EMAIL) {
    const s = summaryMail({ y, m, reminded: sent, kind: 'reminder' });
    await send(ADMIN_EMAIL, s.subject, s.body).catch(() => {});
  }
  console.log(`reminders: ${sent.length} sent for ${y}/${m}`);
  return sent;
}

async function autoSubmit(y, m) {
  const days = periodDays(y, m);
  const done = [];
  for (const p of (await roster()).filter((x) => x.active !== false && x.consent)) {
    const key = `st:${periodKey(y, m)}:${p.id}`;
    const e = (await getKey(key)) || { steps: {} };
    if (e.submitted) continue;
    const steps = { ...(e.steps || {}) };
    days.forEach((iso) => { if (steps[iso] == null || steps[iso] === '') steps[iso] = 0; });
    await setKey(key, { ...e, steps, submitted: true, auto: true, submittedAt: Date.now() });
    done.push(p);
  }
  if (ADMIN_EMAIL) {
    const s = summaryMail({ y, m, autoSubmitted: done, kind: 'auto' });
    await send(ADMIN_EMAIL, s.subject, s.body).catch(() => {});
  }
  console.log(`auto-submit: ${done.length} records for ${y}/${m}`);
  return done;
}

/* ----------------------- モラエッグ：配分の確定 -------------------------- */

/* The stored settings, with egg merged a level deeper than the rest: the
   spread is shallow, so a stored cfg carrying any egg setting at all would
   otherwise drop every default in it — including firstShip, whose whole
   job is to be right without anybody setting it. */
async function eggCfg() {
  const stored = (await getKey('cfg')) || {};
  const cfg = {
    ...DEFAULT_CFG, ...stored,
    egg: { ...DEFAULT_CFG.egg, ...(stored.egg || {}) },
  };
  return { cfg, holidays: { ...PUBLIC_HOLIDAYS, ...closureMap(cfg, null) } };
}

/**
 * Decide one shipping week by 配布ルール 5–9 and write the answer down.
 *
 * The administrator's button and the Monday deadline both call this, so
 * pressing it early shows exactly what the clock would have done — the
 * committee can never be surprised by the automatic run, because they
 * have already seen it.
 *
 * Re-running a week is allowed up to the moment somebody collects a pack.
 * After that the answer is out in the world: a second draw would take a
 * pack off a person who already has it in their hands.
 */
async function runAllot(ship, { packs = null, by = null, dry = false } = {}) {
  const { cfg } = await eggCfg();
  const already = await eggWeekRequests(ship);
  if (!dry && already.some((r) => r.pickedUpAt)) return { error: 'already_collected' };

  /* 仕様書 4.2: deadline to deadline, which is not Monday to Monday in a
     week whose Monday is a holiday. */
  const span = harvestWindow(ship, cfg, { ...PUBLIC_HOLIDAYS, ...closureMap(cfg, null) });
  const harvested = (await eggHarvest(span.from, span.to))
    .reduce((a, d) => a + d.packs, 0);
  /* The points this week is decided on are the ones it was first decided
     on: a re-run reads the snapshot rather than the live table, which its
     own earlier run has already rewritten. */
  const week = await eggWeek(ship);
  const points = week?.pointsBefore || await eggPoints();

  /* What ships is what the shed confirmed, and only then what the
     register adds up to. A dry read of a week already decided must use
     the confirmed number or it would quietly report a different week
     from the one people were told about. */
  const harvest = Number.isInteger(packs) && packs >= 0 ? packs
    : (dry && Number.isInteger(week?.packs) ? week.packs : harvested);

  const rows = await eggOfficeRows(true);
  const open = rows.map((o) => o.name);
  const out = allot({
    requests: already.map((r) => ({
      id: r.id, employeeId: r.employeeId, office: r.office,
      packs: r.packs, purpose: r.purpose, hqOk: r.hqOk,
    })),
    harvest,
    minPacks: cfg.egg?.minPacks,
    points,
    seed: ship,
    /* An office's own 最低パック数 beats the company's, which is how 本社
       ships whatever it has:「0なら毎週発送」. */
    officeMin: Object.fromEntries(rows.map((o) => [o.name, o.minPacks])),
    ...(open.length ? { offices: open } : {}),
  });

  /* allot drops any row asking for nothing, so every request is written
     back from this map and not from its result rows — otherwise somebody
     it filtered out would sit at 受付済 for a week already decided. */
  const byId = new Map(out.rows.map((r) => [r.id, r]));
  const full = already.map((r) => {
    const x = byId.get(r.id);
    return { id: r.id, office: r.office, got: x?.got ?? 0, at: x?.at ?? r.office };
  });

  if (!dry) {
    await eggDrawSave(
      ship,
      { packs: harvest, rule: 'company', seed: ship, by, extra: out.extra },
      full,
      { lines: out.lines, points: out.points, pointsBefore: points },
    );
  }

  return {
    ship,
    rule: 'company',
    packs: harvest,
    harvested,
    /* 配布ルール 10: drawn is the system's answer, final is a person's.
       Both are read from the row rather than assumed, because a dry read
       of an old week has to report that week's state and not this
       call's. */
    drawn: dry ? !!week?.drawnAt : true,
    final: !!week?.finalAt,
    minPacks: out.minPacks,
    extra: out.extra,
    shipped: out.shipped,
    lines: out.lines,
    /* 「配分の結果、成立していた事業所が3パックを下回った場合」ほか: a week
       that wants a person to look at it says so rather than waiting to be
       noticed. */
    needsAdmin: out.needsAdmin,
    moved: out.rows.filter((r) => r.moved && r.got > 0).length,
    /* 「受け取る人の一覧」 — names, because this is the list an
       administrator checks against the boxes, and it only exists after
       the week is decided. */
    list: out.rows.filter((r) => r.got > 0).map((r) => ({
      name: already.find((a) => a.id === r.id)?.name || r.employeeId,
      office: r.at,
      moved: !!r.moved,
      purpose: r.purpose,
      got: r.got,
    })).sort((a, b) => a.office.localeCompare(b.office, 'ja') || a.name.localeCompare(b.name, 'ja')),
    missed: out.rows.filter((r) => r.purpose !== 'work' && r.got <= 0).length,
    offices: await eggWeekOffices(ship),
  };
}

/* 仕様書 5「締切後に配分を確定する」. Nobody has to be at a desk on Monday
   morning for the week to be decided — and because the committee can run
   the same thing early from 管理, what this does at the deadline is what
   they have already seen.

   The week it closes is found from the deadline rather than from the
   clock's own idea of which week is open: openShipMonday has already
   rolled on to the next one by the time this runs, which is the point of
   it. Three candidates, because a public holiday moves a deadline by a
   day in either direction. */
async function eggTick(now) {
  const { cfg, holidays } = await eggCfg();
  const ship = dueShip(now.stamp, now.h, cfg, holidays, cfg.egg?.firstShip || null);
  if (!ship) return;

  /* 配布ルール 10（2026/11/05）: the week is no longer the clock's to
     decide. 「丹波担当が、その時点で発送できるパック数を入力して確定する」 —
     what can actually ship is not always what was laid, and only the
     person holding the trays knows which.

     So this is a safety net and not the mechanism. If nobody has
     confirmed by the hour the rules give for 最終確定, the week is
     allocated on the recorded harvest so that people have an answer to
     look at — and it stops there, at 確認中. It never marks a week final
     and never sends a letter: those say a person has checked, and no
     person has. */
  const by = Number(cfg.egg?.finalHour ?? 12);
  if (now.h < by) return;
  if ((await getKey('job:egg')) === ship) return;
  const week = await eggWeek(ship);
  if (week?.drawnAt) return;          /* the shed got there first */

  /* Written before the run, not after: a run that throws half way must not
     be started again by the next tick fifteen minutes later, when a person
     needs to look at why it failed. */
  await setKey('job:egg', ship);
  const out = await runAllot(ship, { by: null });
  console.log(out.error
    ? `  egg: ${ship} not allocated — ${out.error}`
    : `  egg: ${ship} allocated on the recorded harvest — ${out.shipped}/${out.packs} packs, waiting for 最終確定`);
}

/** The week as it stands, without changing anything. */
const weekResult = (ship) => runAllot(ship, { dry: true });

/**
 * The letters that go out at 最終確定 (仕様書 4.11).
 *
 * Every address is looked up here rather than passed in, so nothing a
 * browser sent can decide who gets mail. Each send is caught on its own:
 * one bad address among 171 must not stop the other 170, and the week is
 * already confirmed by the time this runs — there is nothing to roll
 * back and nobody for an exception to help.
 */
async function eggMail(ship, cfg, holidays) {
  const week = await weekResult(ship);
  if (week?.error) return { sent: 0, failed: 0, error: week.error };
  const rows = await eggWeekRequests(ship);
  const offices = await eggOfficeRows(false);
  /* With the offices, so 東京's letter carries 東京's arrival. */
  const info = weekInfo(ship, cfg, holidays, offices);

  let sent = 0;
  let failed = 0;
  /* Every letter in this function is モラエッグ's, so every one of them
     goes out under モラエッグ's address. */
  const post = async (to, m) => {
    if (!to) return;
    try { await send(to, m.subject, m.body, EGG_MAIL_FROM); sent += 1; } catch { failed += 1; }
  };

  /* 「リクエストした人へのメールは会社のアドレスに送り、プライベートの
     アドレスを登録している人にはそちらにも送る」. The work address comes
     from the employee record and the personal one from 参加登録 — never
     from the request, which is a browser's word for it. */
  for (const r of rows) {
    const person = await getEmployee(r.employeeId);
    const reg = await eggSignup(r.employeeId);
    /* The office they collect from, which for somebody moved to 本社 is
       not the one they asked at — and its address, so the letter says
       where to walk to and not only the name of a building. */
    const at = r.atOffice || r.office;
    const m = requesterMail({
      name: person?.name || '',
      got: r.got || 0,
      missed: !(r.got > 0),
      office: at,
      address: offices.find((x) => x.name === at)?.address || '',
      arrive: info.arriveBy?.[at] || info.arrive,
      pickup: info.pickup,
    });
    await post(companyEmail(person?.email), m);
    if (reg?.notifyPriv && reg?.privateMail) await post(reg.privateMail, m);
  }

  /* The letter to each office's 連絡担当者 used to go here. 佐野,
     2026/11/06:「連絡担当者へのメールも不要です」— there is no longer a
     person at the other end of it, so it is not sent and the paper that
     replaced it goes in the box instead (/api/egg/list.pdf). */

  /* 「管理者向けのメールは会社のアドレスのみに送る。送り先は追って連絡する」
     — so it goes to ADMIN_EMAIL for now, which is where every other
     administrative mail in this app already goes, and the moment she
     names the real recipients it is one environment variable. */
  if (ADMIN_EMAIL) {
    await post(ADMIN_EMAIL, adminMail({
      ship,
      harvest: week.packs,
      shipped: week.shipped,
      extra: week.extra,
      missed: week.missed,
      lines: week.lines,
    }));
  }
  return { sent, failed };
}

async function tick() {
  const now = tokyoNow();
  await eggTick(now).catch(console.error);
  if (now.h !== 9) return;
  if (now.d === 26 && (await getKey('job:reminder')) !== now.stamp) {
    await setKey('job:reminder', now.stamp);
    await sendReminders(now.y, now.m);
  }
  if (now.d === 2 && (await getKey('job:auto')) !== now.stamp) {
    await setKey('job:auto', now.stamp);
    const m = now.m === 1 ? 12 : now.m - 1;
    const y = now.m === 1 ? now.y - 1 : now.y;
    await autoSubmit(y, m);
  }
}

/* ------------------------------- http ----------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webp': 'image/webp', '.pdf': 'application/pdf',
};

/* The API is same-origin: the server hosts dist/ as well. A wildcard CORS
   header used to let any website on the internet read this API from a signed-in
   employee's browser, so it is gone. */
function sendJson(res, code, body, cookie) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (cookie) h['Set-Cookie'] = cookie;
  res.writeHead(code, h);
  res.end(JSON.stringify(body));
}
const deny = (res, code = 401) => sendJson(res, code, { error: code === 403 ? 'forbidden' : 'unauthorized' });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 6e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/* ------------------------------ 添付ファイル ----------------------------- */
/* 遅延証明書 and whatever follows it. The first thing here that takes a file,
   so the limits are stated rather than assumed.

   What a train company hands out is a photograph or a small PDF; 4MB is
   generous for both and small enough that holding one in memory to write it
   is not a way to take the server down. The types are listed rather than
   sniffed from the name — an .pdf that is actually something else is still
   whatever it actually is, and the browser is told exactly what it is
   getting when it comes back out. */
const UPLOAD_MAX = 4 * 1024 * 1024;
const UPLOAD_TOTAL = 40 * 1024 * 1024;      // per person, all months
const UPLOAD_TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic',
  'image/webp': 'webp', 'application/pdf': 'pdf',
};

/* Send a generated document, as the workbook or as a PDF of it.
   健康対策委員会 asked for 「今のExcelの形式で…PDF等でダウンロード」, so the
   PDF is their own form converted, not a second layout that would drift away
   from the first one the week after it was written.

   A machine that cannot convert says so and sends nothing: a 0-byte file, or
   a page of boxes where the Japanese should be, is worse than being told the
   server is not set up for it. */
async function sendDoc(res, buf, name, wantPdf) {
  if (!wantPdf) {
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      /* The filename is Japanese, so it goes in the RFC 5987 form; the
         plain one beside it is for anything that cannot read that. */
      'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7E]/g, '') || 'download.xlsx'}"; `
        + `filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    });
    return res.end(Buffer.from(buf));
  }
  let pdf;
  try {
    pdf = await xlsxToPdf(Buffer.from(buf));
  } catch (err) {
    if (err.code === 'pdf_unavailable') return sendJson(res, 503, { error: 'pdf_unavailable', why: err.why });
    console.error('pdf convert failed', err.message);
    return sendJson(res, 500, { error: 'pdf_failed' });
  }
  const pname = name.replace(/\.xlsx$/i, '.pdf');
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': pdf.length,
    'Content-Disposition': `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(pname)}`,
    'Cache-Control': 'no-store',
  });
  return res.end(pdf);
}

/** A filename a latin-1 header can carry. Quotes and backslashes would end
 *  the field early, so they go; anything outside printable ASCII is dropped
 *  rather than transliterated, and if that leaves nothing the extension
 *  alone is more use than an empty name. */
function asciiName(name, mime) {
  const kept = String(name).replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '').trim();
  return kept || `attachment.${UPLOAD_TYPES[mime] || 'bin'}`;
}

/** The raw body, capped. Resolves null if it runs past the cap.
 *
 *  It stops keeping the bytes but goes on reading them. Destroying the
 *  socket instead is quicker and leaves the person looking at a network
 *  error rather than at "that file is too big" — the reset arrives before
 *  the response does. Draining costs one upload's bandwidth and is the
 *  difference between a message and a mystery.
 *
 *  Content-Length is checked before any of this, so an oversized file is
 *  normally refused without a byte being read; this is the guard for a
 *  header that lies. */
function readBytes(req, cap) {
  return new Promise((resolve) => {
    const chunks = []; let n = 0; let over = false;
    req.on('data', (c) => {
      n += c.length;
      if (n > cap) { over = true; chunks.length = 0; return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(over ? null : Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });
}

function serveStatic(req, res, pathname) {
  let file = path.join(DIST, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const ext = path.extname(file);
  /* A year, and never ask again — but only for the files whose name
     carries a hash of their contents, which is what Vite writes into
     /assets. Everything else under dist is a name somebody chose:
     佐野's artwork, the printables PDF, the logos. Those get new
     contents under the same name, and 2026/11/12 is what that costs —
     a new label shipped, and every browser that had seen the old one
     went on showing it, because it had been told the file would never
     change. They revalidate now: a 304 when nothing moved, the new
     bytes when something did. */
  const hashed = pathname.startsWith('/assets/');
  const cache = ext === '.html' || !hashed
    ? 'no-cache'
    : 'public, max-age=31536000, immutable';
  const stamp = fs.statSync(file).mtime.toUTCString();
  const head = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cache,
    'Last-Modified': stamp,
  };
  if (req.headers['if-modified-since'] === stamp) { res.writeHead(304, head); return res.end(); }
  res.writeHead(200, head);
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return sendJson(res, 204, {});
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ip = clientIp(req);

    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true });

    /* ---------------------- public: getting signed in -------------------- */

    /* Everything the sign-in screen needs, and nothing more. */
    if (url.pathname === '/api/bootstrap' && req.method === 'GET') {
      return sendJson(res, 200, { cfg: publicCfg(await getKey('cfg')) });
    }

    if (url.pathname === '/api/login' && req.method === 'POST') {
      if (rateLimited(`login:${ip}`, 10, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const b = await readBody(req).catch(() => null);
      const id = String(b?.id || '').trim();
      if (!id) return sendJson(res, 400, { error: 'id_required' });

      const cfg = (await getKey('cfg')) || {};
      const admins = (cfg.adminIds || []).map((a) => String(a).toLowerCase());
      const isAdmin = admins.includes(id.toLowerCase());
      const person = isAdmin ? null : await getEmployee(id);
      if (!isAdmin && !person) return sendJson(res, 401, { error: 'not_found' });

      const sid = crypto.randomBytes(32).toString('hex');
      await createSession(sid, isAdmin ? null : person.id, isAdmin, SESSION_DAYS);
      const user = isAdmin
        ? { admin: true, id, name: '健康対策委員会' }
        : { admin: false, ...(await getEmployee(person.id)) };
      return sendJson(res, 200, { user }, cookieHeader(sid, SESSION_DAYS * 86400));
    }

    /* --------------------- everything below needs a session -------------- */
    const sess = await getSession(readCookie(req, COOKIE));

    if (url.pathname === '/api/logout' && req.method === 'POST') {
      await deleteSession(sess?.sid);
      return sendJson(res, 200, { ok: true }, cookieHeader('', 0));
    }

    /* Trial self-registration, open to anyone with the link. */
    if (url.pathname === '/api/register' && req.method === 'POST') {
      if (rateLimited(`reg:${ip}`, 5, 3600_000)) return sendJson(res, 429, { error: 'too_many' });
      const b = await readBody(req).catch(() => null);
      if (!b || !b.id || !b.name) return sendJson(res, 400, { error: 'id_and_name_required' });
      const r = await registerTrial(b);
      if (r.error === 'exists') return sendJson(res, 409, r);
      if (r.error) return sendJson(res, 400, r);
      return sendJson(res, 200, r);
    }

    /* Who am I? Restores a session when the page is reloaded. */
    if (url.pathname === '/api/me') {
      if (!sess) return deny(res);
      if (req.method === 'GET') {
        const user = sess.isAdmin
          ? { admin: true, id: 'admin', name: '健康対策委員会' }
          : { admin: false, ...(await getEmployee(sess.employeeId)) };
        /* Whether the fare lookup is available at all, so the screen can
           offer it or keep quiet rather than show a button that 503s. */
        const table = (await getKey('fares')) || [];
        return sendJson(res, 200, {
          user,
          /* …and whether this machine can turn a workbook into a PDF, so
             the screen offers the button only where it would work. */
          features: { fare: fare.hasProvider(), fareTable: table.length, pdf: (await pdfReady()).ok },
        });
      }
      /* A participant edits their own row only — no path here writes anyone
         else's, and name and employee number are not editable at all. */
      if (req.method === 'PUT') {
        if (sess.isAdmin) return deny(res, 403);
        const b = await readBody(req).catch(() => null);
        if (!b) return sendJson(res, 400, { error: 'body_required' });
        const updated = await updateEmployeeSelf(sess.employeeId, b);
        if (!updated) return deny(res, 403);
        return sendJson(res, 200, { user: { admin: false, ...updated } });
      }
    }

    /* The consent screen. A participant answers for themselves and for
       nothing else: the session says who they are, and the body carries one
       boolean. Kept off /api/me because that route writes the whole profile,
       and this screen is shown before anyone has seen their profile. */
    if (url.pathname === '/api/consent' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      const b = await readBody(req).catch(() => null);
      if (!b || typeof b.agree !== 'boolean') return sendJson(res, 400, { error: 'agree_required' });
      const updated = await setConsent(sess.employeeId, b.agree);
      if (!updated) return deny(res, 403);
      return sendJson(res, 200, { user: { admin: false, ...updated } });
    }

    /* ------------------------- モラエッグ Phase 0 -----------------------
       需要調査. Two questions, answered once by each person, counted for
       everybody and attributable to nobody.

       The anonymity is not a promise made in the interface — it is made
       here, by what these routes can return. The only read that touches
       other people's answers is a tally, and the only read that touches one
       person's answer takes the id from the session. There is deliberately
       no route that lists the votes, and none that an administrator can
       call to see more than anybody else: 佐野 wrote 「管理者を含め」 and
       an admin screen that quietly saw the rows would break it while
       looking like it worked.
       ------------------------------------------------------------------ */
    if (url.pathname === '/api/egg/survey' && req.method === 'GET') {
      if (!sess) return deny(res);
      const cfg = { ...DEFAULT_CFG, ...((await getKey('cfg')) || {}) };
      const person = sess.isAdmin ? null : await getEmployee(sess.employeeId);
      /* An administrator may look at the results and set the window, but is
         not a 正社員 answering a survey, so has no answer of their own. */
      const mine = sess.isAdmin ? null : await eggMyVote(sess.employeeId);
      return sendJson(res, 200, {
        open: eggOpen(cfg, tokyoNow().stamp),
        window: eggWindow(cfg),
        offices: eggOffices(cfg),
        rules: EGG_RULES,
        names: EGG_NAMES,
        mine,
        audience: await eggAudience(),
        results: tally(await eggRows(), eggOffices(cfg)),
        /* 4.1:「全社員が閲覧可能とし、盛り上げに使う」 — the results are open
           to everyone who can reach the portal, not held back for admins. */
        canAnswer: !!person?.egg,
      });
    }

    if (url.pathname === '/api/egg/survey' && req.method === 'PUT') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });

      const person = await getEmployee(sess.employeeId);
      if (!person?.egg) return deny(res, 403);

      const cfg = { ...DEFAULT_CFG, ...((await getKey('cfg')) || {}) };
      /* 「受付期間内であれば変更できる」 — and outside it, neither a first
         answer nor a change. Checked here and not only on the screen,
         because the screen is not a guard. */
      if (!eggOpen(cfg, tokyoNow().stamp)) return sendJson(res, 409, { error: 'closed' });

      const b = await readBody(req).catch(() => null);
      const vote = cleanVote(b, eggOffices(cfg));
      if (!vote) return sendJson(res, 400, { error: 'bad_answer' });

      await eggVote(sess.employeeId, vote);
      /* What comes back is their own answer and the new totals — never a
         row belonging to anybody else. */
      return sendJson(res, 200, {
        mine: vote,
        results: tally(await eggRows(), eggOffices(cfg)),
      });
    }

    /* ==================== モラエッグ Phase 1：配布の運用 ===================

       The survey above is anonymous by construction. This is not, and
       cannot be — a pack is handed to a named person at a named desk — so
       the discipline here is a different one: every route decides what the
       caller may see from the session, never from the request.

       Four roles, and none of them is a field in a request body:
         一般          egg on their record; may consent, request, collect
         丹波登録者    egg_farm; may add to the harvest
         事務所担当者  named as the contact on an office row; sees that
                       office's list and nobody else's
         管理者        runs the draw, opens offices, edits the terms
       ------------------------------------------------------------------ */

    /** A request with the one status every screen should print for it. */
    const withStatus = (row, todayIso, holidays, final = true) => (
      row ? { ...row, status: statusOf(row, todayIso, holidays, final) } : null
    );

    /** Who the caller is, worked out from the session alone. */
    const eggWho = async () => {
      /* An administrator is not 丹波. They were given farm:true so that
         nothing on that screen was out of reach, and the consequence was
         the 丹波 tab on the 管理 login — a screen for typing in the day's
         eggs, offered to the committee, who never will. The daily entry
         is the shed's and only the shed's.

         Everything else an administrator might need in an emergency is
         reachable without it: 発送の確定, 配分を確定, the shipping list and
         the printables all accept admin OR farm. Only POST /egg/harvest
         asks for farm alone, which is the daily figure — the one thing
         that should come from the person holding the eggs. */
      if (sess.isAdmin) return { admin: true, egg: true, farm: false, contactFor: [], person: null };
      const person = await getEmployee(sess.employeeId);
      return {
        admin: false,
        egg: !!person?.egg,
        farm: !!person?.eggFarm,
        contactFor: await eggContactFor(),
        person,
      };
    };

    /* Two kinds of day off decide this schedule, and the server needs
       both. 佐野's rule moves the deadline, the shipping day and the
       arrival when the Monday is a 祝日, and it moves the pickup deadline
       to Thursday when the Friday is a company 休業日. Public holidays
       come from the shared table rather than the browser: the server is
       what refuses a late request, so it cannot be told which Mondays are
       holidays by the client making the request. 設定 closures go over
       the top, so an office may shut on a day the nation works. */
    /* One reading of the settings for the routes and for the clock: the
       deadline the screens show has to be the deadline the automatic run
       obeys, and two copies of this merge would eventually disagree. */
    const eggCfgNow = eggCfg;

    if (url.pathname === '/api/egg/portal' && req.method === 'GET') {
      if (!sess) return deny(res);
      const who = await eggWho();
      if (!who.egg && !who.admin) return deny(res, 403);

      const { cfg, holidays } = await eggCfgNow();
      const now = tokyoNow();
      const ship = openShipMonday(now.stamp, now.h, cfg, holidays);

      const offices = await eggOfficeRows(true);
      const requests = await eggWeekRequests(ship);
      const consent = who.admin ? null : await eggConsent(sess.employeeId);

      /* The eggs that go out on a shipping Monday were laid in the week
         before it, so the harvest raced against a week's requests is that
         week's, counted back from the shipment rather than forward from
         today. The two were the same thing under the old Friday deadline;
         they are not on a Monday morning, when the week open for requests
         is this one and the eggs filling it were laid last week. */
      const span = harvestWindow(ship, cfg, holidays);
      const harvestFrom = span.from;
      const harvest = await eggHarvest(span.from, span.to);
      /* Once the week has been decided, every screen stops showing what
         was asked for and starts showing what is coming — the same
         numbers the office contacts are given, so nobody is comparing two
         accounts of the same Monday. */
      const week = await eggWeek(ship);
      const decided = !!week?.drawnAt;
      /* 仕様書 4.7: between the allocation and 最終確定 the numbers are
         shown but described as 確認中. Both flags go to the browser
         because the screen says different things at each stage, and
         working one out from the other has already been got wrong once. */
      const finalised = !!week?.finalAt;
      const sent = decided
        ? Object.fromEntries((await eggWeekOffices(ship)).map((o) => [o.office, o]))
        : {};

      return sendJson(res, 200, {
        today: now.stamp,
        /* With the offices, so the week card can print the date the
           reader's own office sees — 東京's is a day behind the rest. */
        week: weekInfo(ship, cfg, holidays, offices),
        /* 仕様書 4.6:「今週はお休みです」 is about the week people are
           living in, not the week they can request for — those are the
           same Monday most of the time and deliberately are not during a
           shutdown, when requests are being taken for the week it ends. */
        thisWeek: (() => {
          const m = mondayOf(now.stamp);
          const plan = weekPlan(m, cfg);
          return { ship: m, off: plan.type === 'off', note: plan.note };
        })(),
        /* 佐野's own announcement, typed in 管理 and shown at the top of
           everybody's 配布状況. Filtered here rather than on the screen:
           an expired notice should not travel at all, and the date it
           expires is the committee's business, not the browser's.

           Compared on the Tokyo date, like every other date in this app
           — the notice is written for a Japanese office and must not go
           dark a day early because a laptop is set to London. */
        notice: (() => {
          const text = String(cfg.egg?.notice || '').trim();
          const until = cfg.egg?.noticeUntil || null;
          if (!text) return null;
          return !until || String(until) >= tokyoNow().stamp ? text : null;
        })(),
        /* Whether this is the very first shipment, so the screen can show
           her 初回の受付スタート card instead of the ordinary weekly one. */
        firstRound: !!cfg.egg?.firstShip && ship === String(cfg.egg.firstShip),
        /* 参加登録. Null until somebody registers, which is what puts the
           sign-up screen in front of them instead of the four tabs. */
        signup: who.admin ? null : await eggSignup(sess.employeeId),
        /* マイ設定 shows the work address and the date the terms were
           agreed; both come from the record, never from the browser. */
        me: who.person ? { email: who.person.email || '' } : null,
        consentAt: consent?.agreedAt || null,
        /* The launch dates, so the screens can say when rather than
           having them written into the markup twice. */
        dates: {
          signupFrom: cfg.egg?.signupFrom || null,
          /* 受取場所の登録締切 is a one-off: the date by which somebody has
             to have chosen a pickup office before the first shipment.
             Sent only while it is still ahead of us, so the badge takes
             itself down on the 18th instead of sitting on two screens
             announcing a deadline that has passed — which is the kind of
             thing nobody reports and everybody stops reading.

             Compared on the Tokyo date, like every other date in this
             app: a badge that vanishes at 09:00 because the server
             thinks in UTC is worse than one that stays. */
          locDeadline: cfg.egg?.locDeadline && cfg.egg.locDeadline >= tokyoNow().stamp
            ? cfg.egg.locDeadline : null,
          requestsFrom: cfg.egg?.requestsFrom || null,
        },
        /* Every office with its address, for the two screens that let
           somebody pick one: 「事業所名の下に、所在地を小さく表示する」. The
           list beside this one carries this week's request counts and is
           active offices only — this is the roster, which a person
           registering needs whole. */
        officeRows: offices.map((o) => ({ name: o.name, address: o.address || '' })),
        open: requestsOpen(ship, now.stamp, now.h, cfg, holidays),
        /* Each office carries the minimum that makes a run to it worth
           making, and how many packs have been asked for so far — the two
           numbers the 「今週タマゴが届きます！」 verdict is made of. */
        offices: offices.map((o) => ({
          name: o.name, address: o.address || '',
          note: o.note || '', minPacks: o.minPacks || 0,
          asked: requests.filter((r) => r.office === o.name)
            .reduce((a, r) => a + (r.packs || 0), 0),
          /* 仕事用 only, because 東京's exception turns on it: 「仕事用の
             申請があれば3パック未満でも送る」. A count, not a list — who
             asked for what is nobody else's business. */
          work: requests.filter((r) => r.office === o.name && r.purpose === 'work')
            .reduce((a, r) => a + (r.packs || 0), 0),
          /* Null until the week is decided, so a screen can tell "none
             yet" from "none at all" without being told twice. */
          sent: decided ? (sent[o.name]?.packs ?? 0) : null,
          spare: decided ? (sent[o.name]?.extra ?? 0) : null,
        })),
        purposes: EGG_PURPOSES,
        maxPacks: eggMaxPacks(cfg),
        terms: eggTerms(cfg),
        consented: consentOk(consent, cfg),
        consentAt: consent?.agreedAt || null,
        /* 「自分の申請状況が確認できる」 — their own row, taken by session id.
           The status is worked out here rather than in each screen, so the
           participant, the office contact and any export can never disagree
           about whether a pack has expired. */
        mine: withStatus(await eggMyRequest(sess.employeeId, ship), now.stamp, holidays, finalised),
        /* Older weeks in the history were confirmed long ago; only the
           open one can be mid-check. */
        history: (who.admin ? [] : await eggMyRequests(sess.employeeId, 8))
          .map((r) => withStatus(r, now.stamp, holidays, r.ship !== ship || finalised)),
        /* 「申請の合計数は目的別の内訳も含めて確認できる」 — counts, open to
           everyone, and no names in them. */
        totals: requestTotals(requests, offices.map((o) => o.name)),
        harvest,
        harvestPacks: harvest.reduce((a, d) => a + d.packs, 0),
        week0: harvestFrom,
        drawn: week,
        decided,
        final: finalised,
        role: { admin: who.admin, farm: who.farm, contactFor: who.contactFor },
      });
    }

    /* ----------------------------- 参加登録 ------------------------------ */

    /* 配布ルール 3. One screen writes all three answers at once, because
       they are one decision: 「受け取りの条件への同意、いつもの受取場所、
       お知らせの送り先を登録する」. Saving the office without the
       agreement, or the other way round, would leave somebody half
       registered and the screens have no state for that. */
    if (url.pathname === '/api/egg/signup' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });

      const { cfg } = await eggCfgNow();
      const b = await readBody(req).catch(() => null);
      const office = String(b?.office || '').trim();
      if (!EGG_OFFICES.includes(office)) return sendJson(res, 400, { error: 'bad_office' });
      if (b?.agree !== true) return sendJson(res, 400, { error: 'need_agree' });

      /* 「会社のメールアドレスは変更できない」 — it comes from the record,
         never from the browser, so only the optional private one is read
         off the request at all. */
      const priv = subMail(b?.privateMail, (await getEmployee(sess.employeeId))?.email);
      if (priv === false) return sendJson(res, 400, { error: 'bad_mail' });

      const live = eggTerms(cfg);
      await eggConsentSave(sess.employeeId, live.version);
      await eggSignupSave(sess.employeeId, {
        office, privateMail: priv || null, notifyPriv: priv ? b?.notifyPriv === true : false,
      });
      return sendJson(res, 200, { signup: await eggSignup(sess.employeeId) });
    }

    /* マイ設定. The same three answers, changed afterwards — 「受取場所を
       変えたい人は、リクエストの前にマイ設定で変更する」. */
    if (url.pathname === '/api/egg/signup' && req.method === 'PUT') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });

      const now = await eggSignup(sess.employeeId);
      if (!now) return sendJson(res, 409, { error: 'not_registered' });
      const b = await readBody(req).catch(() => null);
      const office = b?.office === undefined ? now.office : String(b.office || '').trim();
      if (!EGG_OFFICES.includes(office)) return sendJson(res, 400, { error: 'bad_office' });
      const priv = b?.privateMail === undefined
        ? now.privateMail
        : subMail(b.privateMail, (await getEmployee(sess.employeeId))?.email);
      if (priv === false) return sendJson(res, 400, { error: 'bad_mail' });
      await eggSignupSave(sess.employeeId, {
        office,
        privateMail: priv || null,
        notifyPriv: priv ? (b?.notifyPriv === undefined ? now.notifyPriv : b.notifyPriv === true) : false,
      });
      return sendJson(res, 200, { signup: await eggSignup(sess.employeeId) });
    }

    /* ------------------------------ 同意 --------------------------------- */

    if (url.pathname === '/api/egg/consent' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const who = await eggWho();
      if (!who.egg) return deny(res, 403);

      const { cfg } = await eggCfgNow();
      const b = await readBody(req).catch(() => null);
      /* The version comes from the request so that agreeing to a screen
         that has since been revised does not silently record agreement to
         the new wording — it is compared against the live text and refused
         if it no longer matches. */
      const live = eggTerms(cfg);
      if (String(b?.version || '') !== live.version) return sendJson(res, 409, { error: 'stale_terms' });
      if (b?.agree !== true) return sendJson(res, 400, { error: 'bad_answer' });

      await eggConsentSave(sess.employeeId, live.version);
      return sendJson(res, 200, { consented: true });
    }

    /* ------------------------------ 申請 --------------------------------- */

    if (url.pathname === '/api/egg/request' && (req.method === 'PUT' || req.method === 'DELETE')) {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const who = await eggWho();
      if (!who.egg) return deny(res, 403);

      const { cfg, holidays } = await eggCfgNow();
      const now = tokyoNow();
      const ship = openShipMonday(now.stamp, now.h, cfg, holidays);
      /* 「申請の変更・取り消しは締切まで可能」 — and after it, neither.
         Checked here because the screen is not a guard, and because the
         draw has already run on what the table said at the deadline. */
      if (!requestsOpen(ship, now.stamp, now.h, cfg, holidays)) return sendJson(res, 409, { error: 'closed' });

      if (req.method === 'DELETE') {
        await eggRequestDrop(sess.employeeId, ship);
        return sendJson(res, 200, { mine: null });
      }

      /* 「同意した社員だけが申請できる」. The gate is here, not only on the
         screen that hides the button. */
      if (!consentOk(await eggConsent(sess.employeeId), cfg)) {
        return sendJson(res, 403, { error: 'no_consent' });
      }

      /* 仕様書 4.3:「受取場所はマイ設定の登録先を表示する」. The office is
         read off the registration, never off the request — a body that
         carried one would be choosing a destination the screen does not
         offer, and 配布ルール 3 says there is one registered place and no
         second choice. */
      const reg = await eggSignup(sess.employeeId);
      if (!reg) return sendJson(res, 409, { error: 'not_registered' });

      const open = (await eggOfficeRows(true)).map((o) => o.name);
      if (!open.length) return sendJson(res, 409, { error: 'no_office' });
      /* The registered office still has to be one that is running. An
         office can be closed in 設定 after people have registered at it,
         and taking their request anyway would be promising a delivery
         nobody is making — they are sent to マイ設定 to pick another. */
      if (!open.includes(reg.office)) return sendJson(res, 409, { error: 'office_closed' });

      const b = await readBody(req).catch(() => null);
      const parsed = cleanRequest({ ...b, office: reg.office }, [reg.office], cfg);
      if (!parsed.ok) return sendJson(res, 400, { error: `bad_${parsed.error}` });

      await eggRequestSave(sess.employeeId, ship, {
        ...parsed.value,
        /* Head Office cannot fall back to itself, and Tokyo has its own
           rule — so the flag is only ever stored where it can be used. */
        hqOk: b?.hqOk === true && reg.office !== HQ_OFFICE && reg.office !== TOKYO_OFFICE,
      });
      return sendJson(res, 200, { mine: await eggMyRequest(sess.employeeId, ship) });
    }

    /* ------------------------------ 収穫 --------------------------------- */

    if (url.pathname === '/api/egg/harvest' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (rateLimited(`egg:${sess.sid}`, 60, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const who = await eggWho();
      /* 5.1 は丹波側の登録者だけ。An ordinary participant adding packs would
         be adding to the number their own request is drawn out of. */
      if (!who.farm) return deny(res, 403);

      const b = await readBody(req).catch(() => null);
      const now = tokyoNow();
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b?.day || '')) ? String(b.day) : now.stamp;
      /* 仕様書 5.1 の「ほかの日を修正する」. It used to be today only, and
         a miscount noticed on the Tuesday had to go through an
         administrator. What it cannot be is a day whose week has already
         been decided: the allocation was worked out from that number, so
         changing it afterwards would leave the packs people were promised
         resting on a harvest that no longer says what it said.

         Eggs laid in a week ship on the Monday after it, so that is the
         week to ask about. */
      if (day !== now.stamp) {
        /* A day that has not happened cannot have been harvested — but an
           administrator setting a week up before it starts is doing
           something else, and is not the person this guard is for. */
        if (day > now.stamp && !who.admin) return sendJson(res, 409, { error: 'not_yet' });
        const feeds = shiftDay(mondayOf(day), 7);
        const w = await eggWeek(feeds);
        if (w?.drawnAt && !who.admin) return sendJson(res, 409, { error: 'week_decided' });
      }

      let packs;
      if (b?.delta !== undefined) {
        const d = Math.trunc(Number(b.delta));
        if (!Number.isFinite(d) || Math.abs(d) > 50) return sendJson(res, 400, { error: 'bad_delta' });
        packs = await eggHarvestBump(day, d, sess.employeeId);
      } else {
        const n = Math.floor(Number(b?.packs));
        if (!Number.isFinite(n) || n < 0 || n > 999) return sendJson(res, 400, { error: 'bad_packs' });
        packs = await eggHarvestSet(day, n, sess.employeeId);
      }

      /* Which week this screen is about: the one feeding the shipment
         that is open for requests, which is the week the employees' page
         is racing against.

         It used to be the calendar week — Monday to Sunday around today
         — and the two are the same most of the time, which is why it
         survived. They are not the same on a Monday morning, when the
         open shipment is being decided on last week's eggs, and they were
         two weeks apart on 2026/11/09, where 初回発送週 is 11/23 and the
         eggs for it are laid from the 16th: the 丹波 screen said 今週の
         取れ高 12パック while the employees' page said 0, both correct
         about different weeks. One definition now, shared with the
         portal, so the two screens cannot disagree again. */
      const { cfg, holidays } = await eggCfgNow();
      const feeds = openShipMonday(now.stamp, now.h, cfg, holidays);
      const span = harvestWindow(feeds, cfg, holidays);
      const harvest = await eggHarvest(span.from, span.to);
      /* 「今週のリクエスト合計」 — what these eggs are being asked for, as
         a total with no names in it. */
      const asked = (await eggWeekRequests(feeds)).reduce((a, r) => a + (r.packs || 0), 0);
      /* The week's total is the week's seven days, counted before today's
         own row is added below. */
      const weekPacks = harvest.reduce((a, d) => a + d.packs, 0);
      /* Today, when today is not one of those seven days — it is not
         before the first shipment, and not on a Monday before the
         deadline. The big box on this screen is always today, so without
         its row the box would sit empty over a register that holds a
         figure, and the day would look unrecorded and be typed twice. */
      if (now.stamp < span.from || now.stamp > span.to) {
        harvest.push(...await eggHarvest(now.stamp, now.stamp));
      }
      return sendJson(res, 200, {
        /* `day` is the day this call changed, which is not necessarily
           today — a correction names another one. `today` is today, and
           the screen needs both: one to show the result of the tap, the
           other to know which card is 今日の取れ高. */
        day, today: now.stamp,
        packs, harvest, harvestPacks: weekPacks,
        week: { from: span.from, to: span.to, ship: feeds },
        asked,
        decided: !!(await eggWeek(feeds))?.drawnAt,
      });
    }

    /* --------------------------- 事務所の受け取り ------------------------- */

    /* An office contact's week: the packs expected, whether they arrived,
       and who is coming to collect. Narrowed to their own office by the
       session — an office name in the query string only chooses among the
       ones they are already the contact for. */
    if (url.pathname === '/api/egg/office' && req.method === 'GET') {
      if (!sess) return deny(res);
      const who = await eggWho();
      const mine = who.admin
        ? (await eggOfficeRows(true)).map((o) => o.name)
        : who.contactFor;
      if (!mine.length) return deny(res, 403);

      const { cfg, holidays } = await eggCfgNow();
      const now = tokyoNow();
      const asked = String(url.searchParams.get('office') || '');
      const office = mine.includes(asked) ? asked : mine[0];
      /* Opens on the packs actually on their desk — this week's Monday —
         but next week's is a tap away, because on a Friday afternoon the
         useful question is how many are coming on Monday. Only a Monday is
         accepted, so the key always names a real shipment. */
      const wanted = String(url.searchParams.get('ship') || '');
      const ship = /^\d{4}-\d{2}-\d{2}$/.test(wanted) && mondayOf(wanted) === wanted
        ? wanted : mondayOf(now.stamp);

      const rows = await eggWeekRequests(ship, office);
      return sendJson(res, 200, {
        offices: mine,
        office,
        ship,
        /* Last week as well as this one and next. 5.5 makes an uncollected
           pack the office's to deal with, but it only expires on the Friday
           — and on Monday "this week" moves on and takes it out of sight,
           which is precisely when they are deciding what to do with it. */
        weeks: [shiftDay(mondayOf(now.stamp), -7), mondayOf(now.stamp), shiftDay(mondayOf(now.stamp), 7)],
        pickup: pickupDeadline(ship, holidays),
        deadline: requestDeadline(ship, cfg, holidays),
        arrival: (await eggWeekOffices(ship)).find((o) => o.office === office) || null,
        /* Only the people who actually won packs are on the list to hand to;
           a 落選 has nothing to collect and does not need their name read
           out at the front desk. The expired ones stay on it, because
           5.5 makes them this office's to deal with. */
        rows: rows.filter((r) => r.got > 0).map((r) => ({
          id: r.id, name: r.name, packs: r.got, purpose: r.purpose,
          pickedUpAt: r.pickedUpAt,
          status: statusOf({ ...r, ship }, now.stamp, holidays),
        })),
      });
    }

    if (url.pathname === '/api/egg/arrived' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const who = await eggWho();
      const b = await readBody(req).catch(() => null);
      const office = String(b?.office || '');
      if (!who.admin && !who.contactFor.includes(office)) return deny(res, 403);

      await eggArrived(mondayOf(tokyoNow().stamp), office, sess.employeeId);
      return sendJson(res, 200, { ok: true });
    }

    /* 「受け取りは、社員本人が押すか、事務所担当者がチェックする」

       The 事務所担当者 is 健康対策委員会 now. The role was removed on
       2026/11/06 — 「事業所宛てに卵を届けるかたちにします」 — and nothing
       took over its permission here, so from that day until 11/09 the
       事業所 screen drew a 「お渡しした」 button beside every name and the
       route refused every press with a 403. The only way a pack could be
       ticked off was the person doing it on their own page.

       An administrator is allowed now. They are who the screen is for. */
    if (url.pathname === '/api/egg/pickup' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const who = await eggWho();
      const b = await readBody(req).catch(() => null);
      const id = String(b?.id || '');

      /* Looked up by its own id rather than searched for in the week it is
         assumed to be in: somebody collecting on the Monday after would
         otherwise be told their pack does not exist. */
      const row = await eggRequestById(id);
      if (!row) return deny(res, 404);
      const ownIt = row.employeeId === sess.employeeId;
      /* The contact who hands it over is the one at the office it is
         collected from — 本社 for somebody moved there, not the office
         they asked at, whose contact never sees the pack. */
      const contact = who.contactFor.includes(row.collectAt || row.office);
      if (!ownIt && !contact && !who.admin) return deny(res, 403);
      /* Undoing somebody else's collection is the contact's to do; undoing
         your own is only sensible if you pressed it by mistake. */
      const done = await eggPickup(id, sess.employeeId, b?.undo === true);
      return done ? sendJson(res, 200, { ok: true }) : sendJson(res, 409, { error: 'nothing_to_collect' });
    }

    /* ------------------------- 管理者：事務所と抽選 ------------------------ */

    if (url.pathname === '/api/egg/offices' && req.method === 'GET') {
      if (!sess?.isAdmin) return deny(res, 403);
      return sendJson(res, 200, { offices: await eggOfficeRows(false) });
    }

    if (url.pathname === '/api/egg/offices' && req.method === 'PUT') {
      if (!sess?.isAdmin) return deny(res, 403);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const b = await readBody(req).catch(() => null);
      const name = String(b?.name || '').trim();
      if (!name || name.length > 60) return sendJson(res, 400, { error: 'bad_name' });
      /* Only what was sent. 事業所の設定 saves one field at a time, and a
         screen that posts its minimum should not also blank the address
         it never had on it. */
      const patch = { name };
      if ('address' in (b || {})) patch.address = String(b.address || '').slice(0, 200);
      if ('note' in (b || {})) patch.note = String(b.note || '').slice(0, 200);
      if ('active' in (b || {})) patch.active = b.active !== false;
      if ('minPacks' in (b || {})) patch.minPacks = b.minPacks;
      /* 到着 +N日 — how many nights past the ordinary one the courier
         needs for this office. Clamped again in eggOfficeSave. */
      if ('arriveDays' in (b || {})) patch.arriveDays = b.arriveDays;
      /* contactId and contactMail are no longer taken. 佐野, 2026/11/06:
         the parcel goes to the office and there is no 連絡担当者 to name,
         so the fields are off the screen — and off the route too, since
         a field removed from a form but still accepted by its endpoint
         is a field that is still there for anyone who posts to it. */
      await eggOfficeSave(patch);
      return sendJson(res, 200, { offices: await eggOfficeRows(false) });
    }

    if (url.pathname === '/api/egg/offices' && req.method === 'DELETE') {
      if (!sess?.isAdmin) return deny(res, 403);
      const name = String(url.searchParams.get('name') || '');
      const what = await eggOfficeDelete(name);
      return sendJson(res, 200, { result: what, offices: await eggOfficeRows(false) });
    }

    /**
     * 5.3 抽選を実行する。
     *
     * The packs come from the week's harvest, the rule from 設定, and the
     * seed from the shipping date — so the same week always draws the same
     * way and 「抽選」 is something somebody can check rather than take on
     * trust. Re-running it is allowed while nothing has been collected yet:
     * a correction to the harvest after a bad count should be able to put
     * the right answer in, and the seed makes the redraw deterministic too.
     */
    /* 配分の確定. 仕様書 5「締切後に配分を確定する」.

       One route, two callers: an administrator pressing the button, and
       the clock at the Monday deadline. Both land in runAllot below, so
       what the committee sees when they press it early is what would
       have happened on its own. */
    /* 配布ルール 10.6「発送先の事業所一覧を、PDFとCSVで印刷・ダウンロード
       できる」.

       Both are built here rather than in the browser, so what is printed
       is what was allocated and not what a tab still had on screen from
       before the last correction.

       The PDF is the browser's: this serves a page laid out for paper
       and the print dialog makes the file. That is what 「PDFで印刷」 asks
       for, it needs nothing installed on the server, and it works from
       the shed's phone as well as from a desk. */
    if (url.pathname === '/api/egg/list' && req.method === 'GET') {
      if (!sess) return deny(res);
      const whoNow = await eggWho();
      if (!whoNow.admin && !whoNow.farm && !whoNow.contactFor?.length) return deny(res, 403);

      const { cfg, holidays } = await eggCfgNow();
      const now = tokyoNow();
      const q = url.searchParams.get('ship');
      const ship = /^\d{4}-\d{2}-\d{2}$/.test(String(q || ''))
        ? String(q) : openShipMonday(now.stamp, now.h, cfg, holidays);
      const week = await weekResult(ship);
      if (week?.error) return sendJson(res, 409, { error: week.error });
      const info = weekInfo(ship, cfg, holidays, await eggOfficeRows(false));

      /* An office contact may print, but only their own office's page:
         the whole company's list is not theirs to hold. */
      const mine = whoNow.admin || whoNow.farm ? null : whoNow.contactFor;
      const list = (week.list || []).filter((r) => !mine || mine.includes(r.office));
      const lines = (week.lines || []).filter((l) => !mine || mine.includes(l.office));

      const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      /* 東京 is a night further out, so the arrival is a column on the
         office rather than one date in the line above the table. */
      const arriveAt = (office) => info.arriveBy?.[office] || info.arrive;
      const rows = lines.filter((l) => l.packs > 0).map((l) => `
        <tr><td>${esc(l.office)}</td><td class="n">${l.packs}</td>
            <td>${esc(arriveAt(l.office))}</td>
            <td>${l.extra > 0 ? `リクエスト${l.requested}＋余り${l.extra}`
    : l.status === 'work' ? '仕事用のため発送' : ''}</td></tr>`).join('');
      const people = list.map((r) => `
        <tr><td>${esc(r.name)}</td><td>${esc(r.office)}</td>
            <td>${r.purpose === 'work' ? '仕事用' : '私用'}</td>
            <td class="n">${r.got}</td></tr>`).join('');

      const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>モラエッグ 発送一覧 ${esc(ship)}</title>
<style>
  body{font-family:system-ui,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;
       margin:24px;color:#0B296A}
  h1{font-size:18px;margin:0 0 4px} p.sub{margin:0 0 18px;color:#5B6B86;font-size:13px}
  h2{font-size:14px;margin:22px 0 6px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid #C3CCDA;padding:5px 8px;text-align:left}
  th{background:#EAF0FB}
  td.n{text-align:right;font-variant-numeric:tabular-nums}
  @media print{ body{margin:0} .noprint{display:none} }
</style></head><body>
<h1>モラエッグ 発送一覧</h1>
<p class="sub">締切 ${esc(info.deadline.date)}／発送日 ${esc(info.shipDay)}／受け取り期限 ${esc(info.pickup)}
 ${week.final ? '' : '（確認中）'}</p>
<h2>事業所ごとの発送数</h2>
<table><tr><th>事業所</th><th>発送するパック数</th><th>到着予定</th><th>内訳</th></tr>${rows}</table>
<h2>受け取る人の一覧</h2>
<table><tr><th>名前</th><th>事業所</th><th>用途</th><th>パック数</th></tr>${people}</table>
<p class="noprint" style="margin-top:18px">
  <button onclick="window.print()">印刷する</button></p>
</body></html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return undefined;
    }

    /**
     * 箱に入れる紙 — one page per office, as a real PDF.
     *
     * 佐野, 2026/11/06:「丹波では、事業所ごとのパック数と、リクエストした人
     * の一覧を印刷して、荷物の中に入れたいです。最終確定のあと…できれば
     * 事業所ごとに改ページして、箱ごとに入れやすいように」.
     *
     * 丹波 and the administrators, and only after 最終確定 — the whole
     * point of the two stages is that nothing leaves the building on a
     * week still marked 確認中, and a sheet printed from a draft is the
     * one copy nobody would think to check again.
     */
    if (url.pathname === '/api/egg/list.pdf' && req.method === 'GET') {
      if (!sess) return deny(res);
      const whoNow = await eggWho();
      if (!whoNow.admin && !whoNow.farm) return deny(res, 403);
      if (rateLimited(`eggpdf:${sess.sid}`, 20, 3600_000)) {
        return sendJson(res, 429, { error: 'too_many' });
      }

      const { cfg, holidays } = await eggCfgNow();
      const now = tokyoNow();
      const q = url.searchParams.get('ship');
      const ship = /^\d{4}-\d{2}-\d{2}$/.test(String(q || ''))
        ? String(q) : openShipMonday(now.stamp, now.h, cfg, holidays);
      const week = await weekResult(ship);
      if (week?.error) return sendJson(res, 409, { error: week.error });
      if (!week.final) return sendJson(res, 409, { error: 'not_final' });

      const offs = await eggOfficeRows(false);
      const info = weekInfo(ship, cfg, holidays, offs);
      const book = await buildSheet({
        /* The day the van actually goes, not the Monday that names the
           week. They were the same date until 2026/11/12, which is why
           the sheet used to be handed the week's own name and still
           printed 「◯月◯日発送分」 correctly. */
        ship: info.shipDay,
        arrive: info.arrive,
        arriveBy: info.arriveBy,
        pickup: info.pickup,
        lines: week.lines || [],
        list: week.list || [],
        offices: offs,
        /* For the 発送一覧 page at the front: the week's own figures, so
           the committee can see what was laid against what went out. */
        harvest: week.packs ?? null,
        missed: week.missed || 0,
      });
      if (!book) return sendJson(res, 409, { error: 'nothing_to_ship' });

      let pdf;
      try {
        pdf = await xlsxToPdf(book);
      } catch (e) {
        /* The machine cannot convert — say which half is missing rather
           than a bare 500, because the fix is different for each and
           the person reading this is not standing next to the server. */
        if (e?.code === 'pdf_unavailable') return sendJson(res, 503, { error: 'pdf_unavailable' });
        throw e;
      }
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="moraegg-${ship}.pdf"`,
        'Content-Length': pdf.length,
        'Cache-Control': 'no-store',
      });
      res.end(pdf);
      return undefined;
    }

    if (url.pathname === '/api/egg/list.csv' && req.method === 'GET') {
      if (!sess) return deny(res);
      const whoNow = await eggWho();
      if (!whoNow.admin && !whoNow.farm && !whoNow.contactFor?.length) return deny(res, 403);

      const { cfg, holidays } = await eggCfgNow();
      const now = tokyoNow();
      const q = url.searchParams.get('ship');
      const ship = /^\d{4}-\d{2}-\d{2}$/.test(String(q || ''))
        ? String(q) : openShipMonday(now.stamp, now.h, cfg, holidays);
      const week = await weekResult(ship);
      if (week?.error) return sendJson(res, 409, { error: week.error });
      const info = weekInfo(ship, cfg, holidays, await eggOfficeRows(false));
      const mine = whoNow.admin || whoNow.farm ? null : whoNow.contactFor;

      /* A field is quoted and its own quotes doubled — a name with a
         comma in it would otherwise shift every column after it. */
      const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [['事業所', '名前', '用途', 'パック数', '発送日', '到着日', '受け取り期限']];
      for (const r of (week.list || [])) {
        if (mine && !mine.includes(r.office)) continue;
        rows.push([r.office, r.name, r.purpose === 'work' ? '仕事用' : '私用',
          r.got, info.shipDay, info.arriveBy?.[r.office] || info.arrive, info.pickup]);
      }
      /* CRLF and a byte-order mark, because this is opened in Excel on a
         Japanese Windows machine and without them every name is mojibake
         and every row is one cell. */
      const csv = `\uFEFF${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="moraegg-${ship}.csv"`,
        'Cache-Control': 'no-store',
      });
      res.end(csv);
      return undefined;
    }

    /* The week as the shed needs to see it: what is open, what has been
       allocated, and whether anybody has stood behind it yet. Read-only,
       so it can be polled while a Monday is in progress. */
    if (url.pathname === '/api/egg/ship' && req.method === 'GET') {
      if (!sess) return deny(res);
      const whoNow = await eggWho();
      if (!whoNow.admin && !whoNow.farm) return deny(res, 403);

      const { cfg, holidays } = await eggCfgNow();
      const now = tokyoNow();
      const q = url.searchParams.get('ship');
      const ship = /^\d{4}-\d{2}-\d{2}$/.test(String(q || ''))
        ? String(q) : openShipMonday(now.stamp, now.h, cfg, holidays);

      const week = await eggWeek(ship);
      const info = weekInfo(ship, cfg, holidays);
      /* The harvest actually recorded for the week these eggs come from,
         which is what the pack-count box starts at. */
      const span = harvestWindow(ship, cfg, holidays);
      const harvested = (await eggHarvest(span.from, span.to))
        .reduce((a, d) => a + d.packs, 0);
      return sendJson(res, 200, {
        ship,
        week: info,
        today: now.stamp,
        /* 「月曜9時の締切後に」 — before that there is nothing to confirm,
           and the screen says so rather than offering a dead button. */
        open: requestsOpen(ship, now.stamp, now.h, cfg, holidays),
        harvested,
        drawn: !!week?.drawnAt,
        final: !!week?.finalAt,
        packs: week?.packs ?? null,
        /* The week as it stands. Once it has been run, that is what was
           decided; before that it is a dry run of the same allocation —
           the same function, nothing written — so the 丹波 screen can
           show the result boxes greyed rather than empty, and whoever
           is about to press 確定 can see what pressing it would do.
           2026/11/10, 部長. */
        result: week?.drawnAt ? await weekResult(ship)
          : await runAllot(ship, { dry: true }),
        preview: !week?.drawnAt,
      });
    }

    /* 配布ルール 10.2「丹波担当が、その時点で発送できるパック数を入力して
       確定する」. Stage one of two: the week is worked out, and nothing is
       announced. The packs are what the shed says can actually go today,
       which is not always what was laid — a cracked tray is the obvious
       case — so the number is typed rather than taken from the register.

       The 丹波 role may press it, and an administrator may too: one of
       the three administrators IS a Tamba staff member (仕様書 2), and
       somebody has to be able to run a Monday when they are off. */
    if (url.pathname === '/api/egg/draw' && req.method === 'POST') {
      if (!sess) return deny(res);
      const whoNow = await eggWho();
      if (!whoNow.admin && !whoNow.farm) return deny(res, 403);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });

      const { cfg, holidays } = await eggCfgNow();
      const b = await readBody(req).catch(() => null);
      const now = tokyoNow();
      const ship = /^\d{4}-\d{2}-\d{2}$/.test(String(b?.ship || ''))
        ? String(b.ship) : openShipMonday(now.stamp, now.h, cfg, holidays);

      /* A week already confirmed is not re-run by this: the emails have
         gone and people have been told what they are getting. */
      const already = await eggWeek(ship);
      if (already?.finalAt) return sendJson(res, 409, { error: 'already_final' });

      const out = await runAllot(ship, {
        packs: Number.isInteger(b?.packs) && b.packs >= 0 ? b.packs : null,
        by: sess.employeeId,
      });
      if (out.error) return sendJson(res, 409, { error: out.error });
      return sendJson(res, 200, out);
    }

    /* 配布ルール 10.4「丹波担当が振り分け結果を確認し、12時までを目安に最終
       確定する」. Stage two: the display changes to 確定 and the emails go.
       Separate from stage one because it is a different act by a person —
       the first says what the eggs are, the second says the answer is
       right. */
    if (url.pathname === '/api/egg/final' && req.method === 'POST') {
      if (!sess) return deny(res);
      const whoNow = await eggWho();
      if (!whoNow.admin && !whoNow.farm) return deny(res, 403);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });

      const { cfg, holidays } = await eggCfgNow();
      const b = await readBody(req).catch(() => null);
      const now = tokyoNow();
      const ship = /^\d{4}-\d{2}-\d{2}$/.test(String(b?.ship || ''))
        ? String(b.ship) : openShipMonday(now.stamp, now.h, cfg, holidays);

      const week = await eggWeek(ship);
      if (!week?.drawnAt) return sendJson(res, 409, { error: 'not_drawn' });
      if (week.finalAt) return sendJson(res, 409, { error: 'already_final' });
      if (!await eggWeekFinalise(ship, sess.employeeId)) {
        return sendJson(res, 409, { error: 'not_drawn' });
      }

      /* The emails are the point of this button, but they are not what
         it promises: the week is confirmed either way, and a mail server
         having a bad morning must not leave the site saying 確認中 for
         the rest of the day. So they are sent after the state is safe,
         and what went wrong is reported rather than thrown. */
      let mail = { sent: 0, failed: 0 };
      try {
        mail = await eggMail(ship, cfg, holidays);
      } catch (e) {
        mail = { sent: 0, failed: -1, error: String(e?.message || e).slice(0, 120) };
      }
      /* Whether a letter actually left the building, which the screen
         had been claiming without knowing: with no SMTP_HOST the mailer
         is a console line, and `sent` counts those too. The mode is a
         boolean about this deployment, not a credential. */
      return sendJson(res, 200, {
        ...(await weekResult(ship)), final: true, mail: { ...mail, dryRun: DRY_RUN },
      });
    }

    /* 確定の取り消し — 2026/11/09.

       The counterpart to the two presses above, and the reason it exists
       is the 丹波 screen: it refuses corrections to a week that has been
       decided, so a week confirmed by mistake — the obvious one being
       confirmed before the day's harvest was typed in — takes the harvest
       register down with it until the next Monday.

       Allowed to the same people who may confirm, refused once anybody
       has collected, and it says which of those it did rather than just
       failing. The letters that went out cannot be recalled; the screen
       warns about that before it calls this. */
    if (url.pathname === '/api/egg/undraw' && req.method === 'POST') {
      if (!sess) return deny(res);
      const whoNow = await eggWho();
      if (!whoNow.admin && !whoNow.farm) return deny(res, 403);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });

      const { cfg, holidays } = await eggCfgNow();
      const b = await readBody(req).catch(() => null);
      const now = tokyoNow();
      const ship = /^\d{4}-\d{2}-\d{2}$/.test(String(b?.ship || ''))
        ? String(b.ship) : openShipMonday(now.stamp, now.h, cfg, holidays);

      const out = await eggWeekUndo(ship);
      if (out === 'collected') return sendJson(res, 409, { error: 'already_collected' });
      if (out === 'none') return sendJson(res, 409, { error: 'not_drawn' });
      return sendJson(res, 200, { ship, drawn: false, final: false });
    }

    /* ==================== Phase 2：料理写真の投稿 =======================

       佐野:「持ち帰った卵で作った料理を、インスタグラム風のタイムラインに投稿
       してもらう。目的は社員同士の会話を増やすこと」

       Unlike the survey, nothing here is anonymous — 7.1.2 says the
       poster's name is shown, and that is the point. What these routes
       guard instead is who may change a thing: a post is edited and
       deleted by the person who wrote it, found by the session id and by
       nothing in the body.
       ------------------------------------------------------------------ */

    if (url.pathname === '/api/egg/dish' && req.method === 'GET') {
      if (!sess) return deny(res);
      const who = await eggWho();
      if (!who.egg && !who.admin) return deny(res, 403);

      const all = await dishStats();
      const counts = postCounts(all);
      const month = tokyoNow().stamp.slice(0, 7);
      return sendJson(res, 200, {
        me: who.admin ? null : sess.employeeId,
        admin: who.admin,
        reactions: REACTIONS,
        maxPhotos: PHOTOS_MAX,
        posts: await dishFeed(sess.employeeId, {
          limit: Number(url.searchParams.get('limit')) || 30,
          before: url.searchParams.get('before') || null,
          admin: who.admin,
        }),
        /* 7.4:「月間の『いちばん作ってみたい料理』などをトップに表示」 */
        topDish: topDish(all, month),
        /* 7.4:「投稿数に応じたモラエッグのバッジ」 */
        myPosts: counts.get(String(sess.employeeId)) || 0,
        myBadge: badgeFor(counts.get(String(sess.employeeId)) || 0),
      });
    }

    if (url.pathname === '/api/egg/dish' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      if (rateLimited(`dish:${sess.sid}`, 20, 3600_000)) return sendJson(res, 429, { error: 'too_many' });
      const who = await eggWho();
      if (!who.egg) return deny(res, 403);

      const b = await readBody(req).catch(() => null);
      const parsed = cleanPost({ ...b, photos: ['pending'] });
      if (!parsed.ok) return sendJson(res, 400, { error: `bad_${parsed.error}` });

      /* The post is made first and its photographs posted to it one by
         one. Base64 in a single body would inflate four photographs by a
         third and put the whole thing in memory twice. */
      const id = await dishCreate(sess.employeeId, parsed.value);
      return sendJson(res, 200, { id });
    }

    if (url.pathname === '/api/egg/dish' && (req.method === 'PUT' || req.method === 'DELETE')) {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      if (rateLimited(`dish:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const id = String(url.searchParams.get('id') || '');

      /* 7.1.5「投稿者本人は編集・削除ができる」 — and nobody else, which the
         employee id in the query enforces rather than a check here. */
      if (req.method === 'DELETE') {
        return sendJson(res, 200, { ok: await dishDelete(id, sess.employeeId) });
      }
      const b = await readBody(req).catch(() => null);
      const parsed = cleanPost({ ...b, photos: ['kept'] });
      if (!parsed.ok) return sendJson(res, 400, { error: `bad_${parsed.error}` });
      const done = await dishEdit(id, sess.employeeId, parsed.value);
      return done ? sendJson(res, 200, { ok: true }) : deny(res, 404);
    }

    /* The bytes, posted raw one photograph at a time. The browser has
       already resized them to PHOTO_EDGE and made the thumbnail; this
       checks what actually arrived, because a browser is not a guard. */
    if (url.pathname === '/api/egg/photo' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      if (rateLimited(`dishpic:${sess.sid}`, 40, 3600_000)) return sendJson(res, 429, { error: 'too_many' });

      const postId = String(url.searchParams.get('post') || '');
      const post = await dishPost(postId);
      if (!post) return deny(res, 404);
      if (String(post.employeeId) !== String(sess.employeeId)) return deny(res, 403);
      if (await dishPhotoCount(postId) >= PHOTOS_MAX) return sendJson(res, 413, { error: 'too_many' });

      const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
      const claimed = Number(req.headers['content-length'] || 0);
      if (claimed > PHOTO_BYTES * 2) return sendJson(res, 413, { error: 'too_big' });

      const bytes = await readBytes(req, PHOTO_BYTES * 2);
      if (!bytes) return sendJson(res, 413, { error: 'too_big' });
      const check = photoOk(mime, bytes.length);
      if (!check.ok) return sendJson(res, 415, { error: check.error });

      const ord = Number(url.searchParams.get('ord')) || 0;
      const id = await dishPhotoAdd(postId, ord, { mime, bytes, thumb: null });
      return sendJson(res, 200, { id });
    }

    /* The small copy, sent straight after the full one. Two requests
       rather than one so neither body has to be parsed apart, and if the
       second never arrives the timeline falls back to the full image —
       slower, but never a broken picture. */
    if (url.pathname === '/api/egg/photo' && req.method === 'PUT') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      if (rateLimited(`dishpic:${sess.sid}`, 40, 3600_000)) return sendJson(res, 429, { error: 'too_many' });

      const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
      const bytes = await readBytes(req, PHOTO_BYTES);
      if (!bytes) return sendJson(res, 413, { error: 'too_big' });
      const check = photoOk(mime, bytes.length);
      if (!check.ok) return sendJson(res, 415, { error: check.error });

      /* Their own photograph: the employee id is in the UPDATE's join, so
         there is no argument that would reach somebody else's. */
      const done = await dishPhotoThumb(
        String(url.searchParams.get('id') || ''), sess.employeeId, bytes,
      );
      return done ? sendJson(res, 200, { ok: true }) : deny(res, 404);
    }

    if (url.pathname === '/api/egg/photo' && req.method === 'GET') {
      if (!sess) return deny(res);
      const who = await eggWho();
      if (!who.egg && !who.admin) return deny(res, 403);
      const pic = await dishPhoto(
        String(url.searchParams.get('id') || ''),
        url.searchParams.get('thumb') === '1',
      );
      if (!pic) return deny(res, 404);
      /* Immutable: a photograph never changes under its id, so it is
         fetched once and then comes out of the browser's cache. */
      res.writeHead(200, {
        'Content-Type': pic.mime,
        'Content-Length': pic.bytes.length,
        'Cache-Control': 'private, max-age=31536000, immutable',
      });
      return res.end(pic.bytes);
    }

    /* 7.2:「1人1投稿につき各ボタン1回まで押せる（押し直しで取り消し）」 */
    if (url.pathname === '/api/egg/dish/react' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      if (rateLimited(`dish:${sess.sid}`, 60, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const who = await eggWho();
      if (!who.egg) return deny(res, 403);

      const b = await readBody(req).catch(() => null);
      const kind = cleanReaction(b?.kind);
      if (!kind) return sendJson(res, 400, { error: 'bad_kind' });
      const post = await dishPost(String(b?.id || ''));
      if (!post) return deny(res, 404);

      const on = await dishReact(post.id, sess.employeeId, kind);
      return sendJson(res, 200, { on });
    }

    /* 7.3 コメント */
    if (url.pathname === '/api/egg/dish/comments' && req.method === 'GET') {
      if (!sess) return deny(res);
      const who = await eggWho();
      if (!who.egg && !who.admin) return deny(res, 403);
      return sendJson(res, 200, {
        comments: await dishComments(String(url.searchParams.get('id') || ''), who.admin),
      });
    }

    if (url.pathname === '/api/egg/dish/comment' && (req.method === 'POST' || req.method === 'DELETE')) {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      if (rateLimited(`dish:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const who = await eggWho();
      if (!who.egg) return deny(res, 403);

      if (req.method === 'DELETE') {
        /* 「自分のコメントは削除できる」 — their own, by session id. */
        const gone = await dishCommentDelete(String(url.searchParams.get('id') || ''), sess.employeeId);
        return sendJson(res, 200, { ok: gone });
      }
      const b = await readBody(req).catch(() => null);
      const parsed = cleanComment(b);
      if (!parsed.ok) return sendJson(res, 400, { error: `bad_${parsed.error}` });
      const post = await dishPost(String(b?.id || ''));
      if (!post) return deny(res, 404);
      await dishCommentAdd(post.id, sess.employeeId, parsed.value.body);
      return sendJson(res, 200, { comments: await dishComments(post.id, false) });
    }

    /* 8:「管理者は不適切な投稿・コメントを非表示にできる」. Hidden, not
       destroyed — an administrator taking a post out of the timeline is a
       different act from its author deleting it, and only one of them
       should lose what was written. */
    if (url.pathname === '/api/egg/dish/hide' && req.method === 'POST') {
      if (!sess?.isAdmin) return deny(res, 403);
      const b = await readBody(req).catch(() => null);
      const hide = b?.hide !== false;
      if (b?.comment) await dishCommentHide(String(b.comment), hide);
      else if (b?.id) await dishHide(String(b.id), sess.employeeId, hide);
      else return sendJson(res, 400, { error: 'bad_target' });
      return sendJson(res, 200, { ok: true });
    }

    /* 業務報告書 as the form itself, filled from the month on screen. Built
       here rather than in the browser so the template and exceljs stay off
       the client, and because the file is what payroll receives — it should
       come from one place. The holiday list comes with the request: the
       browser holds the authoritative one, and the form has to agree with
       what the person was shown. */
    if (url.pathname === '/api/kintai/xlsx' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      const b = await readBody(req).catch(() => null);
      const y = Number(b?.y); const m = Number(b?.m);
      if (!y || !m || m < 1 || m > 12) return sendJson(res, 400, { error: 'period_required' });

      const person = await getEmployee(sess.employeeId);
      if (!person) return deny(res, 403);
      const saved = (await getKey(`kt:${periodKey(y, m)}:${person.id}`)) || { days: {} };
      /* The public holidays the browser fetched, plus the company's own
         休業日 from 設定 — the screen merges the same two, and the file has
         to agree with what the person was shown. */
      const cfgNow = (await getKey('cfg')) || {};
      const holidays = {
        ...((b.holidays && typeof b.holidays === 'object') ? b.holidays : {}),
        ...closureMap(cfgNow, null),
      };

      const days = periodDays(y, m).map((iso) => {
        const d = new Date(`${iso}T00:00:00`);
        return { iso, dom: d.getDate(), dow: d.getDay(), ...(saved.days?.[iso] || {}) };
      });

      let buf;
      try {
        buf = await buildTimesheet({
          y, m, days, holidays,
          /* The same 働き方 the screen used. Without it the file would be
             computed on the house 9:00–17:45 and the 所定時間内 on the sheet
             would not match the figures the person was shown. */
          rules: rulesForPerson(cfgNow, person),
          person: {
            id: person.id, name: person.name,
            dept: person.dept || '', section: person.section || '',
            affiliation: person.affiliation || '',
          },
        });
      } catch (err) {
        console.error('timesheet build failed', err.message);
        return sendJson(res, 500, { error: 'build_failed' });
      }

      return sendDoc(res, buf, timesheetFilename(y, m, person.id), b?.format === 'pdf');
    }

    /* The approved fare for one journey. Only the rows for the two stations
       asked about come back, so nobody can read off the table as a whole. */
    if (url.pathname === '/api/fare/table' && req.method === 'GET') {
      if (!sess) return deny(res);
      if (rateLimited(`faretable:${sess.sid}`, 120, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const table = (await getKey('fares')) || [];
      const rows = fareTableMatches(table, url.searchParams.get('from'), url.searchParams.get('to'));
      return sendJson(res, 200, { rows });
    }

    /* 運賃 — asked of a route planner rather than of the person claiming it.
       Every call costs the company a request, so it is rate limited per
       person rather than per IP: one office behind one address should not
       lock itself out, and one person holding a key down should not spend
       the budget. The key never leaves this process. */
    if (url.pathname === '/api/fare/stations' && req.method === 'GET') {
      if (!sess) return deny(res);
      if (!fare.hasProvider()) return sendJson(res, 503, { error: 'no_provider' });
      if (rateLimited(`fare:${sess.sid}`, 60, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      try {
        return sendJson(res, 200, { stations: await fare.stations(url.searchParams.get('q')) });
      } catch (err) {
        return fareError(res, err);
      }
    }

    if (url.pathname === '/api/fare/routes' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (!fare.hasProvider()) return sendJson(res, 503, { error: 'no_provider' });
      if (rateLimited(`fare:${sess.sid}`, 60, 60_000)) return sendJson(res, 429, { error: 'too_many' });
      const b = await readBody(req).catch(() => null);
      try {
        const routes = await fare.lookup({ from: b?.from, to: b?.to, date: b?.date });
        return sendJson(res, 200, { routes });
      } catch (err) {
        return fareError(res, err);
      }
    }

    /* 交通費精算書, filled from the journeys on screen. The rows are read
       back out of storage rather than taken from the request: the file and
       the screen have to be the same thing, and only one of them is the
       record. */
    if (url.pathname === '/api/koutsuuhi/xlsx' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      const b = await readBody(req).catch(() => null);
      const y = Number(b?.y); const m = Number(b?.m);
      if (!y || !m || m < 1 || m > 12) return sendJson(res, 400, { error: 'period_required' });

      const person = await getEmployee(sess.employeeId);
      if (!person) return deny(res, 403);
      const saved = (await getKey(`tr:${periodKey(y, m)}:${person.id}`)) || { rows: [] };
      const rows = Array.isArray(saved.rows) ? saved.rows : [];
      const pages = sheetCount(rows);
      const page = Number(b?.page) || 0;

      let buf;
      try {
        buf = await buildKoutsuuhi({
          y, m, rows, page,
          person: {
            id: person.id, name: person.name,
            dept: person.dept || '', section: person.section || '',
            affiliation: person.affiliation || '',
          },
        });
      } catch (err) {
        if (err.code === 'no_such_page') return sendJson(res, 400, { error: 'no_such_page' });
        console.error('koutsuuhi build failed', err.message);
        return sendJson(res, 500, { error: 'build_failed' });
      }

      /* so the browser knows whether to come back for another */
      res.setHeader('X-Sheet-Count', String(pages));
      return sendDoc(res, buf, koutsuuhiFilename(y, m, person.id, page, pages), b?.format === 'pdf');
    }

    /* 届 — one notice from the month already entered. The period and the
       kind come from the timesheet, so nothing is typed twice; the reason is
       the one thing only a person can supply. */
    if (url.pathname === '/api/kintai/todoke' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
      const b = await readBody(req).catch(() => null);
      const y = Number(b?.y); const m = Number(b?.m);
      if (!y || !m || m < 1 || m > 12) return sendJson(res, 400, { error: 'period_required' });
      if (!b.from) return sendJson(res, 400, { error: 'from_required' });

      const person = await getEmployee(sess.employeeId);
      if (!person) return deny(res, 403);
      const saved = (await getKey(`kt:${periodKey(y, m)}:${person.id}`)) || { days: {} };
      const rows = periodDays(y, m).map((iso) => {
        const d = new Date(`${iso}T00:00:00`);
        return { iso, dom: d.getDate(), dow: d.getDay(), ...(saved.days?.[iso] || {}) };
      });

      /* The run is recomputed here rather than taken from the request: a
         notice has to describe the month as stored, not as claimed. */
      const notice = noticesFor(rows).find((n) => n.from.iso === b.from && (!b.kind || n.kind === b.kind));
      if (!notice) return sendJson(res, 404, { error: 'no_such_notice' });

      let buf;
      try {
        buf = await buildTodoke({
          notice,
          person: {
            id: person.id, name: person.name,
            dept: person.dept || '', client: person.client || '',
            affiliation: person.affiliation || '',
          },
          reason: String(b.reason || '').slice(0, 60),
          remark: String(b.remark || '').slice(0, 60),
        });
      } catch (err) {
        console.error('todoke build failed', err.message);
        return sendJson(res, 500, { error: 'build_failed' });
      }

      return sendDoc(res, buf, todokeFilename(notice, person.id), b.format === 'pdf');
    }

    if (url.pathname === '/api/feedback') {
      if (!sess) return deny(res);
      if (req.method === 'POST') {
        if (rateLimited(`fb:${sess.sid}`, 10, 3600_000)) {
          return sendJson(res, 429, { error: 'too_many' });
        }
        const b = await readBody(req).catch(() => null);
        if (!b || !b.message) return sendJson(res, 400, { error: 'message_required' });
        /* Attributed from the session, never from the body. */
        const who = sess.isAdmin ? null : await getEmployee(sess.employeeId);
        const row = await addFeedback({
          ...b, name: who?.name || null, email: who?.email || null, employeeId: who?.id || null,
        });

        /* The report reaches a person, not only the table.
           2026/11/11: モラエッグ's 不具合の報告 asks the server to send it
           rather than the browser. The pedometer's form mails through
           EmailJS, from the page, off four VITE_ variables baked in at
           build time — which is fine while they are set and silent when
           they are not. This runs on the machine that already sends the
           weekly letters, so whether a report arrives depends on the
           same SMTP settings as everything else and on ADMIN_EMAIL,
           which can list more than one address.

           Only when the browser did not send it, so a pedometer report
           that EmailJS already delivered is not sent twice. */
        if (!b.sent && REPORT_EMAIL) {
          const label = String(b.category || 'ご意見');
          const body = [
            `区分　　：${label}`,
            `お名前　：${who?.name || '管理者'}`,
            `社員番号：${who?.id || '－'}`,
            `返信先　：${who?.email || '－'}`,
            '',
            String(b.message).slice(0, 4000),
          ].join('\n');
          try {
            await send(REPORT_EMAIL, `【${label}】${String(b.message).slice(0, 30)}`, body);
            row.mailed = true;
          } catch (e) {
            console.warn('feedback mail failed', e?.message || e);
            row.mailed = false;
          }
        }
        return sendJson(res, 200, row);
      }
      if (req.method === 'GET') {
        if (!sess.isAdmin) return deny(res, 403);
        return sendJson(res, 200, { items: await listFeedback() });
      }
    }

    if (url.pathname === '/api/kv/list' && req.method === 'GET') {
      if (!sess?.isAdmin) return deny(res, sess ? 403 : 401);
      return sendJson(res, 200, { keys: await listKeys(url.searchParams.get('prefix') || '') });
    }

    if (url.pathname === '/api/kv') {
      if (!sess) return deny(res);
      const key = url.searchParams.get('key');
      if (req.method === 'GET') {
        if (!key) return sendJson(res, 400, { error: 'key required' });
        if (!mayTouchKey(sess, key, false)) return deny(res, 403);
        const value = await getKey(key);
        return sendJson(res, 200, { key, value: key === 'cfg' && !sess.isAdmin ? publicCfg(value) : value });
      }
      if (req.method === 'PUT') {
        const body = await readBody(req).catch(() => null);
        if (!body || !body.key) return sendJson(res, 400, { error: 'key required' });
        if (!mayTouchKey(sess, body.key, true)) return deny(res, 403);
        if (!sess.isAdmin && submittedTooEarly(body.key, body.value)) {
          return sendJson(res, 400, { error: 'incomplete' });
        }
        if (!sess.isAdmin && /^st:/.test(body.key) && body.value?.submitted) {
          const cfg = (await getKey('cfg')) || {};
          if (submittedOutsideWindow(body.key, body.value, cfg)) {
            return sendJson(res, 400, { error: 'window_closed' });
          }
        }
        /* A submitted timesheet is the thing three people sign. The screen
           locks after submission, but the lock has to be here too, or a
           stale tab left open before submitting would write over it. Only an
           administrator can reopen one. */
        if (!sess.isAdmin && /^(?:kt|tr):/.test(body.key)) {
          const prev = await getKey(body.key);
          if (prev && prev.submitted) return sendJson(res, 409, { error: 'locked' });
        }
        /* 運賃は検索のみ. The screen already refuses this, but the screen is
           not a guard — and the whole point of the rule is that a figure
           nobody checked should not reach an approver. Only the submission
           is blocked: a part-finished month is free to hold anything. */
        if (!sess.isAdmin && /^tr:/.test(body.key) && body.value?.submitted) {
          const cfg = (await getKey('cfg')) || {};
          const table = (await getKey('fares')) || [];
          /* The policy needs *some* way to verify a fare, or it would lock
             the screen with no way out: either a planner key, or rows in
             the approved table. */
          const canVerify = fare.hasProvider() || table.length > 0;
          if (cfg.fareLookupOnly && canVerify
            && unverified(body.value.rows || []).length) {
            return sendJson(res, 400, { error: 'fare_not_verified' });
          }
        }
        await setKey(body.key, body.value);
        return sendJson(res, 200, { key: body.key, ok: true });
      }
      if (req.method === 'DELETE') {
        if (!key) return sendJson(res, 400, { error: 'key required' });
        if (!mayTouchKey(sess, key, true)) return deny(res, 403);
        /* The same lock the write path has. Without it a submitted month
           could be thrown away and started again, which is the thing the
           lock exists to prevent — only by a longer route. */
        if (!sess.isAdmin && /^(?:kt|tr):/.test(key)) {
          const prev = await getKey(key);
          if (prev && prev.submitted) return sendJson(res, 409, { error: 'locked' });
        }
        await delKey(key);
        return sendJson(res, 200, { key, deleted: true });
      }
    }

    /* Manual triggers, for testing before the real dates arrive. */
    if (url.pathname.startsWith('/api/jobs/') && req.method === 'POST') {
      if (!sess?.isAdmin) return deny(res, sess ? 403 : 401);
      const now = tokyoNow();
      const y = Number(url.searchParams.get('y')) || now.y;
      const m = Number(url.searchParams.get('m')) || now.m;
      const job = url.pathname.split('/').pop();
      if (job === 'reminder') return sendJson(res, 200, { sent: (await sendReminders(y, m)).length, dryRun: DRY_RUN });
      if (job === 'auto') return sendJson(res, 200, { submitted: (await autoSubmit(y, m)).length });
    }

    /* ---------------------------- 添付ファイル --------------------------- */
    if (url.pathname === '/api/uploads') {
      if (!sess || sess.isAdmin) return deny(res, 403);
      const period = String(url.searchParams.get('period') || '');
      if (!/^\d{4}$/.test(period)) return sendJson(res, 400, { error: 'period_required' });

      if (req.method === 'GET') {
        return sendJson(res, 200, { files: await listUploads(sess.employeeId, period) });
      }

      if (req.method === 'POST') {
        if (rateLimited(`up:${sess.sid}`, 20, 3600_000)) return sendJson(res, 429, { error: 'too_many' });
        const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
        if (!UPLOAD_TYPES[mime]) return sendJson(res, 415, { error: 'type' });

        /* What the browser says it is sending, before reading any of it. */
        const claimed = Number(req.headers['content-length'] || 0);
        if (claimed > UPLOAD_MAX) return sendJson(res, 413, { error: 'too_big' });

        const held = await uploadBytes(sess.employeeId);
        if (held >= UPLOAD_TOTAL) return sendJson(res, 413, { error: 'full' });

        const bytes = await readBytes(req, UPLOAD_MAX);
        if (!bytes || !bytes.length) return sendJson(res, 413, { error: 'too_big' });
        if (held + bytes.length > UPLOAD_TOTAL) return sendJson(res, 413, { error: 'full' });

        /* The name is the person's, so it is kept for them to recognise —
           and kept out of everything else. It never becomes a path. */
        const given = String(url.searchParams.get('name') || '').slice(0, 80)
          .replace(/[\r\n\t]/g, ' ').trim();
        const name = given || `添付.${UPLOAD_TYPES[mime]}`;
        const kind = String(url.searchParams.get('kind') || 'delay').slice(0, 20);

        const file = await addUpload({
          id: crypto.randomBytes(16).toString('hex'),
          employeeId: sess.employeeId, period, kind, name, mime, bytes,
        });
        return sendJson(res, 200, { file });
      }
      return sendJson(res, 405, { error: 'method' });
    }

    if (url.pathname.startsWith('/api/uploads/')) {
      if (!sess || sess.isAdmin) return deny(res, 403);
      const id = url.pathname.slice('/api/uploads/'.length);
      if (!/^[0-9a-f]{32}$/.test(id)) return sendJson(res, 400, { error: 'bad_id' });

      if (req.method === 'DELETE') {
        return sendJson(res, 200, { ok: await deleteUpload(id, sess.employeeId) });
      }
      if (req.method === 'GET') {
        const f = await getUpload(id, sess.employeeId);
        if (!f) return sendJson(res, 404, { error: 'not_found' });
        res.writeHead(200, {
          'Content-Type': UPLOAD_TYPES[f.mime] ? f.mime : 'application/octet-stream',
          'Content-Length': f.bytes.length,
          /* Never inline: a file somebody else uploaded should not be able
             to run as a page on this origin.

             Both spellings of the name. filename* carries the Japanese one
             and is what every current browser reads; the plain filename is
             the fallback for anything that does not, and has to be ASCII —
             a header is latin-1, so 遅延証明書.png in it is mojibake or a
             broken response. Stripped to the extension when nothing of the
             name survives, rather than left empty. */
          'Content-Disposition': `attachment; filename="${asciiName(f.name, f.mime)}"; `
            + `filename*=UTF-8''${encodeURIComponent(f.name)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        return res.end(f.bytes);
      }
      return sendJson(res, 405, { error: 'method' });
    }

    if (SERVE_STATIC && req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      return serveStatic(req, res, url.pathname);
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    /* The message can carry SQL and paths, so it stays in the server log. */
    const ref = crypto.randomBytes(4).toString('hex');
    console.error(`[${ref}]`, err);
    sendJson(res, 500, { error: 'server_error', ref });
  }
});

/* An empty database has no settings and no roster, so nobody — not even the
   administrator — could sign in. Fill it once, here. */
async function seedIfEmpty() {
  const cfg = await getKey('cfg');
  if (!cfg) {
    await setKey('cfg', DEFAULT_CFG);
    console.log('  Seeded   : default settings');
  } else {
    const ordered = orderRegions(cfg.regions || DEFAULT_CFG.regions);
    if (String(ordered) !== String(cfg.regions)) await setKey('cfg', { ...cfg, regions: ordered });
  }
  const roster = await getKey('roster');
  if (!roster || !roster.length) {
    await setKey('roster', ROSTER_SEED);
    console.log(`  Seeded   : ${ROSTER_SEED.length} participants`);
  }
}

initSchema()
  .then(seedIfEmpty)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`\n  Listening on port ${PORT}`);
      console.log(`  Database : connected`);
      console.log(`  Static   : ${SERVE_STATIC ? 'serving dist/' : 'API only (run vite separately)'}`);
      console.log(`  Mail     : ${DRY_RUN ? 'DRY RUN (no SMTP_HOST — nothing is sent)' : `${MAIL_FROM} via ${process.env.SMTP_HOST}`}`);
      if (!DRY_RUN && EGG_MAIL_FROM !== MAIL_FROM) {
        /* Said at start-up because the difference between these two is
           the difference between モラエッグ's mail arriving and bouncing,
           and nobody will think to check it on the morning it matters.

           A test send on 2026/11/05 went out as admin_egg@morabu.com over
           the pedometer's own login and arrived, so the shared connection
           is not a warning any more — it is how this is set up. The line
           still says which login carries the letters, because if that
           ever stops being accepted this is the one place it is written
           down. */
        console.log(`  Eggs mail: ${EGG_MAIL_FROM} ${process.env.EGG_SMTP_USER
          ? `(its own login, ${process.env.EGG_SMTP_USER})`
          : `(sent over ${process.env.SMTP_USER || 'no login'})`}`);
      }
      console.log(`  Jobs     : reminder on the 26th, auto-submit on the 2nd, 09:00 JST`);
      console.log(`  Eggs     : the week is decided at its request deadline`);
      console.log(`  Auth     : session cookie required for /api (${SESSION_DAYS}-day sessions)\n`);
    });
    setInterval(() => {
      tick().catch(console.error);
      purgeSessions().catch(console.error);
    }, 15 * 60 * 1000);
    tick().catch(console.error);
  })
  .catch((e) => {
    console.error('\n  Could not connect to the database:\n ', e.message, '\n');
    process.exit(1);
  });
