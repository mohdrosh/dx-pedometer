# tools

## roster-import.mjs — 名簿の取り込み

健康対策委員会 maintains the participant list in the 集計表 and sends it
over when it changes. This brings the site into line with it.

```bash
# look first — writes nothing
node tools/roster-import.mjs \
  --csv ~/Downloads/集計表2610.csv \
  --url https://dx.morabu.com/pedometer \
  --admin kenkou@morabu.com

# then, if the report reads right
node tools/roster-import.mjs ... --apply
```

Export the 集計表 sheet as CSV first — the one with 社員№, 名前, 地区別,
性別 and メールアドレス on it. The tool reads the 地区別 on the **left**;
the column of the same name on the right of that sheet is a second, stale
copy and holds `メール` and `FAX` for a dozen rows.

### What it changes, and what it leaves alone

| From the committee's sheet | Left as it is |
|---|---|
| 名前 | 万歩計番号 |
| 地区 | 同意と同意日 |
| 性別 | 個人のメールアドレスと、その送信設定 |
| 会社のメールアドレス | 生年月日・お試し登録 |
| 並び順 | 入力済みの歩数・勤怠・交通費 |

### It does not delete anybody

`setRoster` removes any employee missing from the list it is handed, and
`entries` cascades off `employees` — so one name left out by accident takes
a year of that person's step history with it. People who have left are
marked inactive instead: they cannot sign in, the aggregation skips them,
and their figures stay readable. Before writing, the tool checks that every
id already on the site is still in the list it built, and refuses outright
if one is not.

It also refuses on a duplicate employee number, or if an active participant
would be left without an address.

### The second address

A few records hold two addresses in the one field — the company one and a
gmail or a client's, separated by a semicolon or a newline. The sheet
replaces that with the morabu address alone. The other one is moved to the
private 個人アドレス field rather than discarded, **switched off**: that
flag is the person's own consent and nobody has asked them. Nothing is sent
to it until they turn it on themselves in マイページ.
