/* 運賃 lookup, against recorded responses rather than the live service.

   NOTE ON WHAT THIS DOES AND DOES NOT PROVE. These fixtures are written to
   the shape 駅すぱあと's documentation describes; no call has been made to
   the real API, because that needs a paid key the company does not have
   yet. So this proves the parsing, the 地下鉄/JR distinction, the ordering
   and every error path — and it does not prove the field names match a live
   response. The first thing to do once a key exists is run one real lookup
   and check it against these.                                            */

import assert from 'node:assert';
import { stations, lookup, _internal } from '../src/fare.js';

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad += 1; console.log(`  ✗ ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

/* ---- the recorded responses ------------------------------------------- */

const STATIONS = Symbol('station lookup');

const POINTS = {
  新長田: { Station: { code: '22828', Name: '新長田', Yomi: 'しんながた' }, Prefecture: { Name: '兵庫県' } },
  しんながた: { Station: { code: '22828', Name: '新長田', Yomi: 'しんながた' }, Prefecture: { Name: '兵庫県' } },
  三ノ宮: { Station: { code: '22671', Name: '三ノ宮', Yomi: 'さんのみや' }, Prefecture: { Name: '兵庫県' } },
};
/* The real service answers the name it was given; the stand-in has to as
   well, or a test can pass on a route it never actually resolved. */
const stationFor = (url) => {
  const q = new URL(url).searchParams.get('name');
  const hit = POINTS[q];
  return { ResultSet: { Point: hit ? [hit] : [] } };
};

/* 新長田 → 三ノ宮, the two ways of doing it — her own example. */
const course = (lines, fare, mins) => ({
  Price: [
    { kind: 'FareSummary', Oneway: String(fare), Round: String(fare * 2) },
    { kind: 'ChargeSummary', Oneway: '0', Round: '0' },
  ],
  Route: {
    timeOnBoard: String(mins),
    timeWalk: '0',
    timeOther: '0',
    Line: lines.map(([Name, corp]) => ({ Name, Corporation: { Name: corp } })),
    Point: [
      { Station: { Name: '新長田' } },
      { Station: { Name: '三ノ宮' } },
    ],
  },
});

const ROUTES = {
  ResultSet: {
    Course: [
      course([['神戸市営地下鉄西神・山手線', '神戸市交通局']], 240, 9),
      course([['JR神戸線', 'JR西日本']], 190, 11),
    ],
  },
};

/* The one-leg journey, where 駅すぱあと sends an object instead of a list. */
const SINGLE = {
  ResultSet: {
    Course: {
      Price: { kind: 'FareSummary', Oneway: '960', Round: '1920' },
      Route: {
        timeOnBoard: '40',
        Line: { Name: 'JR神戸線', Corporation: { Name: 'JR西日本' } },
        Point: [{ Station: { Name: '姫路' } }, { Station: { Name: '三ノ宮' } }],
      },
    },
  },
};

/* ---- a stand-in for the network ---------------------------------------- */

let seen = [];
const serve = (table) => {
  seen = [];
  global.fetch = async (url) => {
    seen.push(url.toString());
    const path = new URL(url).pathname;
    let body = typeof table === 'function' ? table(path, url) : table[path];
    if (body === STATIONS) body = stationFor(url);
    if (body?.__status) {
      return { ok: false, status: body.__status, json: async () => body.body || null };
    }
    return { ok: true, status: 200, json: async () => body };
  };
};

process.env.EKISPERT_API_KEY = 'test-key-not-a-real-one';

/* ---- stations ---------------------------------------------------------- */
console.log('stations');
serve({ '/v1/json/station': STATIONS });
const found = await stations('しんながた');
is('name and code come back', found[0], { code: '22828', name: '新長田', ruby: 'しんながた', pref: '兵庫県' });
is('the key is sent, not logged', new URL(seen[0]).searchParams.get('key'), 'test-key-not-a-real-one');
is('an empty query asks nobody', await stations('   '), []);

/* ---- the distinction she asked for ------------------------------------- */
console.log('地下鉄 and JR told apart');
serve({ '/v1/json/station': STATIONS, '/v1/json/search/course/extreme': ROUTES });
const r = await lookup({ from: '新長田', to: '三ノ宮' });
is('two routes', r.length, 2);
is('cheapest first', r.map((x) => x.fare), [190, 240]);
is('each names its own line', r.map((x) => x.label), ['JR神戸線', '神戸市営地下鉄西神・山手線']);
is('and its operator', r.map((x) => x.lines[0].operator), ['JR西日本', '神戸市交通局']);
is('no transfers on either', r.map((x) => x.transfers), [0, 0]);
is('journey time carried through', r.map((x) => x.minutes), [11, 9]);
is('a name was turned into a code first',
  new URL(seen[seen.length - 1]).searchParams.get('viaList'), '22828:22671');

console.log('a station code is used as given');
serve({ '/v1/json/search/course/extreme': ROUTES });
await lookup({ from: '22828', to: '22671' });
is('no station lookup needed', seen.filter((u) => u.includes('/station')).length, 0);

console.log('one leg, which the service sends as an object not a list');
serve({ '/v1/json/search/course/extreme': SINGLE });
const one = await lookup({ from: '1', to: '2' });
is('still parsed', one.length, 1);
is('fare', one[0].fare, 960);
is('line', one[0].label, 'JR神戸線');

/* ---- the plan that cannot call the full route search -------------------
   The buy-in packs sold through Amazon — the ¥5,500 one among them — do
   not include /search/course/extreme. They do include /search/course/plain,
   which finds the same routes without timetable times; a fare is the same
   either way. Buying the cheap pack has to work, or the price quoted to
   the committee is the wrong price.                                     */
console.log('a key that only has the cheaper route search');
_internal.reset();
serve((path, url) => {
  if (path.endsWith('/station')) return stationFor(url);
  if (path.endsWith('/search/course/extreme')) {
    return { __status: 403, body: { ResultSet: { Error: { message: 'not available on this plan' } } } };
  }
  if (path.endsWith('/search/course/plain')) return ROUTES;
  return null;
});
const cheap = await lookup({ from: '新長田', to: '三ノ宮' });
is('the fares still come back', cheap.map((x) => x.fare), [190, 240]);
is('and the lines with them', cheap.map((x) => x.label), ['JR神戸線', '神戸市営地下鉄西神・山手線']);
is('it settled on the endpoint that answered', _internal.endpoint(), '/search/course/plain');
const tried = seen.filter((u) => u.includes('/search/course/')).length;
is('both were tried on the first lookup', tried, 2);

const before = seen.length;
await lookup({ from: '新長田', to: '三ノ宮' });
is('the second lookup does not try the refused one again',
  seen.slice(before).filter((u) => u.includes('extreme')).length, 0);

console.log('a key that has the full one uses it');
_internal.reset();
serve({ '/v1/json/station': STATIONS, '/v1/json/search/course/extreme': ROUTES });
await lookup({ from: '新長田', to: '三ノ宮' });
is('no fallback needed', _internal.endpoint(), '/search/course/extreme');
/* every course URL carries searchType=plain as a parameter, so this has
   to look at the path and not at the whole string */
is('and the fallback was never called',
  seen.filter((u) => new URL(u).pathname.endsWith('/course/plain')).length, 0);
_internal.reset();

/* ---- the ways it can fail ---------------------------------------------- */
console.log('failures say which failure');
const code = async (fn) => { try { await fn(); return 'no error'; } catch (e) { return e.code; } };

serve({ '/v1/json/station': { ResultSet: { Point: [] } } });
is('a station nobody knows', await code(() => lookup({ from: 'ここはどこ', to: '三ノ宮' })), 'unknown_station');
is('one station is not a journey', await code(() => lookup({ from: '三ノ宮', to: '' })), 'two_stations');

serve({ '/v1/json/station': { __status: 403 } });
is('a key the plan does not cover', await code(() => stations('三ノ宮')), 'bad_key');

serve({ '/v1/json/station': { __status: 500 } });
is('the service having a bad day', await code(() => stations('三ノ宮')), 'provider_error');

global.fetch = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
is('no network', await code(() => stations('三ノ宮')), 'unreachable');

const key = process.env.EKISPERT_API_KEY;
delete process.env.EKISPERT_API_KEY;
is('no key configured at all', await code(() => stations('三ノ宮')), 'no_key');
process.env.EKISPERT_API_KEY = key;

/* ---- the small things that break real responses ------------------------ */
console.log('odd shapes');
const { arr, num, fareOf } = _internal;
is('a lone object becomes a list', arr({ a: 1 }), [{ a: 1 }]);
is('nothing becomes nothing', arr(undefined), []);
is('a fare written as a string', num('1,280'), 1280);
is('a fare written as a number', num(640), 640);
is('nonsense is not a fare', num('—'), null);
is('運賃 is preferred over the seat charge',
  fareOf({ Price: [{ kind: 'ChargeSummary', Oneway: '5000' }, { kind: 'FareSummary', Oneway: '960' }] }), 960);
is('a course with no price at all', fareOf({}), null);

console.log(bad ? `\n${bad} failed` : '\nparsing, ordering and every error path behave');
process.exit(bad ? 1 : 0);
