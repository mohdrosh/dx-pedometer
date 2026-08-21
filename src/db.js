/* ============================================================================
   PostgreSQL data layer.

   The browser talks to a small key/value HTTP API (see server.js), but the
   data is stored in proper relational tables so it can be queried with plain
   SQL, joined, and read by reporting tools:

     employees   one row per participant
     entries     one row per participant per month (submission state)
     entry_days  one row per day walked
     config      thresholds, regions, admin IDs, settings

   The four functions at the bottom translate the API's keys onto those
   tables:

     'cfg'                -> config
     'roster'             -> employees
     'st:2608:1810036'    -> entries + entry_days

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

    CREATE INDEX IF NOT EXISTS entries_period_idx ON entries(period);
    CREATE INDEX IF NOT EXISTS entry_days_lookup_idx ON entry_days(period, employee_id);
  `);
}

/* ------------------------- row <-> client shape -------------------------- */
const toEmployee = (r) => ({
  id: r.id,
  name: r.name,
  region: r.region || '',
  gender: r.gender || '',
  email: r.email || '',
  pedometer: r.pedometer || '',
  active: r.active,
  consent: r.consent,
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
                                consent, consent_asked, consent_at, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, region = EXCLUDED.region, gender = EXCLUDED.gender,
           email = EXCLUDED.email, pedometer = EXCLUDED.pedometer, active = EXCLUDED.active,
           consent = EXCLUDED.consent, consent_asked = EXCLUDED.consent_asked,
           consent_at = EXCLUDED.consent_at, sort_order = EXCLUDED.sort_order`,
        [
          String(p.id), p.name, p.region || null, p.gender || null, p.email || null,
          p.pedometer || null, p.active !== false, !!p.consent, !!p.consentAsked,
          p.consentAt ? new Date(p.consentAt) : null, i,
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

/* Used by the reminder and auto-submit jobs, which need everyone at once. */
export async function allEntriesForPeriod(period) {
  const { rows } = await pool.query('SELECT employee_id, submitted FROM entries WHERE period = $1', [period]);
  const map = {};
  rows.forEach((r) => { map[r.employee_id] = { submitted: r.submitted }; });
  return map;
}
