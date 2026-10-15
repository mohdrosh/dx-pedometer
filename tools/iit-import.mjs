/* ============================================================================
   IITメンバーの個人情報を取り込む
   Load the thirteen members' 所属, 働き方 and 通勤経路 from the committee's
   own spreadsheet.

   IITメンバー所属一覧.xlsx has two sheets — メンバー一覧 with the 所属 and
   the 働き方, and 交通費 with each person's commute — and this reads both,
   matches them to the site by 社員№, prints every difference, and only
   writes when told to.

   What it sets, and nothing else:
     所属や部署名   printed verbatim on the 届 and the 交通費調査書
     働き方         始業 and 終業, which decide what counts as overtime
     通勤経路       one leg: 交通機関 / 乗車駅 / 到着駅 / 片道料金 / 定期代
     マイページ     opens the new entry point, and with it 勤怠 and 旅費精算

   Everything else on a person's record is left exactly as it is: the name,
   the 地区, the addresses, the consent, the step history. It adds nobody
   and removes nobody — a 社員№ that is not already on the site is reported
   and the run refuses, because this file carries no address or 地区 to
   create anybody properly with.

     node tools/iit-import.mjs --xlsx IITメンバー所属一覧.xlsx \
       --url https://dx.morabu.com/pedometer --admin kenkou@morabu.com
     node tools/iit-import.mjs ... --apply     # and write it

   A member whose 交通費調査書 has not arrived yet — シンアマン, at the time
   of writing — is listed and skipped, not treated as a failure. Their 所属
   and 働き方 still go in.
   ========================================================================= */

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

/* ----------------------------- arguments -------------------------------- */
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const XLSX = arg('xlsx');
const URL_ = (arg('url') || 'http://127.0.0.1:8787').replace(/\/$/, '');
const ADMIN = arg('admin') || 'kenkou@morabu.com';
const APPLY = process.argv.includes('--apply');
/* Refusing on a 社員№ that is not on the 名簿 is the right default — it is
   usually a typo, and creating somebody from a file with no address and no
   地区 would make a broken record. But when the committee are still deciding
   whether four people belong on the 名簿 at all, that default holds up the
   other nine for no reason. This says "I know, go on without them". */
const SKIP_MISSING = process.argv.includes('--skip-missing');

if (!XLSX || !fs.existsSync(XLSX)) {
  console.error('\n  --xlsx <IITメンバー所属一覧.xlsx> is required.\n');
  process.exit(1);
}

/* ------------------------------ helpers --------------------------------- */
/* The sheet is typed by hand, so full-width digits, colons and tildes all
   turn up. Normalise before reading anything out of it. */
const wide = (s) => String(s ?? '')
  .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .replace(/[：]/g, ':').replace(/[〜～]/g, '~')
  /* －(full width) and −(minus), but never ー: that one is the katakana
     長音符 and belongs to the name. ソニユーワン is not ソニユ-ワン. */
  .replace(/[－−]/g, '-')
  .replace(/　/g, ' ')
  .trim();

/* A cell written in Excel can be a string, a formula with a cached result,
   a date, or — as every header on this sheet is — richText, a list of runs
   with their own fonts. One reader for all of them, or the headers come out
   as [object Object] and nothing is ever found. */
const textOf = (v) => {
  if (v == null) return '';
  if (typeof v !== 'object') return wide(v);
  if (Array.isArray(v.richText)) return wide(v.richText.map((r) => r.text).join(''));
  if (v.text != null) return wide(v.text);
  if (v.result != null) return wide(v.result);
  if (v instanceof Date) return wide(v.toISOString().slice(0, 10));
  return '';
};
const cell = (row, i) => textOf(row.getCell(i).value);

/* 新⻑⽥216 on the sheet is not 新長田216. The ⻑ is U+2ED1 and the ⽥ is
   U+2F65 — characters from the Kangxi radical blocks that an IME offers
   next to the real kanji and that look all but identical in most fonts.
   This string prints on the 届 and the 交通費調査書, so it is not ours to
   quietly rewrite; and a search for 新長田 will never find it. Reported,
   with the correction, for the committee to make in their own file.

   NFKC maps the Kangxi block (U+2F00–) back to ordinary ideographs but has
   nothing for the Radicals Supplement (U+2E80–), so it cannot be the fix on
   its own — it is used only to suggest what the character ought to be. */
