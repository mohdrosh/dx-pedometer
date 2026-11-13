/* ============================================================================
   PostgreSQL data layer.

   The browser talks to a small key/value HTTP API (see server.js), but the
   data is stored in proper relational tables so it can be queried with plain
   SQL, joined, and read by reporting tools:

     employees   one row per participant
     entries     one row per participant per month (submission state)
     entry_days  one row per day walked
     config      thresholds, regions, admin IDs, settings
     sessions    one row per signed-in browser

   The four functions at the bottom translate the API's keys onto those
   tables:

     'cfg'                -> config
     'roster'             -> employees
     'st:2608:1234567'    -> entries + entry_days

   Works against Supabase, Amazon RDS, or a local Postgres — only the
   connection string changes.
========================================================================== */

import pg from 'pg';
import { OFFICE_MIN_DEFAULT, OFFICE_ADDRESS, EGG_OFFICES } from './egg.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase and RDS both present certificates that Node does not trust by
  // default. The connection is still encrypted.
  ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
});

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      region        TEXT,
      gender        TEXT,
      email         TEXT,
      pedometer     TEXT,
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      consent       BOOLEAN NOT NULL DEFAULT FALSE,
      consent_asked BOOLEAN NOT NULL DEFAULT FALSE,
      consent_at    TIMESTAMPTZ,
      sort_order    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS entries (
      period       TEXT NOT NULL,
      employee_id  TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      submitted    BOOLEAN NOT NULL DEFAULT FALSE,
      auto         BOOLEAN NOT NULL DEFAULT FALSE,
      submitted_at TIMESTAMPTZ,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (period, employee_id)
    );

    CREATE TABLE IF NOT EXISTS entry_days (
      period      TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      day         DATE NOT NULL,
      steps       INTEGER NOT NULL,
      PRIMARY KEY (period, employee_id, day),
      FOREIGN KEY (period, employee_id) REFERENCES entries(period, employee_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id         SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      name       TEXT,
      email      TEXT,
      employee_id TEXT,
      category   TEXT,
      message    TEXT NOT NULL,
      sent       BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid         TEXT PRIMARY KEY,
      employee_id TEXT,
      is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS entries_period_idx ON entries(period);
    CREATE INDEX IF NOT EXISTS entry_days_lookup_idx ON entry_days(period, employee_id);
  `);

  /* Migrations for databases created before these columns existed. */
  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS trial BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS dob DATE;
    /* A second, personal address people can add themselves, used for
       reminders only while they leave the flag on. Kept apart from the
       company address so turning it off never risks losing that one. */
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS email2 TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS email2_on BOOLEAN NOT NULL DEFAULT FALSE;
    /* What the 業務報告書, the 届 and the 交通費精算書 print at the top:
       部署 and 課 on the timesheet, 所属 on the expense form, and the name of
       the site someone is placed at on the 届. Blank until the committee
       fills them in, which is how the paper forms arrive today. */
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS dept TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS section TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS client TEXT;

    /* 個人情報 — the one place a person's details are kept, so that a change
       of department is made once and every document follows. Until now the
       同じ値 was typed again on each paper form.

       affiliation is 「所属や部署名、出向先／派遣先会社名」 held as the single
       string the committee writes, not split into parts: 健康対策委員会 asked
       for it to print on the 届 and the 交通費調査書 exactly as they write it,
       and 「開発部 システム開発1課（明海505）」 does not survive being taken
       apart and put back together. dept and section stay beside it because
       the 業務報告書 has a separate cell for each.

       work_start / work_end are per person because they already differ: the
       新長田 group works 8:45–17:15 and the 明海 group 9:00–17:45. */
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS affiliation TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_start TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_end TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS home_station TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS workplace TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_station TEXT;
    /* The 通勤経路, as the 交通費調査書 lays it out: one row per leg, with
       使用交通会社名 / 乗車地 / 降車地 / 片道料金 / 1ヶ月定期代. A list rather
       than columns because the paper form takes several legs, even though
       every one of the thirteen currently has exactly one. */
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS commute JSONB;
    /* Who reaches the new My Page, and with it 勤怠 and 旅費精算. Off for
       everyone until set, so the ~140 on the existing screen see no change
       whatsoever. */
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS mypage BOOLEAN NOT NULL DEFAULT FALSE;

    /* モラエッグ. A flag of its own rather than riding on mypage, which by
       now opens every module for fourteen people — the egg portal starts
       with 佐野 alone while the committee works out who 内勤 covers. */
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS egg BOOLEAN NOT NULL DEFAULT FALSE;

    /* 添付 — the files a claim carries. Today that is the 遅延証明書 a train
       company issues when a commute is late; the kind column is there so the
       next sort of attachment does not need a second table.

       The bytes live in the database rather than on the disk or in a bucket.
       The disk is one machine that nothing backs up, and a bucket is another
       system to configure, grant and audit for what will be a few hundred
       kilobytes a month. Here they are inside the same backup as the claim
       they belong to and disappear with it, which is what ON DELETE CASCADE
       is for — an attachment outliving its owner is a copy of somebody's
       commute nobody is looking after. */
    CREATE TABLE IF NOT EXISTS uploads (
      id          TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      period      TEXT NOT NULL,
      kind        TEXT NOT NULL,
      name        TEXT NOT NULL,
      mime        TEXT NOT NULL,
      bytes       BYTEA NOT NULL,
      size        INTEGER NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS uploads_owner_idx ON uploads(employee_id, period);

    /* 需要調査の回答 — one row per person, and the employee id is the key.

       佐野 asked for two things that pull against each other: nobody, not
       even an administrator, may see who chose what; and a person may change
       their answer while the survey is open. The second needs the link, so
       the link exists — as the primary key, which also makes voting twice
       impossible rather than merely discouraged.

       It never leaves this file. The only reader below is eggTally, which
       returns counts. There is no function here that takes an employee and
       gives back their office, and none that lists the rows with their ids;
       adding one would undo the promise rather than extend the feature. */
    CREATE TABLE IF NOT EXISTS egg_votes (
      employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
      office      TEXT NOT NULL,
      rule        TEXT NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    /* 佐野:「投票するときに、意見があれば一緒に書いてもらってください」 */
    ALTER TABLE egg_votes ADD COLUMN IF NOT EXISTS comment TEXT;
    /* 問3 サイト名の投票 */
    ALTER TABLE egg_votes ADD COLUMN IF NOT EXISTS name TEXT;

    /* ==================== モラエッグ Phase 1：配布の運用 =================== */

    /* 丹波で収穫を登録する人。事務所担当者とは別の役割で、人数はごく少ない。
       The egg flag above says a person may use the portal at all; this one
       says they may add to the week's harvest, which is the number every
       allocation is divided out of. */
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS egg_farm BOOLEAN NOT NULL DEFAULT FALSE;

    /* 9.2 事務所. The survey asks about all eight; this table holds the ones
       actually opened, with the address people walk to and the contact who
       confirms the packs arrived. 「初期は1〜2事務所から」 — a row appears here
       when an office starts receiving, not before, so the active flag is
       what a request may be addressed to, while the survey keeps asking
       about the rest. The name is the key because it is what the votes already hold. */
    CREATE TABLE IF NOT EXISTS egg_offices (
      name       TEXT PRIMARY KEY,
      address    TEXT,
      contact_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
      note       TEXT,
      active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    /* 佐野:「最低パック数を超えたら『今週はこの事務所にタマゴが届きます！』、
       届かなかったら残念賞のメッセージを出す」. Below this many packs asked
       for, a run to that office is not worth making; 0 means no minimum,
       which is what every office starts with. */
    ALTER TABLE egg_offices ADD COLUMN IF NOT EXISTS min_packs INTEGER NOT NULL DEFAULT 0;
    /* 2026/11/12, 佐野:「到着は発送の翌日、東京はさらに1日後」. How many
       nights the courier needs beyond the ordinary one to reach this
       office. 0 for all but 東京, which is 1 — and a number rather than
       a list of office names in the code, so the next distant office is
       a field somebody fills in. */
    ALTER TABLE egg_offices ADD COLUMN IF NOT EXISTS arrive_days INTEGER NOT NULL DEFAULT 0;

    /* 5.1 収穫登録.「10個入り1パックごとにボタンを押す」「同日中であれば取り消
       し・修正ができる」.

       One row per day rather than one per tap: the undo 佐野 asked for is
       then a number going down by one, which is a thing a phone screen can
       show honestly — a log of taps would have to explain which tap was
       undone. 「10個未満の端数は登録しない」, so packs is whole and that is
       the only unit the rest of the system ever sees. */
    CREATE TABLE IF NOT EXISTS egg_harvest (
      day        DATE PRIMARY KEY,
      packs      INTEGER NOT NULL DEFAULT 0 CHECK (packs >= 0),
      updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    /* 9.2 発送週. Named after the Monday the eggs ship, which is also what
       src/egg-week.js works every deadline out from. A row exists once the week
       has been drawn: the rule and the seed are written at that moment and
       never changed, so a draw re-run months later comes out the same —
       which is the only thing that makes 「抽選」 checkable rather than a
       promise. */
    CREATE TABLE IF NOT EXISTS egg_weeks (
      ship       DATE PRIMARY KEY,
      packs      INTEGER,
      rule       TEXT,
      seed       TEXT,
      drawn_at   TIMESTAMPTZ,
      drawn_by   TEXT REFERENCES employees(id) ON DELETE SET NULL
    );

    /* 事務所別内訳 — how many packs went to each office, and the Monday the
       contact there confirmed they arrived. */
    CREATE TABLE IF NOT EXISTS egg_week_offices (
      ship       DATE NOT NULL,
      office     TEXT NOT NULL,
      packs      INTEGER NOT NULL DEFAULT 0,
      arrived_at TIMESTAMPTZ,
      arrived_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
      PRIMARY KEY (ship, office)
    );

    /* 5.2 申請. One per person per week — 「申請の変更・取り消しは締切まで可能」
       means the row is edited, not added to, so the pair is unique and the id
       is built from it. The share is null until the draw runs and 0 after it for
       anyone who missed out; those are different states and the screen says
       受付済 for one and 落選 for the other, so they must not collapse. */
    CREATE TABLE IF NOT EXISTS egg_requests (
      id           TEXT PRIMARY KEY,
      employee_id  TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      ship         DATE NOT NULL,
      office       TEXT NOT NULL,
      packs        INTEGER NOT NULL CHECK (packs >= 1),
      purpose      TEXT NOT NULL,
      reason       TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      got          INTEGER,
      drawn_at     TIMESTAMPTZ,
      picked_up_at TIMESTAMPTZ,
      picked_up_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
      UNIQUE (employee_id, ship)
    );
    CREATE INDEX IF NOT EXISTS egg_requests_week_idx ON egg_requests(ship, office);

    /* 6. 同意フロー.「同意日時と、同意した文面のバージョンを記録する」. The
       version is a hash of the text (see eggTerms in src/egg.js), so an
       administrator revising the terms invalidates every stored consent by
       the act of revising them, and everybody is asked again without anyone
       having had to remember to say so. */
    /* ==================== Phase 2：料理写真の投稿 ======================= */

    /* 7.1 投稿.「投稿者名は表示する（匿名にはしない）」 — the opposite of the
       survey, deliberately: a dish with a name on it starts a conversation
       and an anonymous one is just a photograph. So the employee id is
       here to be shown, not hidden, and none of the care taken over
       egg_votes applies.

       hidden_at is moderation (section 8): an administrator can take a post
       out of the timeline without destroying what somebody wrote, which a
       DELETE would. The poster's own delete is a real delete. */
    CREATE TABLE IF NOT EXISTS egg_posts (
      id          TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      dish        TEXT NOT NULL,
      body        TEXT,
      recipe      TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      hidden_at   TIMESTAMPTZ,
      hidden_by   TEXT REFERENCES employees(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS egg_posts_new_idx ON egg_posts(created_at DESC);

    /* The bytes live here rather than in a bucket. About 450MB a year at
       this company's size, it inherits the session gate every other route
       has, and ON DELETE CASCADE means a deleted post really takes its
       photographs with it instead of leaving them in a bucket nobody
       audits. Behind eggPhoto* below, so moving them later is a day.

       Two sizes: the timeline shows thumbs, and only a tapped photo costs
       its full weight. Both arrive already resized — the browser does it,
       which is also what strips the EXIF, and a phone photo's EXIF carries
       the GPS position it was taken at. */
    CREATE TABLE IF NOT EXISTS egg_photos (
      id         TEXT PRIMARY KEY,
      post_id    TEXT NOT NULL REFERENCES egg_posts(id) ON DELETE CASCADE,
      ord        INTEGER NOT NULL DEFAULT 0,
      mime       TEXT NOT NULL,
      bytes      BYTEA NOT NULL,
      size       INTEGER NOT NULL,
      thumb      BYTEA,
      thumb_size INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS egg_photos_post_idx ON egg_photos(post_id, ord);

    /* 7.2:「1人1投稿につき各ボタン1回まで押せる（押し直しで取り消し）」 — which
       is a primary key, not a check somebody has to remember to write. */
    CREATE TABLE IF NOT EXISTS egg_reactions (
      post_id     TEXT NOT NULL REFERENCES egg_posts(id) ON DELETE CASCADE,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (post_id, employee_id, kind)
    );

    /* 7.3 コメント.「自分のコメントは削除できる」, and an administrator can
       hide one, same as a post. */
    CREATE TABLE IF NOT EXISTS egg_comments (
      id          TEXT PRIMARY KEY,
      post_id     TEXT NOT NULL REFERENCES egg_posts(id) ON DELETE CASCADE,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      body        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      hidden_at   TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS egg_comments_post_idx ON egg_comments(post_id, created_at);

    CREATE TABLE IF NOT EXISTS egg_consents (
      employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
      version     TEXT NOT NULL,
      agreed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  /* 参加登録 — 配布ルール 3.

     The pickup office moved here from the weekly request. It used to be
     chosen every time; the company settled on 「いつもの受取場所」 set once
     and changed in マイ設定 before requesting, with no second choice. A
     request now reads this rather than carrying an office of its own.

     Separate from egg_consents because the two answer different
     questions: that table records that somebody agreed to the terms and
     when, which the settings screen has to keep showing, and this one
     records what they chose. Someone can re-agree to a new version of the
     terms without re-picking an office.

     points is 優先ポイント (配布ルール 9) — carried by the person, so it
     survives a change of office, and 0 for anybody with no row. */
  /* 配布ルール 5:「お届けが決まらなかった場合は本社（神戸）で受け取る」.
     Per request rather than per person: whether somebody is willing to
     travel to Kobe is a decision about this week's packs, and the answer
     can reasonably differ between a box for a customer and one for
     themselves. */
  await pool.query(
    'ALTER TABLE egg_requests ADD COLUMN IF NOT EXISTS hq_ok BOOLEAN NOT NULL DEFAULT FALSE',
  );

  /* Where the pack is actually collected, once the allocation has run.
     Null means「申請した事業所」 — only somebody moved to 本社 because their
     own office fell short of the minimum has a value here, so a request
     that was never moved cannot drift away from the office it was made
     at. It is written by the draw and read by the office contact's list,
     which is why it is a column and not worked out again on each read:
     the week has been decided, and a later change to the office rows must
     not move a pack that is already on a van. */
  await pool.query(
    'ALTER TABLE egg_requests ADD COLUMN IF NOT EXISTS at_office TEXT',
  );

  /* 配布ルール 8「余った分は本社に送り、ご自由にどうぞとする」. Kept apart
     from the packs people asked for, because 今週の結果 says them
     separately —「リクエスト{a}＋余り{b}」— and a single total cannot be
     taken back apart afterwards. */
  await pool.query(
    'ALTER TABLE egg_weeks ADD COLUMN IF NOT EXISTS extra INTEGER NOT NULL DEFAULT 0',
  );
  await pool.query(
    'ALTER TABLE egg_week_offices ADD COLUMN IF NOT EXISTS extra INTEGER NOT NULL DEFAULT 0',
  );

  /* 優先ポイント as they stood before this week was decided.
     Re-running a week is allowed until somebody collects, and the points
     are the one input a run destroys: the second run would read the table
     its own first run had already zeroed, and punish the people it had
     just served. Keeping the input means a week always replays to the
     same answer, which is also the only way the committee can ever check
     one —「抽選の対象になったことは個別に知らせない」. */
  await pool.query(
    'ALTER TABLE egg_weeks ADD COLUMN IF NOT EXISTS points_before JSONB',
  );

  /* 本社 → 本社（神戸）, 2026/11/03. 佐野's 文言辞書 names the eight offices,
     and Head Office is 本社（神戸） in it.

     This is a rename that has to happen in the database and not only in
     new rows: 配布ルール 8 sends every spare pack to Head Office, and the
     allocation finds it BY NAME. Two spellings in one database would
     quietly drop the leftovers on the floor every week — no error, no
     warning, just a 「ご自由にどうぞ」 box that never arrives. So it runs
     at start-up, on whichever database the server wakes up against.

     The offices row is renamed only when the new name is not already
     there; when both exist the old row is dropped instead and everything
     pointing at it moved across, because a primary key cannot hold two
     of the same name. Either way the references are updated first. The
     survey answers are left alone: they are a record of what people
     typed in October, not a list of live offices. */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS egg_signup (
      employee_id  TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
      office       TEXT NOT NULL,
      private_mail TEXT,
      notify_priv  BOOLEAN NOT NULL DEFAULT FALSE,
      points       INTEGER NOT NULL DEFAULT 0,
      joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  /* ------------------------------------------------------------------
     Everything from here reads or writes tables, so it has to come after
     every CREATE TABLE above and not next to the column it is about.

     This was learnt the hard way: these ran before egg_signup was
     created, which worked on every database that already had the
     previous release and killed the one that did not — the server exited
     on 「relation "egg_signup" does not exist」 before it ever listened,
     and systemd restarted it into the same wall seventy times.
     ------------------------------------------------------------------ */

  /* 仕様書 4.10 の連絡担当者は「名前・メールアドレス」. The name comes from
     the employee record, as it always has; this is for the address when
     the registry's is not the one the parcel notice should go to — an
     office with a shared inbox, say. Empty means use the record's. */
  await pool.query(
    'ALTER TABLE egg_offices ADD COLUMN IF NOT EXISTS contact_mail TEXT',
  );

  /* 配布ルール 10（2026/11/05）: allocating and confirming are two acts by
     two different moments. drawn_at says the system has worked the week
     out; final_at says a human has looked at it and stands behind it.
     Only the second one is an answer to anybody, and only the second one
     sends email — which is why it is a column and not a flag derived
     from the clock. */
  await pool.query(
    'ALTER TABLE egg_weeks ADD COLUMN IF NOT EXISTS final_at TIMESTAMPTZ',
  );
  await pool.query(
    `ALTER TABLE egg_weeks ADD COLUMN IF NOT EXISTS final_by TEXT
       REFERENCES employees(id) ON DELETE SET NULL`,
  );
  /* Weeks decided before this existed were final the moment they were
     drawn, because there was nothing else to wait for. Without this they
     would all read 確認中 for ever. */
  await pool.query(
    'UPDATE egg_weeks SET final_at = drawn_at WHERE final_at IS NULL AND drawn_at IS NOT NULL',
  );

  /* The seven offices and their minimums (仕様書 4.10), written once so a
     fresh database and the live one agree. Only inserted, never updated:
     the numbers are an administrator's to change in 事業所の設定 from the
     moment this has run, and an upsert would undo their work on every
     restart. 新長田 left the list on 2026/11/05 when every shipment moved
     to a courier — deactivated rather than deleted, because requests and
     weeks already reference it by name. */
  for (const [name, min] of Object.entries(OFFICE_MIN_DEFAULT)) {
    await pool.query(
      `INSERT INTO egg_offices (name, active, min_packs) VALUES ($1, TRUE, $2)
       ON CONFLICT (name) DO NOTHING`,
      [name, min],
    );
  }
  await pool.query(
    "UPDATE egg_offices SET active = FALSE WHERE name = '新長田' AND active",
  );

  /* The three offices that existed before 2026/11/05 were set up by hand
     and carry whatever minimum was typed then — 本社 3 where the rules now
     say 1, 東京 3 where they say 4. Inserting defaults does not reach them,
     so the new numbers are applied once, here, and recorded as done.

     Once, and not on every restart: from the moment this has run the
     minimum belongs to whoever is looking at 事業所の設定, and a migration
     that kept reasserting itself would quietly undo their work every time
     the server came back up. */
  const stampRow = await pool.query(
    "SELECT 1 FROM config WHERE key = 'job:officeMin1105'",
  );
  if (!stampRow.rowCount) {
    for (const [name, min] of Object.entries(OFFICE_MIN_DEFAULT)) {
      await pool.query('UPDATE egg_offices SET min_packs = $2 WHERE name = $1', [name, min]);
    }
    await pool.query(
      `INSERT INTO config (key, value) VALUES ('job:officeMin1105', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(new Date().toISOString())],
    );
  }

  const hqOld = '本社';
  const hqNew = '本社（神戸）';
  for (const q of [
    ['UPDATE egg_requests SET office = $2 WHERE office = $1', [hqOld, hqNew]],
    ['UPDATE egg_requests SET at_office = $2 WHERE at_office = $1', [hqOld, hqNew]],
    ['UPDATE egg_signup SET office = $2 WHERE office = $1', [hqOld, hqNew]],
    [`UPDATE egg_week_offices w SET office = $2 WHERE office = $1
        AND NOT EXISTS (SELECT 1 FROM egg_week_offices x
                         WHERE x.ship = w.ship AND x.office = $2)`, [hqOld, hqNew]],
    ['DELETE FROM egg_week_offices WHERE office = $1', [hqOld]],
    [`UPDATE egg_offices SET name = $2 WHERE name = $1
        AND NOT EXISTS (SELECT 1 FROM egg_offices WHERE name = $2)`, [hqOld, hqNew]],
    ['DELETE FROM egg_offices WHERE name = $1', [hqOld]],
  ]) {
    await pool.query(q[0], q[1]);
  }

  /* The addresses, once. Same shape as the minimums above and for the
     same reason: from the moment this has run they belong to whoever
     opens 事業所の設定, and a migration that reasserted itself on every
     restart would undo their work. Only an office with no address yet is
     given one, so a correction typed in before this ships survives it.

     After the rename and not before it, because 本社 is one of the seven
     and the row this writes to has to be the one that survives. It does
     work before — the insert loop above has already created 本社（神戸）
     by then — but only if you follow three separate steps to see why,
     and a migration should not need that. */
  const addrDone = await pool.query("SELECT 1 FROM config WHERE key = 'job:officeAddr1105'");
  if (!addrDone.rowCount) {
    for (const [name, address] of Object.entries(OFFICE_ADDRESS)) {
      await pool.query(
        "UPDATE egg_offices SET address = $2 WHERE name = $1 AND COALESCE(address, '') = ''",
        [name, address],
      );
    }
    await pool.query(
      `INSERT INTO config (key, value) VALUES ('job:officeAddr1105', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(new Date().toISOString())],
    );
  }

  /* The consent used to be a checkbox on the sign-in screen, and signing in
     without noticing it recorded a "no". That is not an answer, so everyone
     it happened to is marked unasked again and is put through the consent
     screen once. A recorded "yes" is left alone — ticking a box is a
     deliberate act in a way that leaving one blank is not.

     Guarded by a row in config so it runs once and never undoes a later
     「同意しない」. */
  const done = await pool.query("SELECT 1 FROM config WHERE key = 'migr.consentReask'");
  if (!done.rows.length) {
    const r = await pool.query(
      'UPDATE employees SET consent_asked = FALSE WHERE consent = FALSE AND consent_asked',
    );
    await pool.query(
      `INSERT INTO config (key, value) VALUES ('migr.consentReask', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify({ at: Date.now(), rows: r.rowCount })],
    );
    if (r.rowCount) console.log(`  Consent  : ${r.rowCount} to be asked again`);
  }

  /* 佐野 moved the first request day to 11/19 on the 11th and back to
     11/21 on the 12th. The date lives in the settings, so changing the
     default only reaches a database that starts empty — every running
     deployment kept the 19th and went on printing
     「リクエストは11月19日（木）から受け付けます」.

     Only the 19th is rewritten, and only once. Any other date is a date
     somebody chose in 管理, and this has no business touching it. */
  const reqFix = await pool.query("SELECT 1 FROM config WHERE key = 'job:reqFrom1112'");
  if (!reqFix.rowCount) {
    const u = await pool.query(
      `UPDATE config
          SET value = jsonb_set(value, '{egg,requestsFrom}', '"2026-11-21"')
        WHERE key = 'cfg' AND value->'egg'->>'requestsFrom' = '2026-11-19'`,
    );
    await pool.query(
      `INSERT INTO config (key, value) VALUES ('job:reqFrom1112', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify({ at: Date.now(), rows: u.rowCount })],
    );
    if (u.rowCount) console.log('  Eggs     : requests open 2026-11-21 (was the 19th)');
  }

  /* サブ・メールアドレス is optional and is meant to come up empty, with
     only its placeholder showing. It came up holding the person's work
     address instead: the browser autofilled the <input type="email"> on
     the sign-up screen and the value was saved with the rest of the form.
     The screens stopped offering autofill on 11/11 and the server now
     drops a sub address equal to the main one, but the rows written
     before that still carry it, and 佐野 is looking at one of them.

     A sub address that merely repeats the main one sends nothing extra,
     so clearing it loses no one any mail. Only an exact match goes; a
     different address is a real second address. */
  const subFix = await pool.query("SELECT 1 FROM config WHERE key = 'job:subMail1112'");
  if (!subFix.rowCount) {
    const u = await pool.query(
      `UPDATE egg_signup s
          SET private_mail = NULL, notify_priv = FALSE
         FROM employees e
        WHERE e.id = s.employee_id
          AND s.private_mail IS NOT NULL
          AND lower(btrim(s.private_mail))
              = lower(btrim(split_part(regexp_replace(e.email, '[;\n]', ',', 'g'), ',', 1)))`,
    );
    await pool.query(
      `INSERT INTO config (key, value) VALUES ('job:subMail1112', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify({ at: Date.now(), rows: u.rowCount })],
    );
    if (u.rowCount) console.log(`  Eggs     : ${u.rowCount} sub address(es) cleared (same as the main one)`);
  }

  /* 2026/11/12, 佐野:「到着は発送の翌日、東京はさらに1日後」. The column
     defaults to 0, which is right for six of the seven offices and wrong
     for 東京, so 東京 is given its night once.

     Once, like the minimums above: from here the number belongs to
     whoever opens 事業所の設定, and a migration that reasserted itself
     every restart would undo a correction typed in after this shipped. */
  const lateFix = await pool.query("SELECT 1 FROM config WHERE key = 'job:arriveDays1112'");
  if (!lateFix.rowCount) {
    const u = await pool.query(
      "UPDATE egg_offices SET arrive_days = 1 WHERE name = '東京' AND arrive_days = 0",
    );
    await pool.query(
      `INSERT INTO config (key, value) VALUES ('job:arriveDays1112', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify({ at: Date.now(), rows: u.rowCount })],
    );
    if (u.rowCount) console.log('  Eggs     : 東京 arrives a day after the other offices');
  }

  /* 2026/11/13 佐野, twice:「最低発送パック数（姫路、京都は2パック、それ
     以外は4パック）」. 本社（神戸）was on 1 and 東京 on 2 — the 東京 figure
     is the one she gave on 11/06 and has now changed, and the 本社 figure
     has been 1 since the table was first filled.

     Only those two values, and only once. A minimum somebody has since
     typed in 事業所の設定 is theirs, and 4 is not more correct than
     whatever they chose — the point of this is the two she named, not a
     number this file prefers. */
  const minFix = await pool.query("SELECT 1 FROM config WHERE key = 'job:officeMin1113'");
  if (!minFix.rowCount) {
    const u = await pool.query(
      `UPDATE egg_offices SET min_packs = 4
        WHERE (name = '本社（神戸）' AND min_packs = 1)
           OR (name = '東京' AND min_packs = 2)`,
    );
    await pool.query(
      `INSERT INTO config (key, value) VALUES ('job:officeMin1113', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify({ at: Date.now(), rows: u.rowCount })],
    );
    if (u.rowCount) console.log(`  Eggs     : ${u.rowCount} office minimum(s) raised to 4`);
  }
}

