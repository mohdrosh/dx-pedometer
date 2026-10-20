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
import { reminderMail, summaryMail, reminderRecipients } from './src/mail.js';
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
import {
  cleanVote, eggOpen, eggWindow, eggOffices, tally, EGG_RULES, EGG_NAMES,
  cleanRequest, eggMaxPacks, eggTerms, consentOk, requestTotals,
  EGG_PURPOSES,
} from './src/egg.js';
import {
  mondayOf, nextShipMonday, requestDeadline, requestsOpen, pickupDeadline,
  allocate, missedFrom, shiftDay, statusOf,
} from './src/egg-week.js';
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
  eggWeekRequests, eggMissed, eggWeek, eggDrawSave, eggWeekOffices,
  eggArrived, eggPickup, eggConsent, eggConsentSave, eggRequestById,
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
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const DRY_RUN = process.env.MAIL_DRY_RUN === '1' || !process.env.SMTP_HOST;
const SERVE_STATIC = fs.existsSync(DIST);
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);
const COOKIE = 'dxsid';

/* ------------------------------- mail ----------------------------------- */
const mailer = DRY_RUN ? null : nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === '1',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});

async function send(to, subject, text) {
  if (!to) return false;
  if (DRY_RUN) { console.log(`[DRY RUN] would send to ${to} — ${subject}`); return true; }
  await mailer.sendMail({ from: MAIL_FROM, to, subject, text });
  return true;
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

const cookieHeader = (sid, maxAgeSec) => [
  `${COOKIE}=${sid}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
  `Max-Age=${maxAgeSec}`, ...(process.env.COOKIE_INSECURE === '1' ? [] : ['Secure']),
].join('; ');

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

async function tick() {
  const now = tokyoNow();
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
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
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
    const withStatus = (row, todayIso, holidays) => (
      row ? { ...row, status: statusOf(row, todayIso, holidays) } : null
    );

    /** Who the caller is, worked out from the session alone. */
    const eggWho = async () => {
      if (sess.isAdmin) return { admin: true, egg: true, farm: true, contactFor: [], person: null };
      const person = await getEmployee(sess.employeeId);
      return {
        admin: false,
        egg: !!person?.egg,
        farm: !!person?.eggFarm,
        contactFor: await eggContactFor(sess.employeeId),
        person,
      };
    };

    /* The pickup deadline moves to Thursday when the Friday is a company
       休業日, so the closure list from 設定 is what decides it — the same
       list the timesheet draws its grey days from. */
    const eggCfgNow = async () => {
      const cfg = { ...DEFAULT_CFG, ...((await getKey('cfg')) || {}) };
      return { cfg, holidays: closureMap(cfg, null) };
    };

    if (url.pathname === '/api/egg/portal' && req.method === 'GET') {
      if (!sess) return deny(res);
      const who = await eggWho();
      if (!who.egg && !who.admin) return deny(res, 403);

      const { cfg, holidays } = await eggCfgNow();
      const now = tokyoNow();
      const ship = nextShipMonday(now.stamp);
      const thisMonday = mondayOf(now.stamp);

      const offices = await eggOfficeRows(true);
      const requests = await eggWeekRequests(ship);
      const consent = who.admin ? null : await eggConsent(sess.employeeId);

      /* 「今週の収穫累計」 — Monday to Sunday of the week being laid now,
         which ships on the Monday people are requesting for. */
      const harvest = await eggHarvest(thisMonday, shiftDay(thisMonday, 6));

      return sendJson(res, 200, {
        today: now.stamp,
        week: {
          ship,
          deadline: requestDeadline(ship, cfg),
          pickup: pickupDeadline(ship, holidays),
        },
        open: requestsOpen(ship, now.stamp, now.h, cfg),
        /* Each office carries the minimum that makes a run to it worth
           making, and how many packs have been asked for so far — the two
           numbers the 「今週タマゴが届きます！」 verdict is made of. */
        offices: offices.map((o) => ({
          name: o.name, address: o.address || '', contactName: o.contactName || '',
          note: o.note || '', minPacks: o.minPacks || 0,
          asked: requests.filter((r) => r.office === o.name)
            .reduce((a, r) => a + (r.packs || 0), 0),
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
        mine: withStatus(await eggMyRequest(sess.employeeId, ship), now.stamp, holidays),
        history: (who.admin ? [] : await eggMyRequests(sess.employeeId, 8))
          .map((r) => withStatus(r, now.stamp, holidays)),
        /* 「申請の合計数は目的別の内訳も含めて確認できる」 — counts, open to
           everyone, and no names in them. */
        totals: requestTotals(requests, offices.map((o) => o.name)),
        harvest,
        harvestPacks: harvest.reduce((a, d) => a + d.packs, 0),
        week0: thisMonday,
        drawn: await eggWeek(ship),
        role: { admin: who.admin, farm: who.farm, contactFor: who.contactFor },
      });
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

      const { cfg } = await eggCfgNow();
      const now = tokyoNow();
      const ship = nextShipMonday(now.stamp);
      /* 「申請の変更・取り消しは締切まで可能」 — and after it, neither.
         Checked here because the screen is not a guard, and because the
         draw has already run on what the table said at 17:00. */
      if (!requestsOpen(ship, now.stamp, now.h, cfg)) return sendJson(res, 409, { error: 'closed' });

      if (req.method === 'DELETE') {
        await eggRequestDrop(sess.employeeId, ship);
        return sendJson(res, 200, { mine: null });
      }

      /* 「同意した社員だけが申請できる」. The gate is here, not only on the
         screen that hides the button. */
      if (!consentOk(await eggConsent(sess.employeeId), cfg)) {
        return sendJson(res, 403, { error: 'no_consent' });
      }

      const open = (await eggOfficeRows(true)).map((o) => o.name);
      if (!open.length) return sendJson(res, 409, { error: 'no_office' });

      const b = await readBody(req).catch(() => null);
      const parsed = cleanRequest(b, open, cfg);
      if (!parsed.ok) return sendJson(res, 400, { error: `bad_${parsed.error}` });

      await eggRequestSave(sess.employeeId, ship, parsed.value);
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
      /* 「同日中であれば取り消し・修正ができる」 — a correction to a day that
         has passed is an administrator's job, not a tap in the shed. */
      if (day !== now.stamp && !who.admin) return sendJson(res, 409, { error: 'not_today' });

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

      const monday = mondayOf(now.stamp);
      const harvest = await eggHarvest(monday, shiftDay(monday, 6));
      return sendJson(res, 200, {
        day, packs, harvest, harvestPacks: harvest.reduce((a, d) => a + d.packs, 0),
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
        weeks: [shiftDay(mondayOf(now.stamp), -7), mondayOf(now.stamp), nextShipMonday(now.stamp)],
        pickup: pickupDeadline(ship, holidays),
        deadline: requestDeadline(ship, cfg),
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

    /* 「受け取りは、社員本人が押すか、事務所担当者がチェックする」 */
    if (url.pathname === '/api/egg/pickup' && req.method === 'POST') {
      if (!sess) return deny(res);
      if (sess.isAdmin) return deny(res, 403);
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
      const contact = who.contactFor.includes(row.office);
      if (!ownIt && !contact) return deny(res, 403);
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
      await eggOfficeSave({
        name,
        address: String(b?.address || '').slice(0, 200),
        contactId: b?.contactId ? String(b.contactId) : null,
        note: String(b?.note || '').slice(0, 200),
        active: b?.active !== false,
        minPacks: b?.minPacks,
      });
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
    if (url.pathname === '/api/egg/draw' && req.method === 'POST') {
      if (!sess?.isAdmin) return deny(res, 403);
      if (rateLimited(`egg:${sess.sid}`, 30, 60_000)) return sendJson(res, 429, { error: 'too_many' });

      const { cfg } = await eggCfgNow();
      const b = await readBody(req).catch(() => null);
      const now = tokyoNow();
      const ship = /^\d{4}-\d{2}-\d{2}$/.test(String(b?.ship || ''))
        ? String(b.ship) : nextShipMonday(now.stamp);

      const already = await eggWeekRequests(ship);
      if (already.some((r) => r.pickedUpAt)) return sendJson(res, 409, { error: 'already_collected' });

      /* The harvest that ships on this Monday is the week before it. */
      const from = shiftDay(ship, -7);
      const harvested = (await eggHarvest(from, shiftDay(ship, -1)))
        .reduce((a, d) => a + d.packs, 0);
      const packs = Number.isInteger(b?.packs) && b.packs >= 0 ? b.packs : harvested;

      const rule = String(b?.rule || cfg?.egg?.rule || 'fcfs');
      const allocated = allocate({
        requests: already.map((r) => ({ id: r.id, employeeId: r.employeeId, want: r.packs, at: r.at })),
        packs,
        rule,
        missedLastWeek: await eggMissed(shiftDay(ship, -7)),
        seed: ship,
      });
      /* allocate drops zero-pack rows, so anybody whose request it filtered
         out still needs a nought written against them — otherwise their
         status would sit at 受付済 for a week that has already been decided. */
      const byId = new Map(allocated.map((r) => [r.id, r.got]));
      const full = already.map((r) => ({ id: r.id, office: r.office, got: byId.get(r.id) ?? 0 }));

      await eggDrawSave(ship, { packs, rule, seed: ship, by: sess.employeeId }, full);
      return sendJson(res, 200, {
        ship,
        packs,
        rule,
        harvested,
        missed: missedFrom(full.map((r, i) => ({ ...r, employeeId: already[i].employeeId }))).length,
        offices: await eggWeekOffices(ship),
      });
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
        const b = await readBody(req).catch(() => null);
        if (!b || !b.message) return sendJson(res, 400, { error: 'message_required' });
        /* Attributed from the session, never from the body. */
        const who = sess.isAdmin ? null : await getEmployee(sess.employeeId);
        return sendJson(res, 200, await addFeedback({
          ...b, name: who?.name || null, email: who?.email || null, employeeId: who?.id || null,
        }));
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
      console.log(`  Jobs     : reminder on the 26th, auto-submit on the 2nd, 09:00 JST`);
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
