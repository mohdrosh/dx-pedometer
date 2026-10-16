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
  `);

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
                                workplace, work_station, commute, mypage, egg)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                 $19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
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
           commute = EXCLUDED.commute, mypage = EXCLUDED.mypage, egg = EXCLUDED.egg`,
        [
          String(p.id), p.name, p.region || null, p.gender || null, p.email || null,
          p.pedometer || null, p.active !== false, !!p.consent, !!p.consentAsked,
          p.consentAt ? new Date(p.consentAt) : null, i, !!p.trial, p.dob || null,
          p.email2 || null, !!p.email2On,
          p.dept || null, p.section || null, p.client || null,
          p.affiliation || null, p.workStart || null, p.workEnd || null,
          p.address || null, p.homeStation || null,
          p.workplace || null, p.workStation || null,
          JSON.stringify(cleanCommute(p.commute)), !!p.mypage, !!p.egg,
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
export async function eggVote(employeeId, { office, rule, comment }) {
  await pool.query(
    `INSERT INTO egg_votes (employee_id, office, rule, comment, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (employee_id) DO UPDATE
       SET office = EXCLUDED.office, rule = EXCLUDED.rule,
           comment = EXCLUDED.comment, updated_at = NOW()`,
    [String(employeeId), office, rule, comment || null],
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
    'SELECT office, rule, comment FROM egg_votes WHERE employee_id = $1',
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
  const { rows } = await pool.query('SELECT office, rule, comment FROM egg_votes');
  return rows;
}

/** How many people could answer: 正社員 with the portal open to them. */
export async function eggAudience() {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM employees WHERE egg = TRUE AND active IS NOT FALSE',
  );
  return rows[0]?.n || 0;
}