/* ------------------------- row <-> client shape -------------------------- */
/* pg returns DATE columns as JS Date objects; the app wants 'YYYY-MM-DD'. */
const fmtDate = (d) => {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/* 通勤経路 is the only free-form structure on a person's record, and it is
   written from an import and from a form, so it is normalised on the way in
   rather than trusted. Anything unrecognisable becomes an empty list: a
   missing route is a visible gap someone can fix, where a half-parsed one is
   a wrong fare on a claim. Six legs is what the paper form has room for. */
const MAX_LEGS = 6;
const leg = (x) => {
  const str = (v, n) => String(v ?? '').trim().slice(0, n);
  /* Number('') is 0, so a blank or unreadable fare would become a ¥0 one —
     which on a claim reads as "this journey is free" rather than "nobody has
     filled this in". Empty stays empty. */
  const yen = (v) => {
    const cleaned = String(v ?? '').replace(/[^\d.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;
    const k = Math.round(Number(cleaned));
    return Number.isFinite(k) && k >= 0 && k <= 1_000_000 ? k : null;
  };
  return {
    carrier: str(x?.carrier, 40),
    from: str(x?.from, 40),
    to: str(x?.to, 40),
    oneWay: yen(x?.oneWay),
    pass: yen(x?.pass),
  };
};
export const cleanCommute = (v) => (Array.isArray(v) ? v : [])
  .slice(0, MAX_LEGS)
  .map(leg)
  .filter((x) => x.carrier || x.from || x.to || x.oneWay != null || x.pass != null);

const toEmployee = (r) => ({
  id: r.id,
  name: r.name,
  region: r.region || '',
  gender: r.gender || '',
  dept: r.dept || '',
  section: r.section || '',
  client: r.client || '',
  affiliation: r.affiliation || '',
  workStart: r.work_start || '',
  workEnd: r.work_end || '',
  address: r.address || '',
  homeStation: r.home_station || '',
  workplace: r.workplace || '',
  workStation: r.work_station || '',
  commute: Array.isArray(r.commute) ? r.commute : [],
  ...(r.mypage ? { mypage: true } : {}),
  ...(r.egg ? { egg: true } : {}),
  ...(r.egg_farm ? { eggFarm: true } : {}),
  email: r.email || '',
  email2: r.email2 || '',
  email2On: !!r.email2_on,
  pedometer: r.pedometer || '',
  active: r.active,
  consent: r.consent,
  ...(r.trial ? { trial: true } : {}),
  ...(r.dob ? { dob: fmtDate(r.dob) } : {}),
  ...(r.consent_asked ? { consentAsked: true } : {}),
  ...(r.consent_at ? { consentAt: new Date(r.consent_at).getTime() } : {}),
});

async function getRoster() {
  const { rows } = await pool.query('SELECT * FROM employees ORDER BY sort_order, id');
  return rows.length ? rows.map(toEmployee) : null;
}

async function setRoster(list) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = list.map((p) => String(p.id));
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      await client.query(
        `INSERT INTO employees (id, name, region, gender, email, pedometer, active,
                                consent, consent_asked, consent_at, sort_order, trial, dob,
                                email2, email2_on, dept, section, client,
                                affiliation, work_start, work_end, address, home_station,
                                workplace, work_station, commute, mypage, egg, egg_farm)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                 $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, region = EXCLUDED.region, gender = EXCLUDED.gender,
           email = EXCLUDED.email, pedometer = EXCLUDED.pedometer, active = EXCLUDED.active,
           consent = EXCLUDED.consent, consent_asked = EXCLUDED.consent_asked,
           consent_at = EXCLUDED.consent_at, sort_order = EXCLUDED.sort_order,
           trial = EXCLUDED.trial, dob = EXCLUDED.dob,
           email2 = EXCLUDED.email2, email2_on = EXCLUDED.email2_on,
           dept = EXCLUDED.dept, section = EXCLUDED.section, client = EXCLUDED.client,
           affiliation = EXCLUDED.affiliation,
           work_start = EXCLUDED.work_start, work_end = EXCLUDED.work_end,
           address = EXCLUDED.address, home_station = EXCLUDED.home_station,
           workplace = EXCLUDED.workplace, work_station = EXCLUDED.work_station,
           commute = EXCLUDED.commute, mypage = EXCLUDED.mypage, egg = EXCLUDED.egg,
           egg_farm = EXCLUDED.egg_farm`,
        [
          String(p.id), p.name, p.region || null, p.gender || null, p.email || null,
          p.pedometer || null, p.active !== false, !!p.consent, !!p.consentAsked,
          p.consentAt ? new Date(p.consentAt) : null, i, !!p.trial, p.dob || null,
          p.email2 || null, !!p.email2On,
          p.dept || null, p.section || null, p.client || null,
          p.affiliation || null, p.workStart || null, p.workEnd || null,
          p.address || null, p.homeStation || null,
          p.workplace || null, p.workStation || null,
          JSON.stringify(cleanCommute(p.commute)), !!p.mypage, !!p.egg, !!p.eggFarm,
        ],
      );
    }
    if (ids.length) {
      await client.query(`DELETE FROM employees WHERE NOT (id = ANY($1::text[]))`, [ids]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getEntry(period, employeeId) {
  const { rows } = await pool.query(
    'SELECT * FROM entries WHERE period = $1 AND employee_id = $2', [period, employeeId],
  );
  if (!rows.length) return null;
  const e = rows[0];
  const days = await pool.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, steps FROM entry_days
     WHERE period = $1 AND employee_id = $2 ORDER BY day`, [period, employeeId],
  );
  const steps = {};
  days.rows.forEach((d) => { steps[d.day] = d.steps; });
  return {
    steps,
    submitted: e.submitted,
    ...(e.auto ? { auto: true } : {}),
    ...(e.submitted_at ? { submittedAt: new Date(e.submitted_at).getTime() } : {}),
    updatedAt: new Date(e.updated_at).getTime(),
  };
}

async function setEntry(period, employeeId, v) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO entries (period, employee_id, submitted, auto, submitted_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (period, employee_id) DO UPDATE SET
         submitted = EXCLUDED.submitted, auto = EXCLUDED.auto,
         submitted_at = EXCLUDED.submitted_at, updated_at = NOW()`,
      [period, employeeId, !!v.submitted, !!v.auto, v.submittedAt ? new Date(v.submittedAt) : null],
    );
    await client.query('DELETE FROM entry_days WHERE period = $1 AND employee_id = $2', [period, employeeId]);
    const steps = v.steps || {};
    const days = Object.keys(steps).filter((d) => steps[d] != null && steps[d] !== '');
    if (days.length) {
      const values = [];
      const params = [];
      days.forEach((d, i) => {
        values.push(`($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3}::date,$${i * 4 + 4})`);
        params.push(period, employeeId, d, Number(steps[d]));
      });
      await client.query(
        `INSERT INTO entry_days (period, employee_id, day, steps) VALUES ${values.join(',')}`,
        params,
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* --------------------------- the four verbs ------------------------------ */
const ENTRY_KEY = /^st:([^:]+):(.+)$/;

export async function getKey(key) {
  if (key === 'roster') return getRoster();
  const m = key.match(ENTRY_KEY);
  if (m) return getEntry(m[1], m[2]);
  const { rows } = await pool.query('SELECT value FROM config WHERE key = $1', [key]);
  return rows.length ? rows[0].value : null;
}

export async function setKey(key, value) {
  if (key === 'roster') return setRoster(value);
  const m = key.match(ENTRY_KEY);
  if (m) return setEntry(m[1], m[2], value);
  await pool.query(
    `INSERT INTO config (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}

export async function delKey(key) {
  const m = key.match(ENTRY_KEY);
  if (m) {
    await pool.query('DELETE FROM entries WHERE period = $1 AND employee_id = $2', [m[1], m[2]]);
    return;
  }
  if (key === 'roster') { await pool.query('DELETE FROM employees'); return; }
  await pool.query('DELETE FROM config WHERE key = $1', [key]);
}

export async function listKeys(prefix) {
  const m = prefix.match(/^st:([^:]*):?$/);
  if (m && m[1]) {
    const { rows } = await pool.query('SELECT employee_id FROM entries WHERE period = $1', [m[1]]);
    return rows.map((r) => `st:${m[1]}:${r.employee_id}`);
  }
  const out = [];
  if ('roster'.startsWith(prefix)) out.push('roster');
  const { rows } = await pool.query('SELECT key FROM config WHERE key LIKE $1', [`${prefix}%`]);
  return out.concat(rows.map((r) => r.key));
}

/**
 * Trial self-registration. Refuses an employee number that already exists so a
 * trial signup can never overwrite a real participant's record.
 */
export async function registerTrial(p) {
  const id = String(p.id || '').trim();
  if (!id) return { error: 'id_required' };
  const dup = await pool.query('SELECT trial FROM employees WHERE id = $1', [id]);
  if (dup.rows.length) return { error: 'exists', trial: dup.rows[0].trial };
  const { rows } = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM employees');
  await pool.query(
    `INSERT INTO employees (id, name, region, gender, email, dob, active, trial, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE,TRUE,$7)`,
    [id, p.name, p.region || null, p.gender || null, p.email || null, p.dob || null, rows[0].n],
  );
  return { ok: true, id };
}

/* ----------------------------- sessions ---------------------------------- */
/* A session is the only thing that says who a request is from. The browser
   holds nothing but an opaque id in an httpOnly cookie. */

export async function createSession(sid, employeeId, isAdmin, days) {
  await pool.query(
    `INSERT INTO sessions (sid, employee_id, is_admin, expires_at)
     VALUES ($1,$2,$3, NOW() + ($4 || ' days')::interval)`,
    [sid, employeeId, !!isAdmin, String(days)],
  );
}

export async function getSession(sid) {
  if (!sid) return null;
  const { rows } = await pool.query(
    'SELECT sid, employee_id, is_admin FROM sessions WHERE sid = $1 AND expires_at > NOW()',
    [sid],
  );
  if (!rows.length) return null;
  return { sid: rows[0].sid, employeeId: rows[0].employee_id, isAdmin: rows[0].is_admin };
}

export async function deleteSession(sid) {
  if (sid) await pool.query('DELETE FROM sessions WHERE sid = $1', [sid]);
}

export async function purgeSessions() {
  await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');
}

/* ------------------------- single-employee access ------------------------ */
/* Participants never receive the roster, only their own row. */

export async function getEmployee(id) {
  const { rows } = await pool.query('SELECT * FROM employees WHERE id = $1 AND active', [id]);
  return rows.length ? toEmployee(rows[0]) : null;
}

/** Only the fields a participant may change about themselves. */
export async function updateEmployeeSelf(id, f) {
  /* Named columns, never a spread of the request body. The company address is
     deliberately not among them — it is issued, it is what the reminder has to
     reach, and nobody should be able to point their own away from it. The
     private address beside it is theirs to set. */
  /* Of the new 個人情報 fields only the home address and its nearest station
     are here. 所属, 働き方, 勤務先 and 通勤経路 are not a person's to set:
     the first three are assigned, like the company address above, and the
     working hours decide what counts as overtime — somebody who could move
     their own 始業 could manufacture it. 通勤経路 carries the fare that ends
     up on a claim, and 健康対策委員会 have already ruled that a fare nobody
     checked must not reach an approver. All four are the administrator's. */
  const { rows } = await pool.query(
    `UPDATE employees
        SET region = $2, gender = $3, pedometer = $4,
            email2 = $5, email2_on = $6, consent = $7,
            address = $8, home_station = $9,
            consent_asked = TRUE,
            consent_at = CASE WHEN consent IS DISTINCT FROM $7 THEN NOW() ELSE consent_at END
      WHERE id = $1 AND active RETURNING *`,
    [id, f.region || null, f.gender || null, f.pedometer || null,
     f.email2 || null, !!f.email2On, !!f.consent,
     f.address || null, f.homeStation || null],
  );
  return rows.length ? toEmployee(rows[0]) : null;
}

/* ------------------------------ 添付ファイル ----------------------------- */
/* Every one of these takes the owner's id from the session and puts it in the
   WHERE clause, rather than trusting an id that came with the request. A
   delay certificate carries a name, a date and a station; it is not something
   one colleague should be able to read off another by guessing a number. */

export async function addUpload({ id, employeeId, period, kind, name, mime, bytes }) {
  await pool.query(
    `INSERT INTO uploads (id, employee_id, period, kind, name, mime, bytes, size)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, String(employeeId), period, kind, name, mime, bytes, bytes.length],
  );
  return { id, name, mime, size: bytes.length, kind, createdAt: Date.now() };
}

/** What a person has attached to one month — never the bytes, which are only
    ever fetched one at a time. */
export async function listUploads(employeeId, period) {
  const { rows } = await pool.query(
    `SELECT id, kind, name, mime, size, created_at FROM uploads
      WHERE employee_id = $1 AND period = $2 ORDER BY created_at`,
    [String(employeeId), period],
  );
  return rows.map((r) => ({
    id: r.id, kind: r.kind, name: r.name, mime: r.mime, size: r.size,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

/** One file, and only if it belongs to the person asking. */
export async function getUpload(id, employeeId) {
  const { rows } = await pool.query(
    'SELECT name, mime, bytes FROM uploads WHERE id = $1 AND employee_id = $2',
    [id, String(employeeId)],
  );
  return rows[0] || null;
}

export async function deleteUpload(id, employeeId) {
  const { rowCount } = await pool.query(
    'DELETE FROM uploads WHERE id = $1 AND employee_id = $2',
    [id, String(employeeId)],
  );
  return rowCount > 0;
}

/** How much one person is holding, so a limit can be put on it. */
export async function uploadBytes(employeeId) {
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(size), 0)::bigint AS n FROM uploads WHERE employee_id = $1',
    [String(employeeId)],
  );
  return Number(rows[0].n);
}

/** The consent screen's answer. Deliberately narrow: it cannot touch any
    other column, so the one screen a participant sees before anything else
    can only ever record the choice it asked for. */
export async function setConsent(id, agree) {
  const { rows } = await pool.query(
    `UPDATE employees
        SET consent = $2, consent_asked = TRUE, consent_at = NOW()
      WHERE id = $1 AND active RETURNING *`,
    [id, !!agree],
  );
  return rows.length ? toEmployee(rows[0]) : null;
}

export async function addFeedback(f) {
  const { rows } = await pool.query(
    `INSERT INTO feedback (name, email, employee_id, category, message, sent)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
    [f.name || null, f.email || null, f.employeeId || null, f.category || null, f.message, !!f.sent],
  );
  return rows[0];
}

export async function listFeedback() {
  const { rows } = await pool.query(
    'SELECT * FROM feedback ORDER BY created_at DESC LIMIT 200',
  );
  return rows.map((r) => ({
    id: r.id, at: new Date(r.created_at).getTime(), name: r.name, email: r.email,
    employeeId: r.employee_id, category: r.category, message: r.message, sent: r.sent,
  }));
}

/* Used by the reminder and auto-submit jobs, which need everyone at once. */
export async function allEntriesForPeriod(period) {
  const { rows } = await pool.query('SELECT employee_id, submitted FROM entries WHERE period = $1', [period]);
  const map = {};
  rows.forEach((r) => { map[r.employee_id] = { submitted: r.submitted }; });
  return map;
}

/* ----------------------------- 需要調査 ---------------------------------
   モラエッグ Phase 0. Three functions, and between them they are the whole
   promise: you may record your own answer, read back your own answer, and
   read everybody's as counts. Nothing offers one person's answer to another
   person, an administrator included.
   ---------------------------------------------------------------------- */

/**
 * Record or change this person's answer.
 *
 * The employee id comes from the session at the call site, never from a
 * request body, and it is the primary key — so a second answer replaces the
 * first instead of being counted again, and 「1人1回のみ」 is a property of
 * the table rather than a check somebody has to remember to write.
 */
export async function eggVote(employeeId, { office, rule, name, comment }) {
  await pool.query(
    `INSERT INTO egg_votes (employee_id, office, rule, name, comment, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (employee_id) DO UPDATE
       SET office = EXCLUDED.office, rule = EXCLUDED.rule, name = EXCLUDED.name,
           comment = EXCLUDED.comment, updated_at = NOW()`,
    [String(employeeId), office, rule, name || null, comment || null],
  );
  return true;
}

/**
 * This person's own answer, so the form can open on what they chose last
 * time. Their own and nobody else's: the id in the WHERE clause is the
 * caller's, and there is no argument that would widen it.
 */
export async function eggMyVote(employeeId) {
  const { rows } = await pool.query(
    'SELECT office, rule, name, comment FROM egg_votes WHERE employee_id = $1',
    [String(employeeId)],
  );
  return rows[0] || null;
}

/**
 * Everybody's answers, as rows of office and rule — with no employee id
 * selected, so the anonymity does not rest on the caller remembering to
 * drop it. tally() in src/egg.js turns these into counts.
 */
export async function eggRows() {
  const { rows } = await pool.query('SELECT office, rule, name, comment FROM egg_votes');
  return rows;
}

/** How many people could answer: 正社員 with the portal open to them. */
export async function eggAudience() {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM employees WHERE egg = TRUE AND active IS NOT FALSE',
  );
  return rows[0]?.n || 0;
}

/* ===================== モラエッグ Phase 1：配布の運用 ===================== */

/* Unlike the survey above, none of this is anonymous and it cannot be: a
   pack has to be handed to a named person at a named desk. What is kept
   narrow instead is who can read what — an office contact sees their own
   office's list and the committee sees totals, and the queries below are
   written to make that the easy thing to do. */

/* ------------------------------ 事務所 ----------------------------------- */

/** The offices actually receiving eggs, with the contact who signs for them. */
export async function eggOfficeRows(activeOnly = false) {
  const { rows } = await pool.query(
    /* The 連絡担当者 columns are deliberately not selected since
       2026/11/06. The join that fetched them read an employee's name and
       email address out of the roster and handed both to every caller of
       the offices and portal routes — which was the point while a
       contact existed, and is a person's details travelling for no
       reason now that one does not. The columns stay in the table; they
       just stop leaving it. */
    `SELECT o.name, o.address, o.note, o.active, o.min_packs AS "minPacks",
            o.arrive_days AS "arriveDays"
       FROM egg_offices o
      ${activeOnly ? 'WHERE o.active' : ''}
      ORDER BY o.name`,
  );
  /* 佐野's order, not the collation's: her dictionary lists the offices
     本社・東京・大阪・三田・姫路・京都・尼崎, and a screen that puts them in
     another order every time the database is asked is a screen nobody
     can scan. Anything not on her list sorts after it, by name. */
  const rank = new Map(EGG_OFFICES.map((n, i) => [n, i]));
  const at = (n) => (rank.has(n) ? rank.get(n) : 99);
  return rows.sort((a, b) => (
    at(a.name) - at(b.name) || String(a.name).localeCompare(String(b.name), 'ja')
  ));
}

/**
 * Create or amend one office.
 *
 * A patch, not a replacement: only the fields actually passed are
 * written. The whole-row version lost 大阪's address every time anything
 * saved its minimum — the screen sent what it had on it, and what it did
 * not have it quietly cleared. A field left out now means "leave it
 * alone", which is what every caller already assumed.
 */
export async function eggOfficeSave(patch = {}) {
  const name = String(patch.name || '').trim();
  if (!name) return false;
  await pool.query(
    `INSERT INTO egg_offices (name, active, min_packs) VALUES ($1, TRUE, $2)
     ON CONFLICT (name) DO NOTHING`,
    [name, Math.max(0, Math.floor(Number(patch.minPacks) || 0))],
  );
  const sets = [];
  const vals = [name];
  const put = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if ('address' in patch) put('address', patch.address || null);
  if ('contactId' in patch) put('contact_id', patch.contactId || null);
  if ('contactMail' in patch) put('contact_mail', patch.contactMail || null);
  if ('note' in patch) put('note', patch.note || null);
  if ('active' in patch) put('active', patch.active !== false);
  if ('minPacks' in patch) put('min_packs', Math.max(0, Math.floor(Number(patch.minPacks) || 0)));
  /* Capped at 7. A courier that needs more than a week is not a courier,
     and a typo of 70 would put every arrival past its own pickup date. */
  if ('arriveDays' in patch) {
    put('arrive_days', Math.min(7, Math.max(0, Math.floor(Number(patch.arriveDays) || 0))));
  }
  if (sets.length) {
    await pool.query(`UPDATE egg_offices SET ${sets.join(', ')} WHERE name = $1`, vals);
  }
  return true;
}

export async function eggOfficeDelete(name) {
  /* Closed rather than deleted while any request still points at it — a
     request whose office has vanished is one nobody can collect. */
  const { rows } = await pool.query(
    'SELECT 1 FROM egg_requests WHERE office = $1 LIMIT 1', [String(name)],
  );
  if (rows.length) {
    await pool.query('UPDATE egg_offices SET active = FALSE WHERE name = $1', [String(name)]);
    return 'closed';
  }
  await pool.query('DELETE FROM egg_offices WHERE name = $1', [String(name)]);
  return 'deleted';
}

/** Which office this person is the contact for, if any. */
export async function eggContactFor() {
  /* 佐野, 2026/11/06:「各事業所に卵を受け取る担当者は決まっていないため、
     事業所宛てに卵を届けるかたちにします」. There is no 連絡担当者 any
     more, so nobody holds this role and this is empty for everyone.

     Empty rather than deleted, and the contact_id column is left alone
     with whatever is in it. Two reasons. The rows are a record of who
     was named while the role existed and deleting them answers a
     question nobody asked. And the role still has to be *closed*: the
     screen it unlocked is reached by a privilege check, so if this went
     on reading the column, an assignment made before today would keep
     granting a screen that no setting on any page can now show or
     revoke. A field you cannot see is not a field you can manage.

     The 事務所 screen itself stays, for administrators, who may still
     need to tick off a collection for somebody. If contacts ever come
     back, they come back here. */
  return [];
}

/* ------------------------------- 収穫 ------------------------------------ */

/** Every day's harvest between two dates, oldest first. */
export async function eggHarvest(fromDay, toDay) {
  const { rows } = await pool.query(
    `SELECT day, packs, updated_by AS "updatedBy", updated_at AS "updatedAt"
       FROM egg_harvest WHERE day >= $1 AND day <= $2 ORDER BY day`,
    [fromDay, toDay],
  );
  return rows.map((r) => ({ ...r, day: fmtDate(r.day) }));
}

/**
 * Add to (or take back from) a day's harvest, and return the new total.
 *
 * `delta` is +1 for a tap on 「+1パック」 and -1 for an undo. The addition
 * happens inside the UPDATE rather than in JavaScript, so two people in the
 * shed tapping at the same moment add two packs rather than one — read,
 * add, write would lose one of them and nobody would ever know.
 */
/* An administrator's session id is an email address, not an employee — so
   recording them as the registrar violates the foreign key and the whole
   correction fails with a 500. Whoever is not on the roster is recorded as
   nobody, which is what the ON DELETE SET NULL on this column already
   means elsewhere. */
const whoOrNull = async (id) => {
  if (!id) return null;
  const { rows } = await pool.query('SELECT 1 FROM employees WHERE id = $1', [String(id)]);
  return rows.length ? String(id) : null;
};

export async function eggHarvestBump(day, delta, employeeId) {
  const { rows } = await pool.query(
    `INSERT INTO egg_harvest (day, packs, updated_by, updated_at)
     VALUES ($1, GREATEST($2, 0), $3, NOW())
     ON CONFLICT (day) DO UPDATE
       SET packs = GREATEST(egg_harvest.packs + $2, 0),
           updated_by = $3, updated_at = NOW()
     RETURNING packs`,
    [day, Math.trunc(Number(delta) || 0), await whoOrNull(employeeId)],
  );
  return rows[0]?.packs ?? 0;
}

/** Set a day outright, for a correction that is more than one tap out. */
export async function eggHarvestSet(day, packs, employeeId) {
  const n = Math.max(0, Math.floor(Number(packs) || 0));
  const { rows } = await pool.query(
    `INSERT INTO egg_harvest (day, packs, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (day) DO UPDATE
       SET packs = EXCLUDED.packs, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING packs`,
    [day, n, await whoOrNull(employeeId)],
  );
  return rows[0]?.packs ?? 0;
}

/* ------------------------------- 申請 ------------------------------------ */

/* The id is built from the week and the person rather than generated, so the
   same pair can only ever be one row however many times a form is submitted,
   and a draw that re-runs orders ties the same way both times. */
const reqId = (ship, employeeId) => `${ship}:${employeeId}`;

export async function eggRequestSave(employeeId, ship, { office, packs, purpose, reason, hqOk }) {
  await pool.query(
    `INSERT INTO egg_requests (id, employee_id, ship, office, packs, purpose, reason, hq_ok)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE
       SET office = EXCLUDED.office, packs = EXCLUDED.packs,
           purpose = EXCLUDED.purpose, reason = EXCLUDED.reason,
           hq_ok = EXCLUDED.hq_ok, updated_at = NOW()`,
    [reqId(ship, employeeId), String(employeeId), ship, office, packs, purpose,
      reason || null, !!hqOk],
  );
  return true;
}

/** 「申請の取り消しは締切まで可能」 — the caller checks the deadline. */
export async function eggRequestDrop(employeeId, ship) {
  await pool.query(
    'DELETE FROM egg_requests WHERE employee_id = $1 AND ship = $2',
    [String(employeeId), ship],
  );
  return true;
}

/** This person's own request for a week, and nobody else's. */
export async function eggMyRequest(employeeId, ship) {
  const { rows } = await pool.query(
    `SELECT id, ship, office, packs, purpose, reason, got, hq_ok AS "hqOk",
            at_office AS "atOffice",
            drawn_at AS "drawnAt", picked_up_at AS "pickedUpAt"
       FROM egg_requests WHERE employee_id = $1 AND ship = $2`,
    [String(employeeId), ship],
  );
  const r = rows[0];
  return r ? { ...r, ship: fmtDate(r.ship) } : null;
}

/** This person's own history, newest week first. */
export async function eggMyRequests(employeeId, limit = 12) {
  const { rows } = await pool.query(
    `SELECT ship, office, packs, purpose, got, at_office AS "atOffice",
            drawn_at AS "drawnAt", picked_up_at AS "pickedUpAt"
       FROM egg_requests WHERE employee_id = $1 ORDER BY ship DESC LIMIT $2`,
    [String(employeeId), Math.min(60, Math.max(1, limit))],
  );
  return rows.map((r) => ({ ...r, ship: fmtDate(r.ship) }));
}

/**
 * A week's requests, with names, for the draw and for the contact's list.
 *
 * `office` narrows it to one office, which is what an office contact is
 * given — they have no business reading the list for 東京.
 */
export async function eggWeekRequests(ship, office = null) {
  const { rows } = await pool.query(
    `SELECT r.id, r.employee_id AS "employeeId", e.name, r.office, r.packs,
            r.purpose, r.reason, r.created_at AS "at", r.got, r.hq_ok AS "hqOk",
            r.at_office AS "atOffice", COALESCE(r.at_office, r.office) AS "collectAt",
            r.drawn_at AS "drawnAt", r.picked_up_at AS "pickedUpAt"
       FROM egg_requests r
       LEFT JOIN employees e ON e.id = r.employee_id
      /* Asked for by office, answered by where it is collected: somebody
         moved to 本社 because their own office fell short is on 本社's
         list and not on their own, which is the only list that can hand
         them the pack. Before a draw at_office is null everywhere, so
         this is the office they asked at. */
      WHERE r.ship = $1 ${office ? 'AND COALESCE(r.at_office, r.office) = $2' : ''}
      ORDER BY r.created_at, r.id`,
    office ? [ship, office] : [ship],
  );
  return rows;
}

/**
 * One request, by its id, with the week and office it belongs to.
 *
 * Collecting a pack has to find the request from the id on the button,
 * not from a guess at which week it must be in: somebody collecting on the
 * Monday of the next week would otherwise be looked up in the wrong week
 * and told their pack does not exist.
 */
export async function eggRequestById(id) {
  const { rows } = await pool.query(
    `SELECT id, employee_id AS "employeeId", ship, office, packs, got,
            COALESCE(at_office, office) AS "collectAt",
            picked_up_at AS "pickedUpAt"
       FROM egg_requests WHERE id = $1`,
    [String(id)],
  );
  const r = rows[0];
  return r ? { ...r, ship: fmtDate(r.ship) } : null;
}

/** Who asked and got nothing last week — 前回落選者優先 reads this. */
export async function eggMissed(ship) {
  const { rows } = await pool.query(
    'SELECT DISTINCT employee_id AS "employeeId" FROM egg_requests WHERE ship = $1 AND got = 0',
    [ship],
  );
  return rows.map((r) => r.employeeId);
}

/* ---------------------------- 発送週と抽選 -------------------------------- */

export async function eggWeek(ship) {
  const { rows } = await pool.query(
    `SELECT ship, packs, rule, seed, extra, points_before AS "pointsBefore",
            drawn_at AS "drawnAt", drawn_by AS "drawnBy",
            final_at AS "finalAt", final_by AS "finalBy"
       FROM egg_weeks WHERE ship = $1`,
    [ship],
  );
  const r = rows[0];
  return r ? { ...r, ship: fmtDate(r.ship) } : null;
}

/**
 * Write a week's allocation: every request's share and where it is
 * collected, the week's record of how it was decided, the per-office
 * split, and everybody's 優先ポイント as they now stand — all or nothing.
 *
 * In one transaction because a half-written draw is the worst of the
 * possible states — some people told they have packs, the week with no
 * record of the rule that decided it, and no way to tell which half ran.
 * The points are in it for the same reason: 配分 and 優先ポイント are one
 * decision (「受け取れた人は0に戻り、受け取れなかった人は+1」), and a
 * points table written without the packs it came from would make the
 * next week's order a lie.
 */
export async function eggDrawSave(ship, { packs, rule, seed, by, extra = 0 }, allocated, {
  lines = null, points = null, pointsBefore = null,
} = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO egg_weeks (ship, packs, rule, seed, extra, points_before, drawn_at, drawn_by)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
       ON CONFLICT (ship) DO UPDATE
         SET packs = EXCLUDED.packs, rule = EXCLUDED.rule, seed = EXCLUDED.seed,
             extra = EXCLUDED.extra,
             /* Never overwritten: the first run's input is the week's
                input, however many times it is replayed. */
             points_before = COALESCE(egg_weeks.points_before, EXCLUDED.points_before),
             drawn_at = NOW(), drawn_by = EXCLUDED.drawn_by`,
      [ship, packs, rule, seed, Math.max(0, Number(extra) || 0),
        pointsBefore ? JSON.stringify(pointsBefore) : null, await whoOrNull(by)],
    );
    for (const r of allocated) {
      /* at_office carries a value only for somebody moved to 本社. Written
         as null otherwise rather than as their own office, so that a row
         never claims a move that did not happen. */
      await client.query(
        'UPDATE egg_requests SET got = $2, at_office = $3, drawn_at = NOW() WHERE id = $1',
        [r.id, r.got, r.at && r.at !== r.office ? r.at : null],
      );
    }
    /* The per-office split is derived from the draw rather than typed, so
       the number the contact is told to expect is the number that was
       actually allocated to them. */
    await client.query('DELETE FROM egg_week_offices WHERE ship = $1 AND arrived_at IS NULL', [ship]);
    const byOffice = new Map();
    const bump = (office, got, spare) => {
      const cur = byOffice.get(office) || { packs: 0, extra: 0 };
      cur.packs += got; cur.extra += spare;
      byOffice.set(office, cur);
    };
    if (lines) {
      /* The allocation already worked out each office's line, 余り
         included. Trusting it here keeps one answer for the week rather
         than two that have to agree. */
      for (const l of lines) {
        if (l.packs > 0) bump(l.office, l.requested ?? l.packs, l.extra || 0);
      }
    } else {
      for (const r of allocated) {
        if (r.got > 0) bump(r.at || r.office, r.got, 0);
      }
    }
    for (const [office, n] of byOffice) {
      await client.query(
        `INSERT INTO egg_week_offices (ship, office, packs, extra) VALUES ($1, $2, $3, $4)
         ON CONFLICT (ship, office) DO UPDATE
           SET packs = EXCLUDED.packs, extra = EXCLUDED.extra`,
        [ship, office, n.packs + n.extra, n.extra],
      );
    }
    if (points) {
      const ids = Object.keys(points);
      await client.query('UPDATE egg_signup SET points = 0 WHERE points > 0');
      if (ids.length) {
        await client.query(
          `UPDATE egg_signup AS s SET points = v.p
             FROM (SELECT unnest($1::text[]) AS id, unnest($2::int[]) AS p) AS v
            WHERE s.employee_id = v.id`,
          [ids, ids.map((k) => Math.max(0, Number(points[k]) || 0))],
        );
      }
    }
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * 最終確定 — a person has looked at the week and stands behind it.
 *
 * Refuses a week that has not been allocated yet: there would be nothing
 * to stand behind, and the emails that go out on the back of this would
 * tell everybody they had missed out. Returns false rather than throwing
 * so the route can answer 409 and say which.
 */
export async function eggWeekFinalise(ship, by = null) {
  const { rows } = await pool.query(
    `UPDATE egg_weeks SET final_at = NOW(), final_by = $2
      WHERE ship = $1 AND drawn_at IS NOT NULL AND final_at IS NULL
      RETURNING ship`,
    [ship, await whoOrNull(by)],
  );
  return rows.length > 0;
}

/**
 * 確定の取り消し — put a week back to the state it was in before the
 * allocation ran.
 *
 * 2026/11/09. A week is confirmed by a person pressing a button, and a
 * person pressing a button is a person who can press the wrong one: the
 * first week on the test server was confirmed at 0 packs, which locked
 * the 丹波 screen (it refuses corrections to a decided week) and left no
 * way back short of waiting for the next Monday. There has to be a way
 * back.
 *
 * It undoes exactly what eggDrawSave wrote, in one transaction:
 *   ・every request's share, and any move to 本社, back to nothing
 *   ・the per-office split
 *   ・優先ポイント, from the snapshot the draw took before it changed them
 *   ・the week's own row, so the week reads as undecided again
 *
 * Refused once anybody has collected: packs are off the desk and in
 * somebody's bag, and no button should be able to say otherwise.
 *
 * Letters already sent cannot be recalled. That is the screen's business
 * to say, not this function's.
 */
export async function eggWeekUndo(ship) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: got } = await client.query(
      'SELECT 1 FROM egg_requests WHERE ship = $1 AND picked_up_at IS NOT NULL LIMIT 1',
      [ship],
    );
    if (got.length) { await client.query('ROLLBACK'); return 'collected'; }

    const { rows: weeks } = await client.query(
      'SELECT points_before AS "pointsBefore" FROM egg_weeks WHERE ship = $1',
      [ship],
    );
    if (!weeks.length) { await client.query('ROLLBACK'); return 'none'; }

    await client.query(
      'UPDATE egg_requests SET got = NULL, at_office = NULL, drawn_at = NULL WHERE ship = $1',
      [ship],
    );
    await client.query('DELETE FROM egg_week_offices WHERE ship = $1 AND arrived_at IS NULL', [ship]);

    /* The points as they stood before this week touched them. Restored
       the way the draw sets them — everybody to zero, then the snapshot
       written back — so that a point the draw added is taken off again
       rather than left on a row the snapshot has nothing to say about. */
    const before = weeks[0].pointsBefore;
    if (before && typeof before === 'object') {
      const ids = Object.keys(before);
      await client.query('UPDATE egg_signup SET points = 0 WHERE points > 0');
      if (ids.length) {
        await client.query(
          `UPDATE egg_signup AS s SET points = v.p
             FROM (SELECT unnest($1::text[]) AS id, unnest($2::int[]) AS p) AS v
            WHERE s.employee_id = v.id`,
          [ids, ids.map((k) => Math.max(0, Number(before[k]) || 0))],
        );
      }
    }

    await client.query('DELETE FROM egg_weeks WHERE ship = $1', [ship]);
    await client.query('COMMIT');
    return 'ok';
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function eggWeekOffices(ship) {
  const { rows } = await pool.query(
    `SELECT office, packs, extra, arrived_at AS "arrivedAt", arrived_by AS "arrivedBy"
       FROM egg_week_offices WHERE ship = $1 ORDER BY office`,
    [ship],
  );
  return rows;
}

/** 「月曜に事務所担当者が到着を確認する」 */
export async function eggArrived(ship, office, employeeId) {
  await pool.query(
    `INSERT INTO egg_week_offices (ship, office, packs, arrived_at, arrived_by)
     VALUES ($1, $2, 0, NOW(), $3)
     ON CONFLICT (ship, office) DO UPDATE SET arrived_at = NOW(), arrived_by = $3`,
    [ship, office, await whoOrNull(employeeId)],
  );
  return true;
}

/**
 * 「受け取りは、社員本人が押すか、事務所担当者がチェックする」.
 *
 * Only a request that actually won packs can be collected, which the WHERE
 * clause enforces rather than the caller: ticking off somebody who was never
 * allocated anything would quietly turn a 落選 into a 受け取り済み.
 */
export async function eggPickup(requestId, by, undo = false) {
  const { rowCount } = await pool.query(
    undo
      ? 'UPDATE egg_requests SET picked_up_at = NULL, picked_up_by = NULL WHERE id = $1'
      : `UPDATE egg_requests SET picked_up_at = NOW(), picked_up_by = $2
          WHERE id = $1 AND got > 0`,
    undo ? [requestId] : [requestId, await whoOrNull(by)],
  );
  return rowCount > 0;
}

/* ------------------------------- 同意 ------------------------------------ */

export async function eggConsent(employeeId) {
  const { rows } = await pool.query(
    'SELECT version, agreed_at AS "agreedAt" FROM egg_consents WHERE employee_id = $1',
    [String(employeeId)],
  );
  return rows[0] || null;
}

export async function eggConsentSave(employeeId, version) {
  await pool.query(
    `INSERT INTO egg_consents (employee_id, version, agreed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (employee_id) DO UPDATE SET version = EXCLUDED.version, agreed_at = NOW()`,
    [String(employeeId), String(version)],
  );
  return true;
}

/* ------------------------------ 参加登録 -------------------------------- */

export async function eggSignup(employeeId) {
  const { rows } = await pool.query(
    `SELECT office, private_mail AS "privateMail", notify_priv AS "notifyPriv",
            points, joined_at AS "joinedAt"
       FROM egg_signup WHERE employee_id = $1`,
    [String(employeeId)],
  );
  return rows[0] || null;
}

export async function eggSignupSave(employeeId, { office, privateMail, notifyPriv }) {
  await pool.query(
    `INSERT INTO egg_signup (employee_id, office, private_mail, notify_priv)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (employee_id) DO UPDATE SET
       office = EXCLUDED.office,
       private_mail = EXCLUDED.private_mail,
       notify_priv = EXCLUDED.notify_priv,
       updated_at = NOW()`,
    [String(employeeId), String(office), privateMail || null, !!notifyPriv],
  );
  return true;
}

/** Everyone registered, for the allocation and the admin's list. */
export async function eggSignups() {
  const { rows } = await pool.query(
    `SELECT s.employee_id AS "employeeId", s.office, s.points,
            s.private_mail AS "privateMail", s.notify_priv AS "notifyPriv",
            e.name
       FROM egg_signup s JOIN employees e ON e.id = s.employee_id
      WHERE e.active IS NOT FALSE
      ORDER BY s.employee_id`,
  );
  return rows;
}

/** 優先ポイント as a plain map, which is what the allocation wants. */
export async function eggPoints() {
  const { rows } = await pool.query(
    'SELECT employee_id AS id, points FROM egg_signup WHERE points > 0',
  );
  return Object.fromEntries(rows.map((r) => [String(r.id), Number(r.points) || 0]));
}

/* Written back in one statement after a draw rather than a row at a time:
   the allocation is one decision, and a half-applied points table would
   let the next week's draw run on a mixture of before and after. */
export async function eggPointsSave(points) {
  const ids = Object.keys(points || {});
  await pool.query('UPDATE egg_signup SET points = 0 WHERE points > 0');
  if (!ids.length) return true;
  await pool.query(
    `UPDATE egg_signup AS s SET points = v.p
       FROM (SELECT unnest($1::text[]) AS id, unnest($2::int[]) AS p) AS v
      WHERE s.employee_id = v.id`,
    [ids, ids.map((k) => Math.max(0, Number(points[k]) || 0))],
  );
  return true;
}

/** Who may register a harvest — 丹波側の登録者. */
export async function eggFarmers() {
  const { rows } = await pool.query(
    'SELECT id, name FROM employees WHERE egg_farm = TRUE AND active IS NOT FALSE ORDER BY id',
  );
  return rows;
}

/* ===================== モラエッグ Phase 2：料理写真 ====================== */

/* Nothing here hides an author: 7.1.2 says posts carry a name, and the
   whole point of the timeline is that they do. What these functions are
   careful about instead is the photographs — they are the only large
   objects in this database, so nothing selects their bytes unless the
   caller actually wants to send a picture. */

const nid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The timeline. Counts and the caller's own reactions, never the bytes.
 *
 * A post's photographs come back as ids only; the browser then asks for
 * each one by its own URL, which lets the thumbnails be cached properly
 * and keeps a page of twenty posts from being twenty megabytes of JSON.
 */
export async function dishFeed(viewerId, { limit = 30, before = null, admin = false } = {}) {
  const { rows } = await pool.query(
    `SELECT p.id, p.employee_id AS "employeeId", e.name AS "authorName",
            p.dish, p.body, p.recipe,
            p.created_at AS "createdAt", p.updated_at AS "updatedAt",
            p.hidden_at AS "hiddenAt",
            COALESCE((SELECT json_agg(f.id ORDER BY f.ord, f.id)
                        FROM egg_photos f WHERE f.post_id = p.id), '[]') AS photos,
            (SELECT COUNT(*)::int FROM egg_reactions r
              WHERE r.post_id = p.id AND r.kind = 'like') AS "like",
            (SELECT COUNT(*)::int FROM egg_reactions r
              WHERE r.post_id = p.id AND r.kind = 'wantToMake') AS "wantToMake",
            (SELECT COUNT(*)::int FROM egg_reactions r
              WHERE r.post_id = p.id AND r.kind = 'recipePlease') AS "recipePlease",
            COALESCE((SELECT json_agg(r.kind) FROM egg_reactions r
                       WHERE r.post_id = p.id AND r.employee_id = $1), '[]') AS mine,
            (SELECT COUNT(*)::int FROM egg_comments c
              WHERE c.post_id = p.id AND c.hidden_at IS NULL) AS "comments"
       FROM egg_posts p
       LEFT JOIN employees e ON e.id = p.employee_id
      WHERE ($2::boolean OR p.hidden_at IS NULL)
        AND ($3::timestamptz IS NULL OR p.created_at < $3)
      ORDER BY p.created_at DESC
      LIMIT $4`,
    [String(viewerId || ''), !!admin, before, Math.min(60, Math.max(1, limit))],
  );
  return rows.map((r) => ({ ...r, hidden: !!r.hiddenAt }));
}

export async function dishPost(id) {
  const { rows } = await pool.query(
    `SELECT id, employee_id AS "employeeId", dish, body, recipe,
            hidden_at AS "hiddenAt"
       FROM egg_posts WHERE id = $1`,
    [String(id)],
  );
  return rows[0] || null;
}

export async function dishCreate(employeeId, { dish, body, recipe }) {
  const id = nid();
  await pool.query(
    `INSERT INTO egg_posts (id, employee_id, dish, body, recipe)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, String(employeeId), dish, body || null, recipe || null],
  );
  return id;
}

/** 7.1.5「投稿者本人は編集・削除ができる」 — the id in the WHERE clause is
    the caller's, so there is no argument that would widen it. */
export async function dishEdit(id, employeeId, { dish, body, recipe }) {
  const { rowCount } = await pool.query(
    `UPDATE egg_posts SET dish = $3, body = $4, recipe = $5, updated_at = NOW()
      WHERE id = $1 AND employee_id = $2`,
    [String(id), String(employeeId), dish, body || null, recipe || null],
  );
  return rowCount > 0;
}

/** The poster's own delete is a real delete; the photographs go with it. */
export async function dishDelete(id, employeeId) {
  const { rowCount } = await pool.query(
    'DELETE FROM egg_posts WHERE id = $1 AND employee_id = $2',
    [String(id), String(employeeId)],
  );
  return rowCount > 0;
}

/** Section 8: an administrator hides a post rather than destroying it. */
export async function dishHide(id, by, hide = true) {
  await pool.query(
    hide
      ? 'UPDATE egg_posts SET hidden_at = NOW(), hidden_by = $2 WHERE id = $1'
      : 'UPDATE egg_posts SET hidden_at = NULL, hidden_by = NULL WHERE id = $1',
    hide ? [String(id), await whoOrNull(by)] : [String(id)],
  );
  return true;
}

/* -------------------------------- 写真 ---------------------------------- */

export async function dishPhotoAdd(postId, ord, { mime, bytes, thumb }) {
  const id = nid();
  await pool.query(
    `INSERT INTO egg_photos (id, post_id, ord, mime, bytes, size, thumb, thumb_size)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, String(postId), ord, mime, bytes, bytes.length, thumb || null, thumb ? thumb.length : null],
  );
  return id;
}

/** The small copy, written straight after the full one by its owner. */
export async function dishPhotoThumb(id, employeeId, bytes) {
  const { rowCount } = await pool.query(
    `UPDATE egg_photos f SET thumb = $3, thumb_size = $4
       FROM egg_posts p
      WHERE f.id = $1 AND f.post_id = p.id AND p.employee_id = $2`,
    [String(id), String(employeeId), bytes, bytes.length],
  );
  return rowCount > 0;
}

/** One photograph's bytes, full size or thumbnail. The only read that
    touches them, so everything else stays cheap. */
export async function dishPhoto(id, thumb = false) {
  const { rows } = await pool.query(
    thumb
      ? `SELECT mime, COALESCE(thumb, bytes) AS bytes,
                post_id AS "postId" FROM egg_photos WHERE id = $1`
      : 'SELECT mime, bytes, post_id AS "postId" FROM egg_photos WHERE id = $1',
    [String(id)],
  );
  return rows[0] || null;
}

export async function dishPhotoCount(postId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM egg_photos WHERE post_id = $1', [String(postId)],
  );
  return rows[0]?.n || 0;
}

/* ----------------------------- リアクション ------------------------------ */

/**
 * Press once to react, press again to take it back. One statement either
 * way: INSERT … ON CONFLICT DO NOTHING tells us whether the row was new,
 * and if it was not, it was already there and should go.
 */
export async function dishReact(postId, employeeId, kind) {
  const ins = await pool.query(
    `INSERT INTO egg_reactions (post_id, employee_id, kind) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [String(postId), String(employeeId), String(kind)],
  );
  if (ins.rowCount) return true;
  await pool.query(
    'DELETE FROM egg_reactions WHERE post_id = $1 AND employee_id = $2 AND kind = $3',
    [String(postId), String(employeeId), String(kind)],
  );
  return false;
}

/* ------------------------------- コメント -------------------------------- */

export async function dishComments(postId, admin = false) {
  const { rows } = await pool.query(
    `SELECT c.id, c.employee_id AS "employeeId", e.name AS "authorName",
            c.body, c.created_at AS "createdAt", c.hidden_at AS "hiddenAt"
       FROM egg_comments c
       LEFT JOIN employees e ON e.id = c.employee_id
      WHERE c.post_id = $1 AND ($2::boolean OR c.hidden_at IS NULL)
      ORDER BY c.created_at`,
    [String(postId), !!admin],
  );
  return rows.map((r) => ({ ...r, hidden: !!r.hiddenAt }));
}

export async function dishCommentAdd(postId, employeeId, body) {
  const id = nid();
  await pool.query(
    'INSERT INTO egg_comments (id, post_id, employee_id, body) VALUES ($1, $2, $3, $4)',
    [id, String(postId), String(employeeId), body],
  );
  return id;
}

/** 「自分のコメントは削除できる」; an administrator hides instead. */
export async function dishCommentDelete(id, employeeId) {
  const { rowCount } = await pool.query(
    'DELETE FROM egg_comments WHERE id = $1 AND employee_id = $2',
    [String(id), String(employeeId)],
  );
  return rowCount > 0;
}

export async function dishCommentHide(id, hide = true) {
  await pool.query(
    `UPDATE egg_comments SET hidden_at = ${hide ? 'NOW()' : 'NULL'} WHERE id = $1`,
    [String(id)],
  );
  return true;
}

/** Every post's author and month, for the badges and the month's best. */
export async function dishStats() {
  const { rows } = await pool.query(
    `SELECT p.id, p.employee_id AS "employeeId", p.dish,
            p.created_at AS "createdAt", p.hidden_at AS "hiddenAt",
            (SELECT COUNT(*)::int FROM egg_reactions r
              WHERE r.post_id = p.id AND r.kind = 'wantToMake') AS "wantToMake"
       FROM egg_posts p`,
  );
  /* pg hands back a Date, and topDish compares the first seven characters
     of the timestamp against a YYYY-MM month. String(aDate) starts "Tue
     Oct", so the month never matched and the front page never had a
     winner. Normalised here, where the row leaves the database. */
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    hidden: !!r.hiddenAt,
  }));
}
