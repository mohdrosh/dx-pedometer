/* Build the blank 交通費精算書 the generator fills. One sheet, which is the
   whole workbook — nothing to drop. Every entry, name and date is cleared;
   the ruled lines, the ／ and ： separators, the 円 after each fare and the
   three SUMIF totals are the form's own and stay exactly as they are.

     node src/templates/make-koutsuuhi.mjs path/to/交通費精算書.xlsx
*/
import ExcelJS from 'exceljs';

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node src/templates/make-koutsuuhi.mjs <source.xlsx>'); process.exit(1); }
const OUT = new URL('./koutsuuhi.xlsx', import.meta.url).pathname;

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);
const ws = wb.worksheets[0];

/* 作成日, 所属, 氏名, the seven employee-number boxes, and 精算期間 */
for (const ref of ['AD4', 'AH4', 'AJ4', 'F6', 'Z7',
  'I9', 'M9', 'P9', 'Z9', 'AD9', 'AG9']) ws.getCell(ref).value = null;
for (const c of ['AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH']) ws.getCell(`${c}6`).value = null;

/* the 25 journey rows — date, both stations and times, the line, the
   通勤経路 ○ and the fare. B/J/S hold ／ and ： and are left alone. */
for (let r = 16; r <= 40; r++) {
  for (const c of ['A', 'C', 'D', 'H', 'K', 'M', 'Q', 'T', 'V', 'AD', 'AF']) {
    ws.getCell(`${c}${r}`).value = null;
  }
}
/* a stray ○ parked below the table in the copy this was built from */
ws.getCell('AE45').value = null;

wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };

await wb.xlsx.writeFile(OUT);
console.log('written', OUT);
