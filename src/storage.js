/* ============================================================================
   Storage adapter — the ONE file to change when you move to AWS.

   The app only ever calls S.get / S.set / S.del / S.list, all async.
   Keys look like:  cfg | roster | st:2608:1810036

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
  const res = await fetch(API.replace(/\/$/, '') + path, {
    headers: { 'Content-Type': 'application/json' },
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
