/* Build the blank 業務報告書 the generator fills. Two sheets only: the form
   itself and the 祝祭日 list its formulas look up. The 末日締 variant, the
   見本 and the 認印作成 workshop are dropped — payroll is handed one form,
   not a workbook, and those three are also the sheets whose drawings exceljs
   does not carry across. Every entry and every name is cleared. */
import ExcelJS from 'exceljs';
/* Point this at a real 業務報告書 workbook to rebuild the template, e.g.
   after the form itself changes. Run from the project root:
     node src/templates/make-template.mjs path/to/業務報告書.xlsx
   The orphaned xl/media entries are stripped afterwards — see the README. */
const SRC = process.argv[2];
if (!SRC) { console.error('usage: node src/templates/make-template.mjs <source.xlsx>'); process.exit(1); }
const OUT = new URL('./gyomu-hokokusho.xlsx', import.meta.url).pathname;

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);
for (const name of ['業務報告書・社内用（末日締）', '業務報告書・社内用(見本)',
  '【手書き用】（20日締）', '【手書き用】（末日締）', '認印作成']) {
  const w = wb.getWorksheet(name);
  if (w) wb.removeWorksheet(w.id);
}
const ws = wb.getWorksheet('業務報告書・社内用（20日締）');

/* header: period, department, name, and the seven employee-number boxes */
for (const ref of ['A3', 'I3', 'AQ2', 'AQ3', 'AQ4']) ws.getCell(ref).value = null;
for (const c of ['AS', 'AT', 'AU', 'AV', 'AW', 'AX', 'AY']) ws.getCell(`${c}5`).value = null;

/* the 31 day rows: start, end, note and the two status dropdowns */
for (let r = 9; r <= 39; r++) {
  for (const c of ['E', 'G', 'I', 'K', 'AE', 'AJ', 'AN']) ws.getCell(`${c}${r}`).value = null;
}

/* Excel must work the totals out for itself when payroll opens the file —
   the cached results in the template belong to somebody else's September. */
wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };

await wb.xlsx.writeFile(OUT);
console.log('written', OUT);