const RADICALS = /[\u2E80-\u2FDF]/g;
const RADICAL_HINT = { '\u2ED1': '長', '\u2E8C': '小', '\u2ECC': '衣' };
const suspectChars = (text) => [...new Set(String(text).match(RADICALS) || [])]
  .map((c) => {
    const guess = RADICAL_HINT[c] || (c.normalize('NFKC') !== c ? c.normalize('NFKC') : '?');
    return `${c} (U+${c.codePointAt(0).toString(16).toUpperCase()} → ${guess})`;
  });

const normId = (v) => wide(v).replace(/\D/g, '');
/* Names are written with and without spaces in different places — the site
   has モハメド ロシャン where the sheet has モハメドロシャン — so they are
   compared with the spaces taken out, and only ever to catch a wrong 社員№. */
const normName = (v) => wide(v).replace(/[\s・]/g, '');

/** 「8:45~17:15」 → { start: '08:45', end: '17:15' } */
const hours = (v) => {
  const m = /^(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})$/.exec(wide(v));
  if (!m) return null;
  const pad = (h, mm) => `${String(Number(h)).padStart(2, '0')}:${mm}`;
  return { start: pad(m[1], m[2]), end: pad(m[3], m[4]) };
};

const yen = (v) => {
  const c = wide(v).replace(/[^\d.-]/g, '');
  if (!c || c === '-' || c === '.') return null;
  const n = Math.round(Number(c));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/* ------------------------------- the sheet ------------------------------ */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);

const sheet = (name) => {
  const ws = wb.worksheets.find((w) => w.name === name);
  if (!ws) {
    console.error(`\n  The workbook has no ${name} sheet. It holds: ${wb.worksheets.map((w) => w.name).join(', ')}\n`);
    process.exit(1);
  }
  return ws;
};

/* Find the header by what is written on it rather than by a row number: the
   sheet opens with a merged title and a date, and a row inserted above the
   table would otherwise silently shift every column. Real column numbers are
   kept, not positions in a list — eachCell skips the blanks. */
const headerRow = (ws, must) => {
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r += 1) {
    const cols = [];
    ws.getRow(r).eachCell((c, col) => cols.push({ col, text: textOf(c.value) }));
    if (must.every((m) => cols.some((c) => c.text.includes(m)))) return { row: r, cols };
  }
  console.error(`\n  Could not find a header row on ${ws.name} with: ${must.join(', ')}\n`);
  process.exit(1);
};

/** The column whose header contains `needle`. */
const colOf = (cols, needle) => {
  const hit = cols.find((c) => c.text.includes(needle));
  if (!hit) {
    console.error(`\n  ${needle} is not a column on this sheet. Found: ${cols.map((c) => c.text).filter(Boolean).join(' | ')}\n`);
    process.exit(1);
  }
  return hit.col;
};

/* --- メンバー一覧: 所属 and 働き方 --- */
const mem = sheet('メンバー一覧');
const mh = headerRow(mem, ['氏名', '社員', '働き方']);
const cName = colOf(mh.cols, '氏名');
const cId = colOf(mh.cols, '社員');
const cAff = colOf(mh.cols, '所属');
const cHours = colOf(mh.cols, '働き方');

const people = new Map();
for (let r = mh.row + 1; r <= mem.rowCount; r += 1) {
  const row = mem.getRow(r);
  const id = normId(cell(row, cId));
  if (!id) continue;
  const hrs = hours(cell(row, cHours));
  if (!hrs) {
    console.error(`REFUSING: ${id} ${cell(row, cName)} has 働き方 「${cell(row, cHours)}」, which is not a 始業〜終業.`);
    process.exit(1);
  }
  people.set(id, {
    id,
    sheetName: cell(row, cName),
    affiliation: cell(row, cAff),
    workStart: hrs.start,
    workEnd: hrs.end,
    commute: [],
    noRoute: '',
  });
}

