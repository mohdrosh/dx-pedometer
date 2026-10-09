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

### Exporting the file

In Excel, open the 集計表, click the 集計表 sheet tab, then
ファイル → 名前を付けて保存 → **CSV UTF-8**. Plain "CSV" on Windows writes
Shift-JIS; the tool reads that too, but it says so when it does, and it
refuses outright rather than write a roster of mojibake names if the file
turns out to be in some third thing.

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

### Absent from the sheet is not the same as gone

The 集計表 is the 万歩計 participant list, not the list of everyone with a
login: the committee's own people use 勤怠 and 旅費精算 without walking,
and there are a few accounts with short employee numbers besides. Only
people the sheet names in its 退職・異動 section are switched off. Anyone
simply absent is left signed-in and reported, and `--deactivate-missing`
is what says otherwise — once you have looked at the list and are sure.

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

---

## fare-import.mjs — 過去の交通費精算書から運賃表をつくる

健康対策委員会 chose this over buying a fare API: the fares are already
written on the forms everyone has been handing in, so the quickest way to a
table the site can fill in for people is to read the forms back.

```bash
# put the submitted 交通費精算書 in one folder, then look first
node tools/fare-import.mjs \
  --dir ~/Downloads/koutsuuhi \
  --url https://dx.morabu.com/pedometer \
  --admin kenkou@morabu.com

node tools/fare-import.mjs ... --apply      # and write it
node tools/fare-import.mjs ... --replace    # start the table again
```

It reads rows 16–40 of each sheet — 発駅, 着駅, 利用交通機関, 運賃 — and
collects the distinct routes. Both directions of a journey are one route: a
sheet saying 姫路→三ノ宮 ¥960 is also saying what the trip home costs, and
keeping them apart would halve the evidence for each. Stations match
loosely, so 三ノ宮 / 三の宮 / 三ノ宮駅 are one place.

### When the forms disagree

They will. Fares go up, people mistype, and two tickets between the same
pair of stations are two different prices. Every disagreement is printed
with how many forms said what, and the most-used figure is the one taken:

```
姫路 → 三ノ宮 (JR)
     ¥960×3  ¥990×1   → taking ¥960
```

Look at that list before applying. A fare revision will show as the old
figure outvoting the new one, which is exactly backwards — fix those by
hand in 運賃表 afterwards.

### No install

An xlsx is a zip of XML and the tool reads the little of it it needs, so
like roster-import it is one file and runs on a bare Node.
