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

/* ---------------------------------------------------------------------------
   The look.

   One typeface, three sizes, two inks and one rule weight for the whole
   document. The first version set a font only on the cells it styled,
   which left every plain cell on exceljs' default — Calibri, which has
   no Japanese, so LibreOffice substituted a gothic for the 漢字 and kept
   Calibri for the digits. Two typefaces in one row is what made the
   tables look assembled rather than printed, so every cell now gets the
   same font object.

   The name is the one Ubuntu installs with fonts-noto-cjk, which is what
   the converter has on the server. If it is ever missing LibreOffice
   substitutes a gothic for all of it at once, which stays uniform.
   --------------------------------------------------------------------------- */
const FONT = 'Noto Sans CJK JP';
const NAVY = 'FF14306E';   /* headings */
const INK = 'FF2C3645';    /* body */
const SUB = 'FF78849A';    /* captions */
const RULE = 'FFE4E9F1';   /* between rows */
const EDGE = 'FFB9C5DC';   /* under a header, above a total */

const F = (over = {}) => ({ name: FONT, size: 10, color: { argb: INK }, ...over });

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

/* A4 portrait, fit to one column; a long list runs on to a second sheet
   of paper rather than shrinking away.

   Every sheet is laid out to the same total column width, which is what
   keeps the type the same size from page to page: fit-to-width scales
   each sheet on its own, so a narrow box sheet printed beside a wide
   summary came out visibly larger. */
const PAGE = {
  paperSize: 9,
  orientation: 'portrait',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  margins: {
    left: 0.6, right: 0.55, top: 0.75, bottom: 0.6, header: 0.3, footer: 0.3,
  },
};

/* The week and the page number print in the footer, so no row of any
   table has to carry them. */
const foot = (ship) => {
  const f = `&"${FONT}"&8モラエッグ　${jpDate(ship)}発送分`;
  return { oddFooter: `&L${f}&R&"${FONT}"&8&P / &N`, evenFooter: `&L${f}&R&"${FONT}"&8&P / &N` };
};

/* Rows are left to size themselves: a wrapped address needs two lines
   and a fixed height clipped it. */
const sheet = (wb, name, ship) => {
  const ws = wb.addWorksheet(name, { pageSetup: PAGE, headerFooter: foot(ship) });
  ws.properties.defaultRowHeight = 16;
  return ws;
};

/** Every cell in one font, so a row is never two typefaces. */
const put = (ws, cells, font = F()) => {
  const r = ws.addRow(cells);
  r.eachCell({ includeEmpty: true }, (c) => { c.font = font; });
  return r;
};

/** A single hairline under a row — the only rule the tables use. */
const under = (row, argb = RULE, style = 'thin') => {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.border = { bottom: { style, color: { argb } } };
  });
};

/** A line of text on its own, outside any table. */
const line = (ws, text, over = {}) => {
  const r = put(ws, [text], F(over));
  return r;
};

const gap = (ws, height = 7) => { ws.addRow([]).height = height; };

/**
 * A column heading row: small, bold, grey-navy, with one rule beneath it.
 * No fill — the rule does the separating, and a block of colour across
 * the top of every table was most of what made the document look busy.
 */
const headRow = (ws, cells, right = []) => {
  const r = put(ws, cells, F({ size: 9, bold: true, color: { argb: NAVY } }));
  r.height = 19;
  r.eachCell({ includeEmpty: true }, (c, i) => {
    c.alignment = right.includes(i)
      ? { vertical: 'middle', horizontal: 'right', indent: 1 }
      : { vertical: 'middle', horizontal: 'left' };
  });
  under(r, EDGE, 'medium');
  return r;
};

