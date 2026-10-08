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
