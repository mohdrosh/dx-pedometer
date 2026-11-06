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

/**
 * The workbook. One worksheet per office, which is one page per office.
 */
export async function buildSheet({
  ship = '', arrive = '', pickup = '', lines = [], list = [], offices = [],
} = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'モラエッグ';
  const taken = new Set();
  const made = pages({ lines, list, offices });

  for (const p of made) {
    const ws = wb.addWorksheet(sheetName(p.office, taken), {
      pageSetup: {
        paperSize: 9,            /* A4 */
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,          /* long lists run on rather than shrink */
        margins: {
          left: 0.6, right: 0.5, top: 0.7, bottom: 0.6, header: 0.3, footer: 0.3,
        },
      },
    });
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

    const hdr = ws.addRow(['名前', 'パック数', '用途']);
    hdr.font = { bold: true, color: { argb: NAVY } };
    hdr.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADBG } };
      c.border = {
        top: { style: 'thin', color: { argb: RULE } },
        left: { style: 'thin', color: { argb: RULE } },
        bottom: { style: 'thin', color: { argb: RULE } },
        right: { style: 'thin', color: { argb: RULE } },
      };
    });

    for (const who of p.people) {
      const r = ws.addRow([who.name, who.got, purposeJa(who.purpose)]);
      r.eachCell((c) => {
        c.border = {
          top: { style: 'thin', color: { argb: RULE } },
          left: { style: 'thin', color: { argb: RULE } },
          bottom: { style: 'thin', color: { argb: RULE } },
          right: { style: 'thin', color: { argb: RULE } },
        };
      });
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
