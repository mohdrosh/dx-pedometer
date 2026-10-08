# 業務報告書 — the template the 勤怠 export fills

`gyomu-hokokusho.xlsx` is モラブ阪神's own 業務報告書, emptied. The export
opens it, types into the boxes a person would type into, and leaves every
formula alone — so the totals payroll reads are still Excel's arithmetic,
not a second implementation of it that could drift from the first.

Two sheets are kept:

| Sheet | Why |
|---|---|
| `業務報告書・社内用（20日締）` | the form |
| `祝祭日` | `BH` decides what is a working day by looking the date up here |

The 末日締 variant, the 見本 and the 認印作成 workshop are dropped. They are
not what payroll receives, and they are also the three sheets whose drawings
exceljs does not carry across a read-and-write — so removing them costs
nothing and avoids shipping something subtly broken.

One thing is lost either way: a red ellipse on the main sheet, drawn around
the 認印 box. The ㊞ character in the cell beneath it survives, so the box is
still marked. Nothing else differs.

## Rebuilding it

If the form changes, rebuild rather than editing the template by hand:

```bash
node src/templates/make-template.mjs path/to/新しい業務報告書.xlsx
```

Then strip the orphaned images, which are ~750 KB of pictures nothing
references once those sheets are gone:

```bash
python3 - <<'PY'
import zipfile, shutil
src = 'src/templates/gyomu-hokokusho.xlsx'
zin = zipfile.ZipFile(src)
zout = zipfile.ZipFile(src + '.tmp', 'w', zipfile.ZIP_DEFLATED)
for i in zin.infolist():
    if not i.filename.startswith('xl/media/'):
        zout.writestr(i, zin.read(i.filename))
zin.close(); zout.close(); shutil.move(src + '.tmp', src)
PY
```

Check afterwards that the cell references in `src/kintai-xlsx.js` still point
at the right boxes — it writes by address, so a row inserted into the form
moves them all.

---

# 届 — the template the notice export fills

`todoke.xlsx` is the 届（設計開発・請負契約）form, blank. The export ticks one
種別 box, writes the period, the name and number, and the reason the person
typed; everything else on the sheet is the form's own.

Only the blank form is kept. The workbook it came from also carries two
記入見本 sheets, which are instructions for filling it in by hand and are not
what anyone submits. Dropping them costs nothing here — unlike the timesheet,
the sheet that is kept carries no drawing, so the file comes back out of
exceljs exactly as it went in.

## Rebuilding it

```bash
node src/templates/make-todoke.mjs path/to/新しい届.xlsx
```

Then re-run `node test/todoke-cases.mjs`, and check the cell references in
`src/todoke.js` — `KIND` holds the address of each checkbox, and the period
rows are addressed directly, so a row inserted into the form moves them all.

---

# 交通費精算書 — the template the expense export fills

`koutsuuhi.xlsx` is the 交通費精算書（請負用）, blank. One sheet, which is the
whole workbook. The export writes the header, up to 25 journeys and a ○ in
the 通勤経路 column where the trip was a commute; the three totals at the
foot stay the form's own SUMIFs, with the figures cached beside them.

The cell note on 通勤経路 — the one that explains 通勤交通費 against
立替交通費 — is carried across, so the form still explains itself to whoever
opens it. The red ellipse around the 印 box is not; the box is still there.

## Rebuilding it

```bash
node src/templates/make-koutsuuhi.mjs path/to/新しい交通費精算書.xlsx
```

Then re-run `node test/koutsuuhi-cases.mjs`, which rebuilds a real submitted
sheet from its journeys and compares the two cell by cell. The column
addresses live in `COL` in `src/koutsuuhi.js`.
