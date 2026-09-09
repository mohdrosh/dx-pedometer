# 社内DXポータル — 万歩計集計 / Pedometer Step Aggregation

Local development setup. Vite + React. No build tooling to configure.

---

## 1. Run it

You need **Node.js 18 or newer** ([nodejs.org](https://nodejs.org) — the LTS installer).
Check with `node -v`.

Unzip the folder, open it in VS Code, then in the terminal (`Ctrl + \``):

```bash
npm install     # once, downloads dependencies
npm run dev     # starts the app
```

Open the URL it prints — usually <http://localhost:5173>.

Stop it with `Ctrl + C`.

**Log in as:**

| | |
|---|---|
| An employee | any ID from the roster, e.g. `1810036` — or click 社員番号がわからない and search by name |
| The administrator | `admin` |

Data starts empty. To see the admin screens with content: log in as `admin` → 設定 → **デモデータを生成**.

---

## 2. Where the data lives

By default everything is stored in **your browser's localStorage**. That means:

- it survives page reloads
- it does **not** leave your machine, so a second person sees nothing

That is fine while you are changing the UI on your own.

### Sharing one dataset with other people

There is a small server bundled in `server.js` that keeps everything in a
`data.json` file. Use it to test with real colleagues before AWS is ready.

```bash
cp .env.local.example .env.local    # Windows: copy .env.local.example .env.local
npm run server                      # terminal 1 — the shared store, port 8787
npm run dev                         # terminal 2 — the app
```

To let phones on the office Wi-Fi reach it, find your PC's IP
(`ipconfig` on Windows, `ifconfig` on Mac) and put it in `.env.local`:

```
VITE_API_URL=http://192.168.1.23:8787
```

Then everyone opens `http://192.168.1.23:5173` on their phone. Restart
`npm run dev` after editing `.env.local`.

> `server.js` has **no authentication**. Office network only, never the open internet.

---

## 3. Files

```
src/App.jsx       the whole application
src/storage.js    read/write layer  ← the one file AWS work touches
src/main.jsx      mounts React
server.js         optional shared store for LAN testing
index.html        page shell
```

`App.jsx` is one file on purpose so it is easy to read end to end. Landmarks,
in order: the seed roster and config, i18n strings, date helpers, the Excel
builder, then the screens (Login → StepsTab → ProfileTab → AdminTab), and the
CSS at the bottom in `Styles()`.

---

## 4. Things you will probably want to change

**The employee roster.** `ROSTER_SEED` at the top of `App.jsx` holds the 147
people from the existing 集計表. It is only used the *first* time the app runs —
after that the list lives in storage and is edited from 管理者 → 対象者. To reload
the seed, clear the `roster` key (browser devtools → Application → Local Storage,
or delete `data.json` if you are running the server).

**Aggregation rules.** 完歩賞 threshold, the ¥2,000 amount, region list, admin
IDs and the submission-window switch are all in 管理者 → 設定 — no code change.

**Dates.** The period runs 21st → 20th. Submission opens on the 21st and closes
at the end of the **1st of the following month**. The 25th is a notice date
only; on the **26th** everyone still outstanding is emailed; on the **2nd**,
consented participants who still have not submitted are submitted
automatically with blank days recorded as 0.

**The Excel layout.** `buildWorkbook()` in `App.jsx`. It writes real formulas
(`SUM`, `COUNTIF`) rather than fixed numbers, so the downloaded file recalculates
exactly like the current one. 設定 chooses between the 仕様書 layout and the
現行ファイル互換 layout that keeps 送信方法 and 支給金額.

**Adding a tab** (勤怠, 旅費精算). Two steps:

1. Set `ready: true` on that entry in the `MODULES` array near the top.
2. In `App()`, render your component in the `mod !== 'steps'` branch.

The header, bottom navigation, language toggle and login are already shared.

---

## 5. When AWS is ready

Replace the body of `src/storage.js` with calls to your API — keep the four
methods (`get`, `set`, `del`, `list`) and their async signatures and nothing in
`App.jsx` changes. The key shapes it needs to support:

| Key | Contents |
|---|---|
| `cfg` | thresholds, regions, admin IDs, settings |
| `roster` | the participant master |
| `st:{YYMM}:{employeeId}` | one person's month — `{ steps: { "2026-07-21": 6000, ... }, submitted, submittedAt }` |

Those map cleanly onto a DynamoDB table with `pk = key`, or three SQL tables if
you prefer RDS. Per-person keys mean two people submitting at the same moment
cannot overwrite each other.

Still to add before real use, none of which affect the UI: authentication that
verifies the employee actually owns that ID, an audit trail on 差戻し, and a
backup of the monthly data.

To produce the static files for hosting (S3 + CloudFront, or any web server):

```bash
npm run build       # output lands in dist/
npm run preview     # check the built version locally
```


---

## 6. Reminder email and automatic submission

Both jobs live in `server.js` and only run while that process is up. Without it
the app still works, but nothing is sent and nothing is auto-submitted.

| When (09:00 JST) | What happens |
|---|---|
| 26th | Everyone who has not submitted the period that closed on the 20th receives a reminder, addressed by name, stating the final deadline as e.g. 「9月1日（火）まで」. |
| 2nd | Participants who consented and still have not submitted are submitted automatically; blank days become 0. Someone who entered nothing gets an all-zero row. |

Each run records the date it ran, so restarting the server never sends twice.
`ADMIN_EMAIL` receives a summary of both runs.

### Consent

The checkbox appears on the login screen the first time someone signs in and is
then permanent — it is stored on the participant record (`consent`,
`consentAsked`, `consentAt`) and can be seen and changed by 総務 in 対象者.
Reminders go to everyone outstanding; consent governs only the automatic
submission.

### Mail settings

Fill in the SMTP block in `.env.local`. **Leave `SMTP_HOST` empty and the server
runs in dry-run mode** — the jobs execute and print what they would send, but
nothing leaves the machine. Use that until 総務 has approved the real send.

### Testing without waiting for the date

```bash
curl -X POST "http://localhost:8787/api/jobs/reminder?y=2026&m=8"
curl -X POST "http://localhost:8787/api/jobs/auto?y=2026&m=8"
```

There is also a **自動提出を実行** button in 管理者 → 未提出 that does the same
thing from the browser, so the system stays correct even on a day the server
was down.

### Addresses

The roster keeps several addresses in one cell. Reminders go to the company
address only: `@morabu.com` first, otherwise the first address that is not a
known personal domain. Six participants currently have *only* a personal
address (hotmail and similar) — those will receive mail at that address, which
is worth confirming with 総務.
