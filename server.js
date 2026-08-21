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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/* Load .env.local when developing. On a host like Render there is no such
   file — the environment variables come from the dashboard instead. */
if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else if (fs.existsSync('.env')) dotenv.config();

const nodemailer = (await import('nodemailer')).default;
import { reminderMail, summaryMail, companyEmail } from './src/mail.js';

if (!process.env.DATABASE_URL) {
  console.error('\n  DATABASE_URL is not set.');
  console.error('  Open .env.local and paste your Supabase connection string into it.\n');
  process.exit(1);
}

/* Imported after the check above, so the error message is the useful one. */
const { initSchema, getKey, setKey, delKey, listKeys } = await import('./src/db.js');

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(DIR, 'dist');
const PORT = process.env.PORT || 8787;
const APP_URL = process.env.APP_URL || '';
const MAIL_FROM = process.env.MAIL_FROM || 'kenkou@morabu.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const DRY_RUN = process.env.MAIL_DRY_RUN === '1' || !process.env.SMTP_HOST;
const SERVE_STATIC = fs.existsSync(DIST);

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
    const to = companyEmail(p.email);
    if (!to) { console.warn(`no company address for ${p.id} ${p.name}`); continue; }
    const { subject, body } = reminderMail({ name: p.name, y, m, consent: !!p.consent, url: APP_URL });
    try { await send(to, subject, body); sent.push(p); }
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

function sendJson(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

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

    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true });

    if (url.pathname === '/api/kv/list' && req.method === 'GET') {
      return sendJson(res, 200, { keys: await listKeys(url.searchParams.get('prefix') || '') });
    }

    if (url.pathname === '/api/kv') {
      const key = url.searchParams.get('key');
      if (req.method === 'GET') {
        if (!key) return sendJson(res, 400, { error: 'key required' });
        return sendJson(res, 200, { key, value: await getKey(key) });
      }
      if (req.method === 'PUT') {
        const body = await readBody(req).catch(() => null);
        if (!body || !body.key) return sendJson(res, 400, { error: 'key required' });
        await setKey(body.key, body.value);
        return sendJson(res, 200, { key: body.key, ok: true });
      }
      if (req.method === 'DELETE') {
        if (!key) return sendJson(res, 400, { error: 'key required' });
        await delKey(key);
        return sendJson(res, 200, { key, deleted: true });
      }
    }

    /* Manual triggers, for testing before the real dates arrive. */
    if (url.pathname.startsWith('/api/jobs/') && req.method === 'POST') {
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
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
});

initSchema()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`\n  Listening on port ${PORT}`);
      console.log(`  Database : connected`);
      console.log(`  Static   : ${SERVE_STATIC ? 'serving dist/' : 'API only (run vite separately)'}`);
      console.log(`  Mail     : ${DRY_RUN ? 'DRY RUN (no SMTP_HOST — nothing is sent)' : `${MAIL_FROM} via ${process.env.SMTP_HOST}`}`);
      console.log(`  Jobs     : reminder on the 26th, auto-submit on the 2nd, 09:00 JST\n`);
    });
    setInterval(() => { tick().catch(console.error); }, 15 * 60 * 1000);
    tick().catch(console.error);
  })
  .catch((e) => {
    console.error('\n  Could not connect to the database:\n ', e.message, '\n');
    process.exit(1);
  });
