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
import { sheetCount } from './src/koutsuuhi-calc.js';
import * as fare from './src/fare.js';
import { DEFAULT_CFG, ROSTER_SEED, orderRegions } from './src/defaults.js';

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
        return sendJson(res, 200, { user, features: { fare: fare.hasProvider() } });
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
      const holidays = (b.holidays && typeof b.holidays === 'object') ? b.holidays : {};

      const days = periodDays(y, m).map((iso) => {
        const d = new Date(`${iso}T00:00:00`);
        return { iso, dom: d.getDate(), dow: d.getDay(), ...(saved.days?.[iso] || {}) };
      });

      let buf;
      try {
        buf = await buildTimesheet({
          y, m, days, holidays,
          person: {
            id: person.id, name: person.name,
            dept: person.dept || '', section: person.section || '',
          },
        });
      } catch (err) {
        console.error('timesheet build failed', err.message);
        return sendJson(res, 500, { error: 'build_failed' });
      }

      const name = timesheetFilename(y, m, person.id);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        /* The filename is Japanese, so it goes in the RFC 5987 form; the
           plain one beside it is for anything that cannot read that. */
        'Content-Disposition': `attachment; filename="timesheet.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'no-store',
      });
      return res.end(Buffer.from(buf));
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
          },
        });
      } catch (err) {
        if (err.code === 'no_such_page') return sendJson(res, 400, { error: 'no_such_page' });
        console.error('koutsuuhi build failed', err.message);
        return sendJson(res, 500, { error: 'build_failed' });
      }

      const name = koutsuuhiFilename(y, m, person.id, page, pages);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="expenses.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        /* so the browser knows whether to come back for another */
        'X-Sheet-Count': String(pages),
        'Cache-Control': 'no-store',
      });
      return res.end(Buffer.from(buf));
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
          },
          reason: String(b.reason || '').slice(0, 60),
          remark: String(b.remark || '').slice(0, 60),
        });
      } catch (err) {
        console.error('todoke build failed', err.message);
        return sendJson(res, 500, { error: 'build_failed' });
      }

      const name = todokeFilename(notice, person.id);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="todoke.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'no-store',
      });
      return res.end(Buffer.from(buf));
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
        /* A submitted timesheet is the thing three people sign. The screen
           locks after submission, but the lock has to be here too, or a
           stale tab left open before submitting would write over it. Only an
           administrator can reopen one. */
        if (!sess.isAdmin && /^(?:kt|tr):/.test(body.key)) {
          const prev = await getKey(body.key);
          if (prev && prev.submitted) return sendJson(res, 409, { error: 'locked' });
        }
        await setKey(body.key, body.value);
        return sendJson(res, 200, { key: body.key, ok: true });
      }
      if (req.method === 'DELETE') {
        if (!key) return sendJson(res, 400, { error: 'key required' });
        if (!mayTouchKey(sess, key, true)) return deny(res, 403);
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
