/* ============================================================================
   届 — the absence, lateness and holiday-work notice, written into the form.

   The grouping half — which days need a notice at all — is in todoke-runs.js,
   which the browser imports too. This half opens the real blank 届 and types
   into the boxes a person would type into, so nothing about the form is
   redrawn or approximated.
   ========================================================================= */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIND, DOW_JA } from './todoke-runs.js';

export { KIND, noticesFor, todokeFilename } from './todoke-runs.js';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE = path.join(HERE, 'templates', 'todoke.xlsx');
const SHEET = '届（設計開発・請負契約）';

/**
 * Fill the form for one notice.
 *
 * @param {object} o
 *   notice   one entry from noticesFor()
 *   person   { id, name, dept, client }  — client is 出向会社名
 *   reason   理由, which only a person can supply
 *   remark   備考
 *   rules    working hours, for the times on a whole-day notice
 *   today    the date the form is created
 * @returns {Promise<Buffer>}
 */
export async function buildTodoke({ notice, person, reason = '', remark = '', rules, today = new Date() }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`template is missing ${SHEET}`);
  const set = (ref, v) => { ws.getCell(ref).value = v === '' || v == null ? null : v; };

  /* 作成日 */
  set('Z5', today.getFullYear());
  set('AD5', today.getMonth() + 1);
  set('AF5', today.getDate());

  /* who */
  set('V9', person.client || '');      // 出向会社名 — the site they are placed at
  set('R10', person.dept || '');
  set('V11', person.name || '');
  const digits = String(person.id || '').replace(/\D/g, '').slice(-7).padStart(7, ' ');
  ['V', 'W', 'X', 'Y', 'Z', 'AA', 'AB'].forEach((c, i) => {
    set(`${c}13`, digits[i] === ' ' ? null : Number(digits[i]));
  });

  /* 種別 — one box ticked, the rest left as they are */
  const box = KIND[notice.kind];
  if (box) ws.getCell(box.cell).value = '☑';

  /* 期間. A whole-day notice runs the contracted day; 遅刻 covers from the
     start of the day to when they arrived, and 早退 from when they left to
     the end of it, which is the stretch they were not there. */
  const [ws_h, ws_m] = (rules?.workStart || '09:00').split(':').map(Number);
  const [we_h, we_m] = (rules?.workEnd || '17:45').split(':').map(Number);
  const f = notice.from; const t = notice.to;

  let fromHM = [ws_h, ws_m];
  let toHM = [we_h, we_m];
  if (notice.kind === '遅刻' && f.inH != null) toHM = [f.inH, f.inM || 0];
  if (notice.kind === '早退' && t.outH != null) fromHM = [t.outH, t.outM || 0];

  const period = (r, d, [hh, mm]) => {
    const [yy, mo, dd] = d.iso.split('-').map(Number);
    set(`J${r}`, yy); set(`O${r}`, mo); set(`R${r}`, dd);
    set(`W${r}`, DOW_JA[d.dow]);
    set(`AA${r}`, String(hh)); set(`AD${r}`, String(mm).padStart(2, '0'));
  };
  period(23, f, fromHM);
  period(25, t, toHM);

  set('F28', reason);
  /* その他 must say what it is, so the status goes in 備考 when the form
     itself cannot name it. */
  set('F32', remark || (notice.kind === 'その他' ? notice.status : ''));

  return wb.xlsx.writeBuffer();
}
