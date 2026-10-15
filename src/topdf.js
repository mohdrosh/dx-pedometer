/* ============================================================================
   xlsx → PDF
   健康対策委員会:「出力は今のExcelの形式でかまいません。日々の入力がその形式
   に流れて、PDF等でダウンロードできるようにしてください。」

   So the PDF has to be their form, not a web page that resembles it — which
   means converting the workbook the system already builds rather than laying
   the same thing out twice and letting the two drift.

   LibreOffice does the conversion. It is the only thing that reads xlsx with
   its merges, borders and print area and writes a faithful page, and it is
   already how anyone would do this by hand.

   Two things it needs, and the machine is checked for both rather than being
   assumed:

     soffice on the PATH. Without it the route says so plainly instead of
     failing somewhere deep in a spawn.

     A Japanese font. Without one every character is a box and the file looks
     converted but is unreadable — the worst way for this to go wrong, since
     nothing errors.

   Each conversion gets its own profile directory. LibreOffice keeps a lock in
   the shared one and two at once would otherwise queue behind each other or
   fail outright, which on a form everybody downloads at the end of the month
   is exactly when it would happen.
   ========================================================================= */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const run = promisify(execFile);

export class PdfUnavailable extends Error {
  constructor(why) { super(why); this.code = 'pdf_unavailable'; this.why = why; }
}

let checked = null;

/** Whether this machine can convert, cached — it cannot change under us. */
export async function pdfReady() {
  if (checked) return checked;
  let soffice = false;
  try { await run('soffice', ['--version'], { timeout: 60_000 }); soffice = true; } catch { /* not installed */ }

  let font = false;
  try {
    const { stdout } = await run('fc-list', [':lang=ja', 'family'], { timeout: 20_000 });
    font = stdout.trim().length > 0;
  } catch { font = false; }

  checked = { ok: soffice && font, soffice, font };
  return checked;
}

/**
 * Convert a workbook to PDF.
 * @param {Buffer} xlsx   the workbook as built
 * @returns {Promise<Buffer>} the PDF
 */
export async function xlsxToPdf(xlsx) {
  const ready = await pdfReady();
  if (!ready.ok) {
    throw new PdfUnavailable(!ready.soffice ? 'libreoffice' : 'font');
  }

  const tag = crypto.randomBytes(8).toString('hex');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `pdf-${tag}-`));
  const src = path.join(dir, 'sheet.xlsx');
  const profile = path.join(dir, 'profile');

  try {
    await fs.writeFile(src, xlsx);
    await run('soffice', [
      '--headless', '--norestore', '--nolockcheck',
      `-env:UserInstallation=file://${profile}`,
      '--convert-to', 'pdf', '--outdir', dir, src,
    ], { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });

    const out = path.join(dir, 'sheet.pdf');
    const pdf = await fs.readFile(out);
    /* It exits 0 having written nothing when it dislikes the input, so the
       file is checked rather than the exit code. */
    if (!pdf.length || pdf.subarray(0, 4).toString() !== '%PDF') {
      throw new PdfUnavailable('convert');
    }
    return pdf;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
