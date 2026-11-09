/* 箱に入れる紙 — the pages, their order, and who lands on which.

   The workbook's bytes are not the interesting part; what matters is
   that each box gets one page, that the page names the office it is
   going into, and that the people on it are the people who will open
   that box. So `pages()` is the thing under test, and the workbook is
   checked once for being a real file with a sheet per office. */
import { createRequire } from 'node:module';
import { pages, sheetName, buildSheet } from '../src/egg-sheet.js';

const ExcelJS = createRequire(import.meta.url)('exceljs');

let n = 0; let bad = 0;
const ok = (w, c, x = '') => {
  n += 1; if (!c) { bad += 1; console.log(`  XX  ${w}${x ? `   ${x}` : ''}`); }
};
const is = (w, got, want) => ok(w, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const OFFICES = [
  { name: '本社（神戸）', address: '神戸市中央区' },
  { name: '東京', address: '千代田区' },
  { name: '大阪', address: '' },
  { name: '姫路', address: '姫路市' },
];

/* ---- which offices get a page ----------------------------------------- */
{
  const p = pages({
    offices: OFFICES,
    lines: [
      { office: '東京', packs: 1, requested: 1, extra: 0 },
      { office: '本社（神戸）', packs: 33, requested: 1, extra: 32 },
      { office: '姫路', packs: 0, requested: 2, extra: 0 },
    ],
    list: [
      { name: 'A', office: '東京', got: 1, purpose: 'work' },
      { name: 'B', office: '本社（神戸）', got: 1, purpose: 'private' },
      { name: 'C', office: '姫路', got: 0, purpose: 'private' },
    ],
  });
  is('an office getting no box gets no page', p.length, 2);
  ok('and it is the one with nought packs', !p.some((x) => x.office === '姫路'));
  /* Her order, which is the order the boxes are lined up in — not the
     order the allocation happened to produce. */
  is('the pages come in her office order', p.map((x) => x.office).join(','),
    '本社（神戸）,東京');
  is('each page carries its address', p[0].address, '神戸市中央区');
  is('and its pack count', p[0].packs, 33);
  is('the spare is kept so the page can explain itself', p[0].extra, 32);
}

/* ---- who is on which page --------------------------------------------- */
{
  const p = pages({
    offices: OFFICES,
    lines: [{ office: '本社（神戸）', packs: 7, requested: 7, extra: 0 },
      { office: '東京', packs: 2, requested: 2, extra: 0 }],
    /* 「その事業所で受け取る人の一覧」. The week's list records where each
       person collects, which for somebody moved to 本社 is not where
       they asked — and the sheet has to follow the box, not the
       request, or a moved person is missing from the page in the box
       they will actually open. */
    list: [
      { name: '山田', office: '本社（神戸）', got: 4, purpose: 'private', moved: false },
      { name: '鈴木', office: '本社（神戸）', got: 3, purpose: 'private', moved: true },
      { name: '田中', office: '東京', got: 2, purpose: 'work' },
    ],
  });
  const hq = p.find((x) => x.office === '本社（神戸）');
  is('everybody collecting there is on that page', hq.people.length, 2);
  ok('including somebody moved there from elsewhere',
    hq.people.some((x) => x.name === '鈴木'));
  ok('and nobody from another office', !hq.people.some((x) => x.name === '田中'));
  is('the packs are per person, not the office total', hq.people[0].got, 4);
}

/* ---- an office shipped to with nobody named --------------------------- */
{
  const p = pages({
    offices: OFFICES,
    lines: [{ office: '本社（神戸）', packs: 32, requested: 0, extra: 32 }],
    list: [],
  });
  is('it still gets its page', p.length, 1);
  is('with an empty list rather than none', Array.isArray(p[0].people), true);
}

/* ---- sheet names Excel will take -------------------------------------- */
{
  const taken = new Set();
  is('an ordinary name is left alone', sheetName('本社（神戸）', taken), '本社（神戸）');
  ok('a slash cannot reach the workbook', !sheetName('東京/品川', new Set()).includes('/'));
  for (const ch of [':', '\\', '?', '*', '[', ']']) {
    ok(`nor a ${ch}`, !sheetName(`X${ch}Y`, new Set()).includes(ch));
  }
  ok('a very long name is cut to what Excel allows',
    sheetName('あ'.repeat(60), new Set()).length <= 31);
  const t2 = new Set();
  sheetName('大阪', t2);
  ok('and two offices that collapse to the same name still both appear',
    sheetName('大阪', t2) !== '大阪');
  is('an office with no usable name still gets a page', sheetName('', new Set()), '事業所');
}

/* ---- the workbook itself ---------------------------------------------- */
{
  const buf = await buildSheet({
    ship: '2026-11-23', arrive: '2026-11-25', pickup: '2026-11-27',
    offices: OFFICES,
    lines: [{ office: '本社（神戸）', packs: 3, requested: 3, extra: 0 },
      { office: '東京', packs: 1, requested: 1, extra: 0 }],
    list: [{ name: '山田', office: '本社（神戸）', got: 3, purpose: 'private' },
      { name: '田中', office: '東京', got: 1, purpose: 'work' }],
  });
  ok('it is a real xlsx', Buffer.isBuffer(buf) && buf.subarray(0, 2).toString() === 'PK');
  /* One worksheet per office is what makes one page per office, so it
     is read back out of the file rather than trusted from the loop
     that wrote it. Read back, not grepped: an xlsx is a zip, so the
     sheet names are not in the bytes to be found. */
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf);
  /* 発送一覧 first, then one worksheet per office. The summary page was
     added on 2026/11/09 for 健康対策委員会: the box sheets are each one
     office and nobody holding one can see the week. */
  is('with a summary page and then one per office', back.worksheets.length, 3);
  is('named for the week and then the offices', back.worksheets.map((w) => w.name).join(','),
    '発送一覧,本社（神戸）,東京');

  const all = back.getWorksheet('発送一覧');
  const sum = all.getSheetValues().flat().filter((v) => typeof v === 'string').join(' | ');
  ok('the summary names every office', sum.includes('本社（神戸）') && sum.includes('東京'), sum);
  ok('and gives each address', sum.includes('神戸市中央区'), sum);
  ok('and lists the people under them', sum.includes('山田'), sum);
  ok('and totals the week', sum.includes('合計'), sum);
  const hq = back.getWorksheet('本社（神戸）');
  const text = hq.getSheetValues().flat().filter((v) => typeof v === 'string').join(' | ');
  ok('the page names its office', text.includes('本社（神戸）'), text);
  ok('and gives the address', text.includes('神戸市中央区'), text);
  ok('and the pack count', text.includes('発送するパック数：3パック'), text);
  ok('and the person collecting there', text.includes('山田'), text);
  ok('with 私用 spelled out rather than a code', text.includes('私用'), text);
  /* 本社 with no spare should not print a breakdown it does not have. */
  ok('no spare line when there is no spare', !text.includes('余り'), text);
}
{
  const empty = await buildSheet({
    ship: '2026-11-23', offices: OFFICES, lines: [], list: [],
  });
  /* A week shipping nowhere is a real state. A workbook with no sheets
     is not a file that opens, so the caller is told instead. */
  is('a week with no boxes makes no file', empty, null);
}

console.log(bad ? `\n  ${bad} of ${n} failed\n` : `  ${n} checks — one page per box, and the right names on it\n`);
process.exit(bad ? 1 : 0);
