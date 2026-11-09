/* ============================================================================
   箱に入れる紙 — one page per office, for the 丹波 staff to print.

   佐野, 2026/11/06:
     「丹波では、事業所ごとのパック数と、リクエストした人の一覧を印刷して、
      荷物の中に入れたいです。最終確定のあと、丹波の担当者が次のものを PDF で
      ダウンロードできるようにしてください。
        ・事業所ごとのまとめ（事業所名・住所・発送するパック数）
        ・その事業所で受け取る人の一覧（名前・パック数・私用／仕事用）
      できれば事業所ごとに改ページして、箱ごとに入れやすいようにしてください」

   ---------------------------------------------------------------------
   Why a workbook and not a web page.

   The obvious way to make a PDF of something that already exists as HTML
   is to convert the HTML, and that was tried first: LibreOffice reads
   the file, sets the Japanese correctly, and puts all seven offices on
   one page, because its HTML import ignores CSS page breaks. A sheet
   that has to be torn up before it goes in a box is not the thing she
   asked for.

   A workbook has page breaks that LibreOffice does honour, because they
   are not a hint: one worksheet is one page. The same converter already
   carries the 勤怠 forms in production, so this rides a path that is
   known to work on the machine it has to work on, rather than a second
   one that would have to be kept alive beside it.
   ---------------------------------------------------------------------

   Pure: a week in, a workbook buffer out. No database and no converter,
   so the layout can be tested without either.
   ========================================================================= */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const NAVY = 'FF0B296A';