/* --- 交通費: the commute --- */
const tr = sheet('交通費');
const th = headerRow(tr, ['氏名', '社員', '交通機関']);
const tId = colOf(th.cols, '社員');
const tCarrier = colOf(th.cols, '交通機関');
const tFrom = colOf(th.cols, '最寄り駅');
const tTo = colOf(th.cols, '到着駅');
const tOne = colOf(th.cols, '片道');
const tPass = colOf(th.cols, '定期');
const tNote = th.cols.some((c) => c.text.includes('備考')) ? colOf(th.cols, '備考') : null;

for (let r = th.row + 1; r <= tr.rowCount; r += 1) {
  const row = tr.getRow(r);
  const id = normId(cell(row, tId));
  if (!id) continue;
  const p = people.get(id);
  if (!p) {
    console.error(`REFUSING: 社員№ ${id} is on the 交通費 sheet but not on メンバー一覧.`);
    process.exit(1);
  }
  const carrier = cell(row, tCarrier);
  const from = cell(row, tFrom);
  const to = cell(row, tTo);
  const oneWay = yen(cell(row, tOne));
  const pass = yen(cell(row, tPass));
  if (!carrier && !from && !to && oneWay == null && pass == null) {
    p.noRoute = tNote ? cell(row, tNote) : '';
    continue;
  }
  if (oneWay == null || pass == null) {
    console.error(`REFUSING: ${id} ${p.sheetName} has a route but a missing fare `
      + `(片道 ${JSON.stringify(cell(row, tOne))}, 定期 ${JSON.stringify(cell(row, tPass))}).`);
    process.exit(1);
  }
  p.commute = [{ carrier, from, to, oneWay, pass }];
}

console.log(`\n  ${people.size} members on the sheet.\n`);

/* ------------------------------- the site ------------------------------- */
let cookie = '';
const api = async (path, opts = {}) => {
  const res = await fetch(`${URL_}${path}`, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers || {}) },
  });
  const set = res.headers.getSetCookie?.() || [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  if (!res.ok) {
    console.error(`\n  ${path} → ${res.status} ${(await res.text()).slice(0, 200)}\n`);
    process.exit(1);
  }
  return res.json();
};

await api('/api/login', { method: 'POST', body: JSON.stringify({ id: ADMIN }) });
const current = (await api('/api/kv?key=roster')).value || [];
const byId = new Map(current.map((p) => [normId(p.id), p]));

/* Nobody is created from this file — it has no address and no 地区. */
const missing = [...people.values()].filter((p) => !byId.has(p.id));
if (missing.length && !SKIP_MISSING) {
  console.error(`REFUSING: ${missing.length} of them are not on the site's 名簿 at all:`);
  missing.forEach((p) => console.error(`   ${p.id} ${p.sheetName}`));
  console.error('\n  This file carries no メールアドレス or 地区, so they cannot be added');
  console.error('  properly from it. Ask 健康対策委員会 to put them on the 名簿 first.');
  console.error('  To go ahead with the rest meanwhile: --skip-missing\n');
  process.exit(1);
}
if (missing.length) {
  console.log(`SKIPPING: ${missing.length} are not on the 名簿 and are left out of this run.`);
  missing.forEach((p) => console.log(`   ${p.id} ${p.sheetName}`));
  console.log('      Nothing is created for them. Add them to the 名簿, then run this again —');
  console.log('      it is safe to repeat and will only touch what is still different.\n');
  for (const p of missing) people.delete(p.id);
}

/* A 社員№ typed one digit out would otherwise quietly rewrite a stranger. */
const mismatched = [...people.values()].filter((p) => {
  const was = byId.get(p.id);
  return normName(was.name) !== normName(p.sheetName);
});
if (mismatched.length) {
  console.error(`REFUSING: ${mismatched.length} 社員№ point at a different name on the site:`);
  mismatched.forEach((p) => console.error(`   ${p.id}  sheet: ${p.sheetName}   site: ${byId.get(p.id).name}`));
  console.error('\n  One of the two is wrong. Check before writing anything.\n');
  process.exit(1);
}

