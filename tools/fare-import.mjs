/* ============================================================================
   過去の交通費精算書から運賃表をつくる
   Build the 運賃表 from expense forms people have already submitted.

   健康対策委員会 chose this over buying a fare API: the fares are already
   written on the forms everyone has been handing in, so the quickest way to
   a table the site can fill in for people is to read the forms back.

   Point it at a folder of submitted 交通費精算書 and it collects every
   journey on them — 発駅, 着駅, 利用交通機関, 運賃 — works out what each
   route costs, and loads the result into the site's 運賃表. After that
   somebody typing those two stations is offered the fare instead of
   recalling it.

   The same route will not always agree with itself. Fares go up, people
   mistype, and two different tickets between the same pair of stations are
   two different prices. So rather than pick quietly, every disagreement is
   printed with how many forms said what, and the most-used figure is the
   one proposed. Look at that list before applying it.

     node tools/fare-import.mjs --dir ./sheets --url https://… --admin <id>
     node tools/fare-import.mjs ... --apply

   One file, nothing to install: an xlsx is a zip of XML, and the little of
   it this needs is below.
   ========================================================================= */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/* ----------------------------- arguments -------------------------------- */
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const DIR = arg('dir');
const URL_ = (arg('url') || 'http://127.0.0.1:8787').replace(/\/$/, '');
const ADMIN = arg('admin');
const APPLY = process.argv.includes('--apply');
const REPLACE = process.argv.includes('--replace');

if (!DIR || !ADMIN) {
  console.error('usage: node tools/fare-import.mjs --dir <folder of xlsx> --url <base> --admin <id> [--apply]');
  console.error('       --replace  start the table again rather than adding to it');
  process.exit(1);
}

/* ------------------------------- xlsx ----------------------------------- */
/* Enough of the format to read a sheet somebody filled in by hand: the
   central directory, inflate, shared strings, and cell values by address. */
function unzip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not an xlsx (no zip directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    /* the local header's own name/extra lengths, which can differ */
    const start = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
    const raw = buf.subarray(start, start + size);
    out.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
  }
  return out;
}

const unescapeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

/* <si> may be one <t> or a run of them; both are the one string. */
function sharedStrings(zip) {
  const xml = zip.get('xl/sharedStrings.xml');
  if (!xml) return [];
  return [...xml.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join(''));
}

/** Every filled cell of the first worksheet, by address. */
function readSheet(file) {
  const zip = unzip(file);
  const strings = sharedStrings(zip);
  const name = [...zip.keys()].find((k) => /^xl\/worksheets\/sheet1\.xml$/.test(k))
    || [...zip.keys()].find((k) => /^xl\/worksheets\/.*\.xml$/.test(k));
  if (!name) throw new Error('no worksheet inside');
  const xml = zip.get(name).toString('utf8');

  /* Most cells in this form are empty and written <c r="E16" s="20"/>.
     A pattern that only knows the <c ...>…</c> shape runs past those
     looking for a closing tag and eats the next few cells with it, so
     half the row goes missing — which is how 発駅 came through and 運賃
     did not. Both shapes, closing tag optional. */
  const cells = new Map();
  for (const m of xml.matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, attrs, body = ''] = m;
    const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
    if (!ref) continue;
    const type = /t="([^"]+)"/.exec(attrs)?.[1] || 'n';
    let value = null;
    if (type === 'inlineStr') {
      value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join('');
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (v == null) continue;
      value = type === 's' ? (strings[Number(v)] ?? '') : unescapeXml(v);
    }
    if (value !== null && value !== '') cells.set(ref, value);
  }
  return cells;
}

/* --------------------------- the form's grid ---------------------------- */
const FIRST = 16; const LAST = 40;
const COL = { from: 'D', to: 'M', line: 'V', commute: 'AD', fare: 'AF' };

const clean = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const normStation = (s) => clean(s).replace(/\s/g, '').replace(/駅$/, '')
  .replace(/[ヶヵケカ]/g, 'ケ').replace(/[ノの之]/g, 'ノ').toLowerCase();
const yen = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

function journeysIn(file) {
  const c = readSheet(file);
  const got = [];
  for (let r = FIRST; r <= LAST; r++) {
    const from = clean(c.get(`${COL.from}${r}`));
    const to = clean(c.get(`${COL.to}${r}`));
    const fare = yen(c.get(`${COL.fare}${r}`));
    if (!from || !to || fare == null) continue;
    got.push({
      from, to, fare,
      line: clean(c.get(`${COL.line}${r}`)),
      commute: !!c.get(`${COL.commute}${r}`),
    });
  }
  return got;
}

/* --------------------------------- read --------------------------------- */
const files = fs.readdirSync(DIR)
  .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'))
  .map((f) => path.join(DIR, f));

