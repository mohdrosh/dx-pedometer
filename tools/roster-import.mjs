/* ============================================================================
   健康対策委員会 の名簿を集計表の CSV から取り込む
   Bring the roster into line with the committee's own 集計表.

   The committee maintains the participant list in Excel and sends it over
   when it changes. This reads that file, compares it with what the site
   holds, prints every difference, and only writes when told to.

   Two things it will not do.

   It never deletes anybody. setRoster removes any employee missing from the
   list it is given, and entries cascade off employees — so a name left out
   by accident takes a year of somebody's step history with it. People who
   have left are marked inactive instead: they cannot sign in, the totals
   skip them, and their figures stay readable. The tool refuses to write at
   all if the list it built does not still contain every id the site
   already has.

   And it never touches what belongs to the person rather than to the
   committee: the pedometer number, the consent and when it was given, the
   private second address and whether it is switched on. Those are theirs.
   Name, 地区, 性別 and the company address come from the committee's file.

     node tools/roster-import.mjs --csv 集計表.csv --url https://… --admin <id>
     node tools/roster-import.mjs ... --apply     # and write it

   The 地区別 column on the right of the sheet is a second, stale copy —
   it holds 'メール' and 'FAX' for a dozen rows — so the one on the left is
   the one read.
   ========================================================================= */

import fs from 'node:fs';

/* ----------------------------- arguments -------------------------------- */
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const CSV = arg('csv');
const URL_ = (arg('url') || 'http://127.0.0.1:8787').replace(/\/$/, '');
const ADMIN = arg('admin');
const APPLY = process.argv.includes('--apply');

if (!CSV || !ADMIN) {
  console.error('usage: node tools/roster-import.mjs --csv <file> --url <base> --admin <id> [--apply]');
  process.exit(1);
}

/* ------------------------------- CSV ------------------------------------ */
/* RFC 4180 enough for a sheet exported from Excel: quoted fields, doubled
   quotes inside them, and newlines inside a quoted field — which this file
   has, in its multi-line column headings. */
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const COL = { seq: 0, id: 1, name: 2, region: 4, gender: 5, email: 41 };

/* 0101001 and 101001 are one person. The sheet pads to seven digits and the
   site does not, and matching on the text would create a second record for
   everybody whose number starts with a zero. */
const normId = (v) => String(v ?? '').trim().replace(/^0+/, '');

function readSheet(path) {
  const rows = parseCsv(fs.readFileSync(path, 'utf8'));
  const active = []; const left = [];
  for (const r of rows) {
    if (r.length <= COL.email) continue;
    const id = normId(r[COL.id]);
    const name = (r[COL.name] || '').trim();
    const email = (r[COL.email] || '').trim();
    if (!id || !name || !/^\d+$/.test(id)) continue;      // headings, notes, blank rows
    const rec = {
      id, name, email,
      region: (r[COL.region] || '').trim(),
      gender: (r[COL.gender] || '').trim(),
      reason: (r[COL.seq] || '').trim(),
    };
    /* 参加人数 is a number for a participant and a reason for anybody else
       — 退職, 内勤扱いへ異動. */
    if (/^\d+$/.test(rec.reason)) active.push(rec); else left.push(rec);
  }
  return { active, left };
}