/* ------------------------------ the report ------------------------------ */
const money = (n) => (n == null ? '—' : `¥${n.toLocaleString('en-US')}`);
const routeOf = (c) => (c?.length
  ? c.map((l) => `${l.carrier} ${l.from}→${l.to} ${money(l.oneWay)} / 定期 ${money(l.pass)}`).join(' + ')
  : '—');

const changes = [];
const next = current.map((was) => {
  const p = people.get(normId(was.id));
  if (!p) return was;
  const after = {
    ...was,
    affiliation: p.affiliation,
    workStart: p.workStart,
    workEnd: p.workEnd,
    mypage: true,
    ...(p.commute.length ? { commute: p.commute } : {}),
  };
  const diffs = [];
  if ((was.affiliation || '') !== after.affiliation) diffs.push(['所属', was.affiliation || '—', after.affiliation]);
  if ((was.workStart || '') !== after.workStart || (was.workEnd || '') !== after.workEnd) {
    diffs.push(['働き方', `${was.workStart || '—'}–${was.workEnd || '—'}`, `${after.workStart}–${after.workEnd}`]);
  }
  if (routeOf(was.commute) !== routeOf(after.commute)) diffs.push(['通勤', routeOf(was.commute), routeOf(after.commute)]);
  if (!was.mypage) diffs.push(['マイページ', 'off', 'on']);
  if (diffs.length) changes.push({ p, was, diffs });
  return after;
});

for (const { p, diffs } of changes) {
  console.log(`  ${p.id}  ${p.sheetName}`);
  for (const [what, from, to] of diffs) console.log(`      ${what.padEnd(6)} ${from}  →  ${to}`);
  console.log();
}

const odd = [...people.values()]
  .map((p) => ({ p, chars: suspectChars(p.affiliation) }))
  .filter((x) => x.chars.length);
if (odd.length) {
  console.log(`WARNING: ${odd.length} 所属 contain radical-block look-alikes rather than kanji.`);
  console.log('         They print on the 届 and the 交通費調査書 as written, and a search');
  console.log('         for the real kanji will not find them. Worth asking 健康対策委員会');
  console.log('         to retype them in the sheet rather than fixing it here.');
  for (const { p, chars } of odd) console.log(`   ${p.id} ${p.sheetName}  ${p.affiliation}  —  ${chars.join(', ')}`);
  console.log();
}

const noRoute = [...people.values()].filter((p) => !p.commute.length);
if (noRoute.length) {
  console.log(`NOTE: ${noRoute.length} have no 通勤経路 on the sheet. 所属 and 働き方 still go in;`);
  console.log('      the route stays empty until the 交通費調査書 arrives.');
  noRoute.forEach((p) => console.log(`   ${p.id} ${p.sheetName}${p.noRoute ? `  — ${p.noRoute}` : ''}`));
  console.log();
}

if (next.length !== current.length) {
  console.error(`REFUSING: the roster changed length, ${current.length} → ${next.length}.`);
  process.exit(1);
}

console.log(`result: ${changes.length} of ${people.size} members change; `
  + `${current.length} on the roster, untouched in number.`);
console.log(`        ${next.filter((p) => p.mypage).length} will have マイページ open.\n`);

if (!APPLY) {
  fs.writeFileSync('/tmp/iit-next.json', JSON.stringify(next, null, 1));
  console.log('Nothing written. Pass --apply to write it. Preview: /tmp/iit-next.json');
  process.exit(0);
}

await api('/api/kv', { method: 'PUT', body: JSON.stringify({ key: 'roster', value: next }) });
const after = (await api('/api/kv?key=roster')).value || [];
const on = after.filter((p) => p.mypage);
console.log(`written. ${on.length} members now have マイページ open:`);
on.forEach((p) => console.log(`   ${p.id} ${p.name}  ${p.workStart}–${p.workEnd}  ${p.affiliation}`));
