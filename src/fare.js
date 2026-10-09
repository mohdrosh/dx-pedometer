/* ============================================================================
   運賃 — the fare, looked up rather than remembered.

   A fare typed in from memory is a guess, and a guess on an expense claim is
   a number nobody can check. So the stations go to a route planner and the
   fare comes back with them, along with which lines the route actually uses
   — which is the other half of the question, since 地下鉄 and JR between the
   same two stations are different journeys at different prices.

   The planner is 駅すぱあと（ヴァル研究所）, which is what Japanese expense
   systems are generally built on. It needs a paid key; EKISPERT_API_KEY
   holds it. With no key the app says so and the fare stays hand-typed, which
   is exactly where it was before — nothing breaks, it just stops being
   checked.

   Everything below is shaped so a second provider could be dropped in: only
   `lookup` and `stations` are exported, and neither says 駅すぱあと in its
   signature.
   ========================================================================= */

/* EKISPERT_BASE exists so the flow can be exercised against a stand-in
   before the company has a key. Unset, it is the real service. */
const BASE = process.env.EKISPERT_BASE || 'https://api.ekispert.jp/v1/json';
const TIMEOUT_MS = 8000;

export const hasProvider = () => !!process.env.EKISPERT_API_KEY;

/* 駅すぱあと collapses a one-element array into the element itself, so every
   list in the response has to be coaxed back into being a list. Forgetting
   this is the classic way to break on the one-leg journey. */
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/* Fares come back as strings often enough to be worth being careful about.
   The empty check matters more than it looks: Number('') is 0, so a dash or
   a missing field would otherwise sail through as a ¥0 fare and land on
   somebody's expense claim as a real figure. */
const num = (v) => {
  const cleaned = String(v ?? '').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

async function call(path, params) {
  const key = process.env.EKISPERT_API_KEY;
  if (!key) { const e = new Error('no_key'); e.code = 'no_key'; throw e; }

  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('key', key);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: ac.signal });
  } catch (err) {
    const e = new Error('unreachable');
    e.code = err.name === 'AbortError' ? 'timeout' : 'unreachable';
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || body?.ResultSet?.Error) {
    const e = new Error('provider_error');
    /* 401/403 means the key is wrong or the plan does not cover this call —
       worth telling apart from a station nobody can find. */
    e.code = res.status === 401 || res.status === 403 ? 'bad_key' : 'provider_error';
    e.status = res.status;
    e.detail = body?.ResultSet?.Error?.message || null;
    throw e;
  }
  return body?.ResultSet || {};
}

/* ------------------------------ stations --------------------------------- */

/**
 * Stations matching what someone has typed, so 「三ノ宮」 and 「三宮」 both
 * find the place and the code that goes with it. The code is what the route
 * search wants; a name is ambiguous and a code is not.
 *
 * @returns [{ code, name, ruby, pref }]
 */
export async function stations(q, limit = 8) {
  const name = String(q || '').trim();
  if (!name) return [];
  const rs = await call('/station', { name, type: 'train', limit: Math.min(limit, 20) });
  return arr(rs.Point).map((p) => ({
    code: String(p?.Station?.code ?? ''),
    name: p?.Station?.Name ?? '',
    ruby: p?.Station?.Yomi ?? '',
    pref: p?.Prefecture?.Name ?? '',
  })).filter((s) => s.code && s.name);
}

/* ------------------------------- routes ---------------------------------- */

/** The legs of one route, as the lines a person would name them by. */
function legsOf(course) {
  const lines = arr(course?.Route?.Line);
  const points = arr(course?.Route?.Point);
  return lines.map((l, i) => ({
    /* 「JR神戸線」「神戸市営地下鉄西神・山手線」 — the line's own name is what
       tells 地下鉄 and JR apart between the same pair of stations, which is
       the second half of the ask. The operator is carried alongside where
       the response gives one, but the name is what goes on the form. */
    line: l?.Name || '',
    operator: l?.Corporation?.Name || l?.corporationName || '',
    from: points[i]?.Station?.Name || '',
    to: points[i + 1]?.Station?.Name || '',
  })).filter((l) => l.line);
}

/** The one-way fare, which is the figure the form wants. */
function fareOf(course) {
  const prices = arr(course?.Price);
  /* Several prices come back — the ticket, the seat reservation, the pass.
     運賃 is the ordinary fare and is the one the form means. */
  const fare = prices.find((p) => p?.kind === 'FareSummary')
    || prices.find((p) => p?.kind === 'Fare')
    || prices[0];
  return num(fare?.Oneway);
}

/**
 * Routes between two stations, cheapest first.
 *
 * @param {object} o  { from, to }  — either station codes or names
 * @returns [{ fare, minutes, transfers, lines, label }]
 */
export async function lookup({ from, to, date }) {
  const a = String(from || '').trim();
  const b = String(to || '').trim();
  if (!a || !b) { const e = new Error('two_stations'); e.code = 'two_stations'; throw e; }

  /* A name has to become a code before the route search will take it. */
  const code = async (v) => {
    if (/^\d+$/.test(v)) return v;
    const found = await stations(v, 1);
    if (!found.length) { const e = new Error('unknown_station'); e.code = 'unknown_station'; e.station = v; throw e; }
    return found[0].code;
  };
  const [ca, cb] = [await code(a), await code(b)];

  const rs = await call('/search/course/extreme', {
    viaList: `${ca}:${cb}`,
    /* A commute is not a flight and not usually a 新幹線, and leaving them in
       produces routes nobody would claim. */
    plane: false, shinkansen: false, limitedExpress: false,
    searchType: 'plain',
    ...(date ? { date: date.replace(/-/g, '') } : {}),
  });

  const out = arr(rs.Course).map((c) => {
    const lines = legsOf(c);
    return {
      fare: fareOf(c),
      minutes: num(c?.Route?.timeOnBoard) != null
        ? num(c.Route.timeOnBoard) + (num(c?.Route?.timeWalk) || 0) + (num(c?.Route?.timeOther) || 0)
        : null,
      transfers: Math.max(0, lines.length - 1),
      lines,
      /* 「JR神戸線・地下鉄西神山手線」 — what goes in 利用交通機関 */
      label: [...new Set(lines.map((l) => l.line))].join('・'),
    };
  }).filter((r) => r.fare != null && r.label);

  /* Cheapest first: on an expense claim the ordinary route is the one with
     the ordinary price, and anything dearer should be a deliberate choice. */
  out.sort((x, y) => x.fare - y.fare || (x.minutes ?? 1e9) - (y.minutes ?? 1e9));
  return out.slice(0, 5);
}

/* Exported for the tests, which feed it recorded responses rather than
   calling anyone. */
export const _internal = { arr, num, legsOf, fareOf };
