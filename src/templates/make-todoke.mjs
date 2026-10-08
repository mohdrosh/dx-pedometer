/* Build the blank 届 the notice export fills. Only the form sheet is kept —
   the two 記入見本 are guidance for someone filling it by hand, and the
   generated one is already filled. They are also the only sheets carrying
   drawings, so the form itself loses nothing by their going.

     node src/templates/make-todoke.mjs path/to/届.xlsx
*/
import ExcelJS from 'exceljs';
const SRC = process.argv[2];
if (!SRC) { console.error('usage: node src/templates/make-todoke.mjs <source.xlsx>'); process.exit(1); }
const OUT = new URL('./todoke.xlsx', import.meta.url).pathname;

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);
for (const name of ['記入見本', '遅刻・早退記入見本']) {
  const w = wb.getWorksheet(name);
  if (w) wb.removeWorksheet(w.id);
}
const ws = wb.getWorksheet('届（設計開発・請負契約）');

/* 開発部 is typed into the blank as a default; the generator fills it from
   the person, so it starts empty like everything else. */
for (const ref of ['Z5', 'AD5', 'AF5', 'V9', 'R10', 'V11', 'F28', 'F32']) ws.getCell(ref).value = null;
for (const c of ['V', 'W', 'X', 'Y', 'Z', 'AA', 'AB']) ws.getCell(`${c}13`).value = null;
for (const r of [23, 25]) {
  for (const c of ['J', 'O', 'R', 'W', 'AA', 'AD']) ws.getCell(`${c}${r}`).value = null;
}
for (const ref of ['F18', 'K18', 'Q18', 'W18', 'F20', 'K20', 'Q20', 'W20']) ws.getCell(ref).value = '□';

await wb.xlsx.writeFile(OUT);
console.log('written', OUT);
