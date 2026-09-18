/* ============================================================================
   Storage adapter — the ONE file to change when you move to AWS.

   The app only ever calls S.get / S.set / S.del / S.list, all async.
   Keys look like:  cfg | roster | st:2608:1234567

   Two modes, chosen automatically:

   1. No VITE_API_URL set  → browser localStorage.
      Fine for developing alone. Data lives only in YOUR browser, so two
      people cannot see each other's entries.

   2. VITE_API_URL set     → HTTP calls to that server.
      `npm run server` starts the bundled server.js (a tiny JSON store) so
      the whole office can share one dataset over the LAN.

   To move to AWS: keep this file's shape, point VITE_API_URL at your API
   Gateway stage, and add the auth header your Lambda expects. Nothing in
   App.jsx needs to change.
========================================================================== */

/* Empty VITE_API_URL means "same origin" — the server serves the app and the
   API together, so /api/... resolves correctly in production and through the
   Vite dev proxy locally. Set VITE_STORAGE=local to fall back to the browser
   only (no server needed, but data stays on one machine). */
const API = import.meta.env.VITE_API_URL || '';

/* Where /api lives. VITE_API_URL wins when it is set; otherwise the API sits
   under whatever path the app itself is served from. Serving the app from a
   sub-path — nginx proxying /pedometer/ to it, say — used to leave these calls
   pointing at /api on the domain root, which is a different application or a
   404, and every sign-in came back looking like a bad employee number. */
const apiBase = () => (API || import.meta.env.BASE_URL || '').replace(/\/$/, '');
const USE_LOCAL = import.meta.env.VITE_STORAGE === 'local';
const PREFIX = 'dx:';

/* ---------- localStorage adapter (default) ---------- */
const local = {
  async get(key) {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? null : JSON.parse(raw);
  },
  async set(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  },
  async del(key) {
    localStorage.removeItem(PREFIX + key);
    return true;
  },
  async list(prefix) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) out.push(k.slice(PREFIX.length));
    }
    return out;
  },
};

/* ---------- HTTP adapter (shared server / AWS) ---------- */
async function call(path, options = {}) {
  const res = await fetch(apiBase() + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const remote = {
  async get(key) {
    const r = await call(`/api/kv?key=${encodeURIComponent(key)}`);
    return r.value ?? null;
  },
  async set(key, value) {
    await call('/api/kv', { method: 'PUT', body: JSON.stringify({ key, value }) });
    return true;
  },
  async del(key) {
    await call(`/api/kv?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
    return true;
  },
  async list(prefix) {
    const r = await call(`/api/kv/list?prefix=${encodeURIComponent(prefix)}`);
    return r.keys || [];
  },
};

const backend = USE_LOCAL ? local : remote;

/* Errors are swallowed so a dead network never blanks the screen — the app
   treats a failed read as "no data yet". Watch the console during dev. */
export const S = {
  async get(key) {
    try { return await backend.get(key); }
    catch (e) { console.warn('storage.get failed', key, e); return null; }
  },
  async set(key, value) {
    try { return await backend.set(key, value); }
    catch (e) { console.warn('storage.set failed', key, e); return false; }
  },
  async del(key) {
    try { return await backend.del(key); }
    catch (e) { console.warn('storage.del failed', key, e); return false; }
  },
  async list(prefix) {
    try { return await backend.list(prefix); }
    catch (e) { console.warn('storage.list failed', prefix, e); return []; }
  },
};

export const STORAGE_MODE = USE_LOCAL ? 'localStorage (this browser only)' : `server (${API || 'same origin'})`;


/* ---------- endpoints that are not key/value ---------- */
const base = apiBase;

/** Trial self-registration. Returns {ok:true,id} or {error:'exists'|...}. */
export async function registerTrial(person) {
  try {
    const res = await fetch(`${base()}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(person),
    });
    return await res.json();
  } catch (e) {
    console.warn('register failed', e);
    return { error: 'network' };
  }
}

/** Store feedback. Delivery by email is handled separately (EmailJS). */
export async function saveFeedback(f) {
  try {
    const res = await fetch(`${base()}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
    });
    return await res.json();
  } catch (e) {
    console.warn('feedback save failed', e);
    return null;
  }
}

export async function fetchFeedback() {
  try {
    const res = await fetch(`${base()}/api/feedback`, { credentials: 'same-origin' });
    const j = await res.json();
    return j.items || [];
  } catch { return []; }
}

/* ---------- sign-in ----------
   The server decides who you are and says so with an httpOnly cookie, so none
   of this returns anything the page could forge. In localStorage mode there is
   no server, so the caller falls back to checking the roster itself. */

const post = async (path, body) => {
  const res = await fetch(base() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

export const IS_LOCAL = USE_LOCAL;

/** Public settings for the sign-in screen — no administrator IDs. */
export async function fetchBootstrap() {
  try {
    const res = await fetch(`${base()}/api/bootstrap`, { credentials: 'same-origin' });
    return (await res.json()).cfg || null;
  } catch { return null; }
}

export async function apiLogin(id, consent) {
  const r = await post('/api/login', { id, consent });
  if (r.status === 200) return { user: r.body.user };
  if (r.status === 429) return { error: 'too_many' };
  return { error: r.body.error || 'not_found' };
}

export async function apiLogout() {
  try { await post('/api/logout'); } catch { /* signing out locally is enough */ }
}

/** Restores a session on reload. Returns null when not signed in. */
export async function apiMe() {
  try {
    const res = await fetch(`${base()}/api/me`, { credentials: 'same-origin' });
    if (!res.ok) return null;
    return (await res.json()).user || null;
  } catch { return null; }
}

/** Saves the signed-in participant's own details. */
export async function apiSaveMe(fields) {
  try {
    const res = await fetch(`${base()}/api/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(fields),
    });
    if (!res.ok) return null;
    return (await res.json()).user || null;
  } catch { return null; }
}

