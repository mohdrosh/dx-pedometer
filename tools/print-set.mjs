/* ============================================================================
   public/moraegg/print-set.pdf — 佐野's three printables on one A4 sheet.

   The page used to offer them as three separate .webp links: three tabs,
   three print dialogs, and a picture that prints at whatever size the
   browser felt like. One PDF instead, at real sizes, several of each,
   with dashed guides to cut along.

   Built here rather than on the server: the artwork changes only when she
   sends new files, and a sheet made at build time needs no converter in
   production. Re-run it after replacing any of the three images:

     node tools/print-set.mjs

   Chromium comes from the dev dependency that already drives the UI
   tests; nothing in the running site depends on it.
   ========================================================================= */
import { createRequire } from 'node:module';
import { writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'public', 'moraegg');
/* The page is written into the artwork's own folder and opened from
   there: Chromium will not load file:// images into a page it was handed
   as a string, and relative paths keep the markup readable. */
const cut = (file, w, h, n) => Array.from({ length: n }, () => (
  `<div class="cut"><img src="${file}" style="width:${w}mm;height:${h}mm"></div>`
)).join('');

/* Chromium embeds each image at whatever resolution the file has, and
   the originals are 1200px wide — around 800dpi at the sizes they print
   at, which made a 2MB sheet for three stickers. A 300dpi copy is as
   good as any office printer can manage and a fifth of the weight.
   Needs ImageMagick; without it the sheet is still correct, only
   heavier. */
const dpiPx = (mm) => Math.round((mm / 25.4) * 300);
const small = (file, wmm) => {
  const out = `.small-${file.replace(/\.webp$/, '')}.png`;
  try {
    execFileSync('convert', [
      path.join(dir, file), '-resize', `${dpiPx(wmm)}x`, path.join(dir, out),
    ]);
    return out;
  } catch { return file; }
};

/* Real sizes, in millimetres, keeping each image's own proportions:
     label      1200x666  → 90 x 50
     seal       1200x1200 → 38 x 38
     thank-you   942x1200 → 45 x 57  */
const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<style>
  @page { size: A4 portrait; margin: 10mm; }
  *{box-sizing:border-box}
  body{margin:0;font-family:"Noto Sans CJK JP","IPAPGothic",sans-serif;color:#14306E}
  h1{margin:0 0 1mm;font-size:13pt;font-weight:800}
  p.lead{margin:0 0 6mm;font-size:8.5pt;color:#5B6B86}
  h2{margin:0 0 2mm;font-size:9.5pt;font-weight:800}
  h2 span{font-weight:600;color:#78849A;padding-left:6px}
  section{margin-bottom:7mm}
  .row{display:flex;flex-wrap:wrap;gap:4mm}
  .cut{border:0.3mm dashed #B9C5DC;padding:1.5mm;line-height:0}
  .cut img{display:block}
  footer{margin-top:4mm;font-size:7.5pt;color:#8894A8}
</style></head><body>
  <h1>モラエッグ　印刷して使えます</h1>
  <p class="lead">点線にそって切り取ってお使いください。</p>

  <section>
    <h2>たまごパックのラベル<span>採卵日を手書きできます</span></h2>
    <div class="row">
      ${cut(small('label-asadore.webp', 90), 90, 50, 2)}
    </div>
  </section>

  <section>
    <h2>丹波のたまごシール<span>パックのふたに</span></h2>
    <div class="row">
      ${cut(small('seal-round.webp', 38), 38, 38, 4)}
    </div>
  </section>

  <section>
    <h2>ありがとうカード<span>おすそわけに添えて</span></h2>
    <div class="row">
      ${cut(small('thankyou-egg.webp', 45), 45, 57, 3)}
    </div>
  </section>

  <footer>モラブ阪神工業株式会社　モラエッグ</footer>
</body></html>`;

const out = path.join(dir, 'print-set.pdf');
const tmp = path.join(dir, '.print-set.html');
await writeFile(tmp, html);
const b = await chromium.launch({ args: ['--no-proxy-server', '--no-sandbox'] });
const p = await b.newPage();
await p.goto(`file://${tmp}`, { waitUntil: 'load' });
await p.pdf({ path: out, format: 'A4', printBackground: true });
await b.close();
await rm(tmp);
/* The resized copies are scaffolding, not artwork. */
for (const f of ['label-asadore', 'seal-round', 'thankyou-egg']) {
  await rm(path.join(dir, `.small-${f}.png`), { force: true });
}
console.log('wrote', out);