const RULE = 'FFC3CCDA';
const HEADBG = 'FFEAF0FB';

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
const jpDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${m}月${d}日（${DOW_JA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}）`;
};

/** 私用／仕事用, as every other screen writes it. */
const purposeJa = (p) => (p === 'work' ? '仕事用' : '私用');

/**
 * A sheet name Excel will accept.
 *
 * : \ / ? * [ ] are refused outright and 31 characters is the limit, so
 * an office whose name breaks either rule still gets its page instead of
 * taking the whole workbook down with it. 事業所名 are short and plain
 * today; this is here because the names are typed into a form by a
 * person and one of them will eventually have a slash in it.
 */
export function sheetName(name, taken = new Set()) {
  let base = String(name || '').replace(/[:\\/?*[\]]/g, '･').slice(0, 31).trim() || '事業所';
  let out = base;
  for (let n = 2; taken.has(out); n += 1) {
    const tail = `(${n})`;
    out = `${base.slice(0, 31 - tail.length)}${tail}`;
  }
  taken.add(out);
  return out;
}

/**
 * Which offices get a page, in her order, and who is on each.
 *
 * Only offices actually being shipped to: a page for an office getting
 * no box is a sheet of paper with nowhere to go. Offices come in the
 * order the caller gives them — 佐野's order, which is the order the
 * boxes are lined up in.
 */
export function pages({ lines = [], list = [], offices = [] } = {}) {
  const addr = new Map(offices.map((o) => [o.name, o.address || '']));
  const order = offices.map((o) => o.name);
  const rank = (n) => { const i = order.indexOf(n); return i < 0 ? order.length : i; };
  return lines
    .filter((l) => (l.packs || 0) > 0)
    .sort((a, b) => rank(a.office) - rank(b.office))
    .map((l) => ({
      office: l.office,
      address: addr.get(l.office) || '',
      packs: l.packs || 0,
      /* 本社 takes the week's spare packs on top of what was asked for,
         so its sheet can read 33パック above a list of one person asking
         for one. Without the breakdown that looks like a printing
         fault to whoever is filling the box; with it, it is the rule. */
      extra: l.extra || 0,
      requested: l.requested || 0,
      /* 「その事業所で受け取る人」 — the office they collect at, which for
         somebody moved to 本社 is not the one they asked at. The week's
         list already records the collecting office, so a moved person
         appears in the box they will actually open. */
      people: list.filter((r) => r.office === l.office)
        .map((r) => ({ name: r.name, got: r.got || 0, purpose: r.purpose })),
    }));
}

/* The shared page setup: A4 portrait, fit to one column, long lists run
   on to a second sheet of paper rather than shrinking to fit. */
const PAGE = {
  paperSize: 9,
  orientation: 'portrait',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  margins: {
    left: 0.6, right: 0.5, top: 0.7, bottom: 0.6, header: 0.3, footer: 0.3,
  },
};

const ruled = (row) => row.eachCell((c) => {
  c.border = {
    top: { style: 'thin', color: { argb: RULE } },
    left: { style: 'thin', color: { argb: RULE } },
    bottom: { style: 'thin', color: { argb: RULE } },
    right: { style: 'thin', color: { argb: RULE } },
  };
});

const headRow = (ws, cells) => {
  const r = ws.addRow(cells);
  r.font = { bold: true, color: { argb: NAVY } };
  r.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADBG } };
  });
  ruled(r);
  return r;
};

/**
 * The first page: the whole week on one sheet.
 *
 * The per-office pages that follow are for putting in boxes — one each,
 * and nobody holding one of them can see the week. 健康対策委員会 asked
 * for the view the boxes cannot give: every office, what it is getting,
 * and who is collecting it, in one document they can file or hand over.
 *
 * It is the same numbers as the pages behind it, arranged the other way
 * round, so the two can never disagree.
 */
function summary(wb, { ship, arrive, pickup, made, harvest, missed }) {
  const ws = wb.addWorksheet('発送一覧', { pageSetup: PAGE });
  /* The address column is wide and wraps. At 44 it was clipping —
     「…京町栄光ビルディン」 — and a cut address on the one sheet the
     committee files is the sheet failing at its job. */
  ws.columns = [{ width: 22 }, { width: 52 }, { width: 11 }, { width: 9 }];

  const head = ws.addRow(['モラエッグ　発送一覧']);
  head.font = { size: 20, bold: true, color: { argb: NAVY } };
  head.height = 28;
  ws.addRow([`${jpDate(ship)}発送分`]).font = { size: 12, bold: true, color: { argb: NAVY } };
  ws.addRow([`到着予定：${jpDate(arrive)}　受け取り期限：${jpDate(pickup)}`])
    .font = { size: 10, color: { argb: 'FF5B6B86' } };
  ws.addRow([]);

  headRow(ws, ['事業所', '所在地', 'パック数', '人数']);
  let packs = 0;
  let people = 0;
  for (const p of made) {
    packs += p.packs;
    people += p.people.length;
    const r = ws.addRow([p.office, p.address, p.packs, p.people.length]);
    ruled(r);
    r.getCell(2).font = { size: 9, color: { argb: 'FF5B6B86' } };
    r.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
    r.getCell(3).alignment = { horizontal: 'right' };
    r.getCell(4).alignment = { horizontal: 'right' };
  }
  const tot = ws.addRow(['合計', '', packs, people]);
  tot.font = { bold: true, color: { argb: NAVY } };
  ruled(tot);
  tot.getCell(3).alignment = { horizontal: 'right' };
  tot.getCell(4).alignment = { horizontal: 'right' };

  ws.addRow([]);
  const note = [];
  if (harvest != null) note.push(`丹波の取れ高：${harvest}パック`);
  if (missed) note.push(`今回受け取れなかった方：${missed}名`);
  if (note.length) {
    ws.addRow([note.join('　')]).font = { size: 10, color: { argb: 'FF5B6B86' } };
  }
  ws.addRow([]);

  /* Everyone, under the office they collect at. The box sheets split the
     same list seven ways; this is the one place it can be read straight
     through. */
  headRow(ws, ['事業所', '名前', 'パック数', '用途']);
  for (const p of made) {
    if (!p.people.length) {
      const r = ws.addRow([p.office, '（リクエストはありません）', '', '']);
      ruled(r);
      r.getCell(2).font = { size: 10, italic: true, color: { argb: 'FF5B6B86' } };
      continue;
    }
    for (const who of p.people) {
      const r = ws.addRow([p.office, who.name, who.got, purposeJa(who.purpose)]);
      ruled(r);
      r.getCell(3).alignment = { horizontal: 'right' };
    }
  }

  ws.addRow([]);
  ws.addRow([`モラエッグ　${jpDate(ship)}発送分`]).font = {
    size: 9, color: { argb: 'FF8894A8' },
  };
}

/**
 * The workbook: 発送一覧 first, then one worksheet per office, which is
 * one page per office.
 */
export async function buildSheet({
  ship = '', arrive = '', pickup = '', lines = [], list = [], offices = [],
  harvest = null, missed = 0,
} = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'モラエッグ';
  const taken = new Set();
  const made = pages({ lines, list, offices });
  if (made.length) summary(wb, { ship, arrive, pickup, made, harvest, missed });

  for (const p of made) {
    const ws = wb.addWorksheet(sheetName(p.office, taken), { pageSetup: PAGE });
    ws.columns = [{ width: 30 }, { width: 12 }, { width: 12 }];

    const head = ws.addRow([p.office]);
    head.font = { size: 22, bold: true, color: { argb: NAVY } };
    head.height = 30;
    /* The address under the name, as it is on every screen. */
    ws.addRow([p.address]).font = { size: 10, color: { argb: 'FF5B6B86' } };
    const n = ws.addRow([`発送するパック数：${p.packs}パック`]);
    n.font = { size: 15, bold: true, color: { argb: NAVY } };
    n.height = 22;
    if (p.extra > 0) {
      ws.addRow([`（リクエスト${p.requested}パック＋余り${p.extra}パック）`])
        .font = { size: 10, color: { argb: 'FF5B6B86' } };
    }
    ws.addRow([`到着予定：${jpDate(arrive)}　受け取り期限：${jpDate(pickup)}`])
      .font = { size: 10, color: { argb: 'FF5B6B86' } };
    ws.addRow([]);

    headRow(ws, ['名前', 'パック数', '用途']);

    for (const who of p.people) {
      const r = ws.addRow([who.name, who.got, purposeJa(who.purpose)]);
      ruled(r);
      r.getCell(2).alignment = { horizontal: 'right' };
    }
    /* An office can be shipped to with nobody named on it: 本社 takes the
       spare packs whether or not anybody there asked. Saying so is
       better than a header with nothing under it, which reads like the
       list failed to print. */
    if (!p.people.length) {
      ws.addRow(['（リクエストはありません）']).font = {
        size: 10, italic: true, color: { argb: 'FF5B6B86' },
      };
    }

    ws.addRow([]);
    ws.addRow([`モラエッグ　${jpDate(ship)}発送分`]).font = {
      size: 9, color: { argb: 'FF8894A8' },
    };
  }

  /* A workbook with no sheets cannot be written, and a week where no
     office is being shipped to is a real state — the caller is told so
     rather than handed a file that will not open. */
  if (!made.length) return null;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