if (!files.length) { console.error(`no .xlsx files in ${DIR}`); process.exit(1); }
console.log(`reading ${files.length} file(s) from ${DIR}\n`);

const seen = new Map();       // route key -> { from,to,line, fares: Map<yen, n> }
const unreadable = [];
let journeys = 0;

for (const f of files) {
  let rows;
  try { rows = journeysIn(f); } catch (e) { unreadable.push([path.basename(f), e.message]); continue; }
  if (!rows.length) { unreadable.push([path.basename(f), 'no journeys on it']); continue; }
  journeys += rows.length;
  for (const r of rows) {
    /* Both directions are the same route: a sheet saying 姫路→三ノ宮 ¥960
       is also saying what the journey home costs, and keeping them apart
       would halve the evidence for each. */
    const ends = [normStation(r.from), normStation(r.to)].sort();
    const key = `${ends[0]}|${ends[1]}|${r.line}`;
    if (!seen.has(key)) seen.set(key, { from: r.from, to: r.to, line: r.line, fares: new Map(), n: 0 });
    const e = seen.get(key);
    e.fares.set(r.fare, (e.fares.get(r.fare) || 0) + 1);
    e.n += 1;
  }
}

console.log(`${journeys} journeys, ${seen.size} distinct routes\n`);
if (unreadable.length) {
  console.log(`COULD NOT READ (${unreadable.length})`);
  unreadable.forEach(([f, why]) => console.log(`   ${f} — ${why}`));
  console.log();
}

/* ------------------------- settle the disagreements --------------------- */
const rows = []; const disputed = [];
for (const e of seen.values()) {
  const byCount = [...e.fares.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [fare] = byCount[0];
  rows.push({ from: e.from, to: e.to, line: e.line, fare });
  if (byCount.length > 1) {
    disputed.push({
      ...e,
      chosen: fare,
      spread: byCount.map(([f, n]) => `¥${f.toLocaleString('ja-JP')}×${n}`).join('  '),
    });
  }
}
rows.sort((a, b) => a.from.localeCompare(b.from, 'ja') || a.to.localeCompare(b.to, 'ja'));

if (disputed.length) {
  console.log(`ROUTES THE FORMS DISAGREE ON (${disputed.length}) — the most-used figure is taken`);
  disputed.forEach((d) => console.log(
    `   ${d.from} → ${d.to}${d.line ? ` (${d.line})` : ''}\n`
    + `        ${d.spread}   → taking ¥${d.chosen.toLocaleString('ja-JP')}`));
  console.log('   ^ a fare revision, a different ticket, or somebody mistyped.');
  console.log('     Worth a look before applying.\n');
}

console.log(`ROUTES (${rows.length})`);
rows.forEach((r) => console.log(
  `   ${r.from} → ${r.to}`.padEnd(34) + `${r.line || ''}`.padEnd(18)
  + `¥${r.fare.toLocaleString('ja-JP')}`));
console.log();

/* ------------------------------- the site ------------------------------- */
let cookie = '';
async function api(p, init = {}) {
  const res = await fetch(`${URL_}${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${p} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

await api('/api/login', { method: 'POST', body: JSON.stringify({ id: ADMIN }) });
const current = REPLACE ? [] : ((await api('/api/kv?key=fares')).value || []);
console.log(`the site's 運賃表 holds ${REPLACE ? 0 : current.length} route(s)${REPLACE ? ' (--replace: starting again)' : ''}\n`);

const keyOf = (r) => {
  const ends = [normStation(r.from), normStation(r.to)].sort();
  return `${ends[0]}|${ends[1]}|${clean(r.line)}`;
};
const next = [...current];
let added = 0; let updated = 0; let same = 0;
for (const r of rows) {
  const at = next.findIndex((x) => keyOf(x) === keyOf(r));
  if (at < 0) { next.push(r); added += 1; continue; }
  if (Number(next[at].fare) === r.fare) { same += 1; continue; }
  console.log(`   changing ${r.from} → ${r.to}: ¥${next[at].fare} → ¥${r.fare}`);
  next[at] = { ...next[at], ...r };
  updated += 1;
}

console.log(`\nresult: ${next.length} routes in the table`);
console.log(`        ${added} new, ${updated} changed, ${same} already right\n`);

if (!APPLY) {
  fs.writeFileSync('/tmp/fares-next.json', JSON.stringify(next, null, 1));
  console.log('Nothing written. Pass --apply to write it. Preview: /tmp/fares-next.json');
  process.exit(0);
}
await api('/api/kv', { method: 'PUT', body: JSON.stringify({ key: 'fares', value: next }) });
const after = (await api('/api/kv?key=fares')).value || [];
console.log(`written. The 運賃表 now holds ${after.length} routes.`);