/** A body row: same font, numbers right, one hairline beneath. */
const bodyRow = (ws, cells, right = []) => {
  const r = put(ws, cells);
  r.eachCell({ includeEmpty: true }, (c, i) => {
    c.alignment = right.includes(i)
      ? { vertical: 'middle', horizontal: 'right', indent: 1 }
      : { vertical: 'middle', horizontal: 'left' };
  });
  under(r);
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
function summary(wb, { ship, arrive, arriveBy, pickup, made, harvest, missed }) {
  const ws = sheet(wb, '発送一覧', ship);
  /* The address column is wide and wraps. At 44 it was clipping —
     「…京町栄光ビルディン」 — and a cut address on the one sheet the
     committee files is the sheet failing at its job. */
  ws.columns = [{ width: 22 }, { width: 52 }, { width: 11 }, { width: 9 }];

  const head = line(ws, 'モラエッグ　発送一覧', { size: 16, bold: true, color: { argb: NAVY } });
  head.height = 24;
  line(ws, `${jpDate(ship)}発送分`, { size: 10, bold: true });
  /* 2026/11/12:「東京はさらに1日後」. Rather than a column on a table
     whose widths are shared with every other sheet, the offices that do
     not arrive with the rest are named on the line, and on an ordinary
     week where they all land together there is nothing extra to read. */
  const late = made
    .filter((p) => arriveBy?.[p.office] && arriveBy[p.office] !== arrive)
    .map((p) => `${p.office}は${jpDate(arriveBy[p.office])}`);
  line(ws, `到着予定：${jpDate(arrive)}${late.length ? `（${late.join('、')}）` : ''}`
    + `　受け取り期限：${jpDate(pickup)}`, { size: 9, color: { argb: SUB } });
  gap(ws, 12);

  headRow(ws, ['事業所', '所在地', 'パック数', '人数'], [3, 4]);
  let packs = 0;
  let people = 0;
  for (const p of made) {
    packs += p.packs;
    people += p.people.length;
    const r = bodyRow(ws, [p.office, p.address, p.packs, p.people.length], [3, 4]);
    r.getCell(2).font = F({ size: 9, color: { argb: SUB } });
    r.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
  }
  const tot = put(ws, ['合計', '', packs, people], F({ bold: true, color: { argb: NAVY } }));
  tot.eachCell({ includeEmpty: true }, (c, i) => {
    c.alignment = i >= 3
      ? { vertical: 'middle', horizontal: 'right', indent: 1 }
      : { vertical: 'middle', horizontal: 'left' };
    c.border = { bottom: { style: 'medium', color: { argb: EDGE } } };
  });

  const note = [];
  if (harvest != null) note.push(`丹波の取れ高：${harvest}パック`);
  if (missed) note.push(`今回受け取れなかった方：${missed}名`);
  if (note.length) {
    gap(ws, 6);
    line(ws, note.join('　'), { size: 9, color: { argb: SUB } });
  }
  gap(ws, 14);

  /* Everyone, under the office they collect at. The box sheets split the
     same list seven ways; this is the one place it can be read straight
     through. */
  headRow(ws, ['事業所', '名前', 'パック数', '用途'], [3]);
  for (const p of made) {
    if (!p.people.length) {
      const r = bodyRow(ws, [p.office, '（リクエストはありません）', '', '']);
      r.getCell(2).font = F({ color: { argb: SUB } });
      continue;
    }
    for (const who of p.people) {
      bodyRow(ws, [p.office, who.name, who.got, purposeJa(who.purpose)], [3]);
    }
  }
}

/**
 * The workbook: 発送一覧 first, then one worksheet per office, which is
 * one page per office.
 */
export async function buildSheet({
  ship = '', arrive = '', arriveBy = null, pickup = '', lines = [], list = [],
  offices = [], harvest = null, missed = 0,
} = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'モラエッグ';
  const taken = new Set();
  const made = pages({ lines, list, offices });
  if (made.length) summary(wb, { ship, arrive, arriveBy, pickup, made, harvest, missed });

  for (const p of made) {
    const ws = sheet(wb, sheetName(p.office, taken), ship);
    /* 22+52+11+9 — the same 94 as the summary, so both print at the
       same scale and the type matches across the document. */
    ws.columns = [{ width: 60 }, { width: 17 }, { width: 17 }];

    const head = line(ws, p.office, { size: 16, bold: true, color: { argb: NAVY } });
    head.height = 24;
    /* The address under the name, as it is on every screen. */
    if (p.address) line(ws, p.address, { size: 9, color: { argb: SUB } });
    const n = line(ws, `発送するパック数：${p.packs}パック`, { size: 12, bold: true });
    n.height = 20;
    if (p.extra > 0) {
      line(ws, `（リクエスト${p.requested}パック＋余り${p.extra}パック）`, { size: 9, color: { argb: SUB } });
    }
    line(ws, `到着予定：${jpDate(arriveBy?.[p.office] || arrive)}`
      + `　受け取り期限：${jpDate(pickup)}`, { size: 9, color: { argb: SUB } });
    gap(ws, 12);

    headRow(ws, ['名前', 'パック数', '用途'], [2]);
    for (const who of p.people) {
      bodyRow(ws, [who.name, who.got, purposeJa(who.purpose)], [2]);
    }
    /* An office can be shipped to with nobody named on it: 本社 takes the
       spare packs whether or not anybody there asked. Saying so is
       better than a header with nothing under it, which reads like the
       list failed to print. */
    if (!p.people.length) {
      line(ws, '（リクエストはありません）', { color: { argb: SUB } });
    }
  }

  /* A workbook with no sheets cannot be written, and a week where no
     office is being shipped to is a real state — the caller is told so
     rather than handed a file that will not open. */
  if (!made.length) return null;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
