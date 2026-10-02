# デプロイ手順 / Deployment steps

Supabase (PostgreSQL) + Render (app) + GitHub. Free on both.
Follow in order. Roughly 30 minutes.

---

## 1. Supabase — create the database

1. <https://supabase.com/dashboard> → **New project**
2. Name: `pedometer` · **Region: Northeast Asia (Tokyo)** · set a database password
   → **save that password somewhere**, you cannot see it again
3. Wait ~2 minutes for it to provision
4. Press **Connect** (top of the page) → **Session pooler** tab
5. Copy the string. It looks like:

```
postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

6. Replace `[YOUR-PASSWORD]` with the password from step 2

> **Use the Session pooler string, not the direct one.** The direct connection
> is IPv6-only and Render cannot reach it. Port must be `5432`.

You do **not** need to create any tables — the app creates them on first start.

---

## 2. Test it locally first

In the project folder:

```bash
cp .env.local.example .env.local
```

Open `.env.local`, paste the connection string into `DATABASE_URL`, save. Then:

```bash
npm install
npm run server      # terminal 1 — should print "Database : connected"
npm run dev         # terminal 2
```

Open <http://localhost:5173>, log in as `admin`, check the roster loads.
If that works, everything else will.

**If it says it cannot connect:** you used the direct string instead of the
pooler, or the password still has the `[...]` brackets around it.

---

## 3. GitHub — push the code

```bash
cd dx-pedometer
git init
git add .
git commit -m "Pedometer app"
```

Create an empty repo at <https://github.com/new> (**Private**), then:

```bash
git remote add origin https://github.com/YOURNAME/dx-pedometer.git
git branch -M main
git push -u origin main
```

`.gitignore` already excludes `.env.local`, so the password is not pushed.
Check that after pushing — GitHub should not show a `.env.local` file.

---

## 4. Render — deploy

1. <https://dashboard.render.com> → **New +** → **Web Service**
2. Connect the GitHub repo
3. Settings:

| Field | Value |
|---|---|
| Region | **Singapore** (closest to Japan) |
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `node server.js` |
| Instance Type | Free |

4. **Environment Variables** → add:

| Key | Value |
|---|---|
| `DATABASE_URL` | the Supabase session pooler string |
| `NODE_VERSION` | `20` |

   Do **not** set `PORT` — Render provides it.

5. **Create Web Service**. First build takes 3–5 minutes.

You get a URL like `https://dx-pedometer.onrender.com`.

6. Once it is live, add one more environment variable so reminder emails
   contain the right link, then let it redeploy:

| Key | Value |
|---|---|
| `APP_URL` | your Render URL |

---

## 5. Check it

Open the URL:

- Log in as `admin` → 対象者 tab → the 147 people should be listed
- 設定 → デモデータを生成 → 集計 → **Excelをダウンロード**

The first load after 15 minutes of inactivity takes about a minute — Render's
free tier sleeps. Warn anyone you send the link to.

---

## Things to know about the free tiers

**Render sleeps after 15 minutes idle.** Fine for a demo. $7/month removes it,
and is required later anyway for the 26th-of-the-month reminder job to run.

**Supabase pauses free projects after 7 days of no database activity**, and it
stays down until you unpause it from the dashboard. If nobody opens the app for
a week, check it before sending the link to anyone.

**Supabase free has no backups.** Fine now, not fine once real entries exist —
by then you will be on RDS, which backs up automatically.

---

## Updating the live site (AWS)

The app runs on EC2 `morabu-dx-app-ec2` (ap-northeast-1) behind nginx, which
proxies `/pedometer/` through to it. Open a shell with **Session Manager**
(EC2 → the instance → Connect → Session Manager), then:

```bash
sudo -i
```

`sudo -i` starts a fresh shell, so anything pasted after it on the same go is
swallowed. Wait for the root prompt, then paste this as one line:

```bash
cd /opt/apps/pedometer && git pull origin main && BASE_PATH=/pedometer/ npm run build && systemctl restart pedometer && systemctl status pedometer --no-pager
```

> **`BASE_PATH=/pedometer/` is not optional.** Vite bakes the base path into
> `dist/index.html` at build time. Build without it and the page asks for
> `/assets/index-….js` instead of `/pedometer/assets/index-….js`, the script
> 404s, and the site is a blank white screen. The server itself is fine when
> this happens — it is only the HTML pointing at the wrong URL, and another
> build with the variable set fixes it.

Check the build landed where it should:

```bash
grep -o 'src="[^"]*"' dist/index.html     # must start /pedometer/assets/
```

Then hard-refresh the browser (Ctrl+Shift+R) — the filename hash changes every
build, so a stale `index.html` in the cache points at a file that is gone.

If anything looks wrong:

```bash
journalctl -u pedometer -n 50 --no-pager
```

A healthy start logs `Listening on port 8787`, `Database : connected`,
`Static : serving dist/` and the mail and jobs lines.

Runtime settings (`DATABASE_URL`, the `SMTP_*` values, `ADMIN_EMAIL`) live in
`/etc/pedometer/pedometer.env` and are read by systemd, so changing them needs
a restart but no rebuild. Build-time settings (`VITE_*`) live in
`/opt/apps/pedometer/.env.local` and need a rebuild to take effect.

---

## Moving to AWS later

Change `DATABASE_URL` to the RDS endpoint and restart. Nothing else changes —
same code, same schema, which is created automatically on first start.

To carry the data across:

```bash
pg_dump "SUPABASE_URL" > backup.sql
psql "RDS_URL" < backup.sql
```

---

## Turning the automatic emails on

Add these to Render's environment variables when 情シス provides them:

```
SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, ADMIN_EMAIL
```

While `SMTP_HOST` is empty the server stays in **dry run** — the jobs execute
and log what they would send, but nothing leaves the machine. No code change is
needed to switch over.

To test before the real dates:

```bash
curl -X POST "https://YOUR-URL/api/jobs/reminder?y=2026&m=8"
curl -X POST "https://YOUR-URL/api/jobs/auto?y=2026&m=8"
```

---

## The database

Four tables, created automatically:

| Table | Contents |
|---|---|
| `employees` | one row per participant, including consent |
| `entries` | one row per participant per month — submission state |
| `entry_days` | one row per day walked |
| `config` | thresholds, regions, admin IDs, settings |

Queryable with plain SQL in the Supabase SQL editor, e.g.:

```sql
SELECT e.name, SUM(d.steps) AS total
FROM entry_days d JOIN employees e ON e.id = d.employee_id
WHERE d.period = '2608'
GROUP BY e.name ORDER BY total DESC;
```