/* ------------------------------ the site -------------------------------- */
let cookie = '';
async function api(path, init = {}) {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

/* --------------------------------- go ----------------------------------- */
const sheet = readSheet(CSV);
console.log(`sheet: ${sheet.active.length} participants, ${sheet.left.length} 退職・異動\n`);

await api('/api/login', { method: 'POST', body: JSON.stringify({ id: ADMIN }) });
const current = (await api('/api/kv?key=roster')).value || [];
console.log(`site : ${current.length} on the roster (${current.filter((p) => p.active !== false).length} active)\n`);

const byId = new Map(current.map((p) => [normId(p.id), p]));
const seen = new Set();
const added = []; const changed = []; const deactivated = []; const reactivated = [];
const kept = [];

/* The committee's order becomes the site's order: setRoster stores the
   array index as sort_order, and the 集計表 is the order they think in. */
const next = [];

for (const s of sheet.active) {
  seen.add(s.id);
  const was = byId.get(s.id);
  if (!was) {
    next.push({
      id: s.id, name: s.name, region: s.region, gender: s.gender,
      email: s.email, email2: '', email2On: false, pedometer: '',
      consent: false, active: true,
    });
    added.push(s);
    continue;
  }
  /* Theirs stays theirs; the committee's fields are taken from the sheet. */
  const merged = {
    ...was,
    id: s.id,
    name: s.name || was.name,
    region: s.region || was.region,
    gender: s.gender || was.gender,
    email: s.email || was.email,
    active: true,
  };

  /* A few records hold two addresses in the one field — the company one and
     a gmail or a client's, separated by a semicolon or a newline. The sheet
     replaces that with the morabu address alone, which is the point of the
     exercise; but throwing the other one away is not, so it moves to the
     private field it should have been in. Switched off, because that flag
     is the person's consent and nobody has asked them: email2 is only ever
     written to when email2On is true, so this changes nothing today and
     keeps the address there if they want it. */
  const others = String(was.email || '')
    .split(/[;,\n]+/).map((e) => e.trim())
    .filter((e) => e.includes('@') && e.toLowerCase() !== (s.email || '').toLowerCase());
  if (others.length && !String(was.email2 || '').trim()) {
    merged.email2 = others[0];
    merged.email2On = false;
    kept.push({ ...s, addr: others[0] });
  }
  const diffs = ['name', 'region', 'gender', 'email']
    .filter((k) => (was[k] || '') !== (merged[k] || ''))
    .map((k) => `${k}: ${was[k] || '—'} → ${merged[k] || '—'}`);
  if (was.active === false) reactivated.push(s);
  if (diffs.length) changed.push({ ...s, diffs });
  next.push(merged);
}

/* Everyone the sheet does not list stays on the roster, switched off. */
for (const p of current) {
  if (seen.has(normId(p.id))) continue;
  const why = sheet.left.find((l) => l.id === normId(p.id));
  if (p.active !== false) deactivated.push({ ...p, reason: why?.reason || '名簿にありません' });
  next.push({ ...p, active: false });
}

/* ------------------------------- report --------------------------------- */
const show = (title, list, fmt) => {
  console.log(`${title} (${list.length})`);
  list.forEach((x) => console.log('   ' + fmt(x)));
  if (!list.length) console.log('   —');
  console.log();
};
show('ADDED', added, (x) => `${x.id} ${x.name} / ${x.region} / ${x.email}`);
show('CHANGED', changed, (x) => `${x.id} ${x.name}\n        ${x.diffs.join('\n        ')}`);
show('DEACTIVATED', deactivated, (x) => `${x.id} ${x.name} — ${x.reason}`);
show('REACTIVATED', reactivated, (x) => `${x.id} ${x.name}`);
show('PRIVATE ADDRESS KEPT (switched off, not used until they turn it on)', kept,
  (x) => `${x.id} ${x.name} — ${x.addr}`);

/* ------------------------------- guards --------------------------------- */
const lost = current.filter((p) => !next.some((n) => normId(n.id) === normId(p.id)));
if (lost.length) {
  console.error(`REFUSING: ${lost.length} people on the site are not in the list to be written.`);
  console.error('Anyone left out is deleted, and their entries go with them:');
  lost.forEach((p) => console.error(`   ${p.id} ${p.name}`));
  process.exit(1);
}
const dupes = next.map((p) => normId(p.id)).filter((v, i, a) => a.indexOf(v) !== i);
if (dupes.length) { console.error('REFUSING: duplicate ids', [...new Set(dupes)]); process.exit(1); }
const noEmail = next.filter((p) => p.active !== false && !p.email);
if (noEmail.length) {
  console.error(`REFUSING: ${noEmail.length} active people would have no address:`);
  noEmail.forEach((p) => console.error(`   ${p.id} ${p.name}`));
  process.exit(1);
}

console.log(`result: ${next.length} on the roster, ${next.filter((p) => p.active !== false).length} active`);
console.log(`        ${added.length} added, ${changed.length} changed, ${deactivated.length} switched off\n`);

if (!APPLY) {
  fs.writeFileSync('/tmp/roster-next.json', JSON.stringify(next, null, 1));
  console.log('Nothing written. Pass --apply to write it. Preview: /tmp/roster-next.json');
  process.exit(0);
}

await api('/api/kv', { method: 'PUT', body: JSON.stringify({ key: 'roster', value: next }) });
const after = (await api('/api/kv?key=roster')).value || [];
console.log(`written. The site now holds ${after.length} (${after.filter((p) => p.active !== false).length} active).`);
