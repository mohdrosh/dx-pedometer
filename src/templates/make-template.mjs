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

repairDayFormulas(ws);

/* Excel must work the totals out for itself when payroll opens the file —
   the cached results in the template belong to somebody else's September. */
wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };

await wb.xlsx.writeFile(OUT);
console.log('written', OUT);

/* ---------------------------------------------------------------------------
   The printed columns of the day grid have holes in them.

   休憩, 実働時間 and the three overtime columns are formulas, and in the
   workbook people actually use, thirteen to fifteen of the thirty-one rows
   have no formula at all — M, O, S, W and AA, in rows that look arbitrary
   (10, 11, 17, 18, 24, 25, 31…). It is what a block of cells deleted with
   the Delete key looks like, repeated over a few years of hands.

   Nobody noticed because the hidden helper columns beside them (BH, BI, BO,
   BU, BY…) are intact in every row, and the month totals are summed from
   those — so the figures at the foot of the page have always been right
   while the rows above them went blank. On paper, filled in by hand, the
   gaps did not show either.

   Typed into by a machine, every row gets used, and the gaps show at once.
   So the template is repaired: each of those columns takes the formula from
   whichever row still has it, with the row numbers moved to match, and
   every row 9–39 gets one. The shared-formula groups are flattened in the
   process, which is a fair price for every row computing.
--------------------------------------------------------------------------- */
function repairDayFormulas(sheet) {
  const FIRST = 9; const LAST = 39;
  const COLS = ['M', 'O', 'S', 'W', 'AA', 'AP'];
  const fixed = [];

  for (const col of COLS) {
    /* A donor: a row whose cell holds the formula text itself rather than a
       pointer at the row above. */
    let donorRow = null; let text = null;
    for (let r = FIRST; r <= LAST; r++) {
      const v = sheet.getCell(`${col}${r}`).value;
      if (v && typeof v === 'object' && typeof v.formula === 'string') {
        donorRow = r; text = v.formula; break;
      }
    }
    if (!donorRow) { console.warn(`  ! ${col}: no formula anywhere — left alone`); continue; }

    let n = 0;
    for (let r = FIRST; r <= LAST; r++) {
      const before = sheet.getCell(`${col}${r}`).value;
      if (before == null) n += 1;
      sheet.getCell(`${col}${r}`).value = { formula: moveRows(text, donorRow, r) };
    }
    fixed.push(`${col}+${n}`);
  }
  console.log('  day formulas restored:', fixed.join(' ') || 'none needed');
}

/* Move a formula from one row to another: BO9 becomes BO17, while $BH$3 and
   the bare numbers in (BO9+BQ9)*60 are left exactly as they are. Only a row
   number that follows a column letter, is not anchored with $, and is the
   donor's own row is rewritten. */
function moveRows(formula, from, to) {
  return formula.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g, (whole, colPart, anchor, rowPart) => (
    anchor === '' && Number(rowPart) === from ? `${colPart}${to}` : whole
  ));
}
