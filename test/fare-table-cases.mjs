/* 運賃表 — the company's own approved fares. */
import {
  normStation, cleanRow, matches, parsePaste, mergeRows,
} from '../src/fare-table.js';

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad += 1; console.log(`  ✗ ${label}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
};

console.log('the same station typed different ways');
is('駅 suffix', normStation('三ノ宮駅'), normStation('三ノ宮'));
is('full-width space', normStation('新　長田'), normStation('新長田'));
is('ノ and の', normStation('三の宮'), normStation('三ノ宮'));
is('ヶ and ケ', normStation('八ヶ岳'), normStation('八ケ岳'));
is('but not two different stations', normStation('三ノ宮') === normStation('三宮'), false);

console.log('a row is a fare or it is not');
is('a proper row', cleanRow({ from: '姫路', to: '三ノ宮', fare: '960', line: 'JR' }),
  { from: '姫路', to: '三ノ宮', fare: 960, line: 'JR', note: '' });
is('¥ and commas', cleanRow({ from: 'a', to: 'b', fare: '¥1,280' }).fare, 1280);
is('no fare', cleanRow({ from: 'a', to: 'b', fare: '' }), null);
is('a zero fare is not a fare', cleanRow({ from: 'a', to: 'b', fare: '0' }), null);
is('no destination', cleanRow({ from: 'a', to: '', fare: '100' }), null);

console.log('looking a journey up');
const table = [
  { from: '新長田', to: '三ノ宮', line: '神戸市営地下鉄西神・山手線', fare: 240 },
  { from: '新長田', to: '三ノ宮', line: 'JR神戸線', fare: 190 },
  { from: '姫路', to: '三ノ宮', line: 'JR神戸線', fare: 960 },
];
is('both operators come back, cheapest first',
  matches(table, '新長田', '三ノ宮').map((r) => [r.line, r.fare]),
  [['JR神戸線', 190], ['神戸市営地下鉄西神・山手線', 240]]);
is('the way home is the same route',
  matches(table, '三ノ宮', '新長田').map((r) => r.fare), [190, 240]);
is('and comes back the way it was asked',
  matches(table, '三ノ宮', '新長田')[0], { from: '三ノ宮', to: '新長田', fare: 190, line: 'JR神戸線', note: '' });
is('a station spelled loosely still matches',
  matches(table, '三の宮駅', '姫路').map((r) => r.fare), [960]);
is('a journey not in the table', matches(table, '東京', '品川'), []);
is('half a journey', matches(table, '三ノ宮', ''), []);

console.log('pasted out of Excel');
const paste = parsePaste([
  '発駅\t着駅\t路線\t運賃',
  '姫路\t三ノ宮\tJR神戸線\t960',
  '新長田\t三ノ宮\t神戸市営地下鉄\t240\t定期代が出るまで',
  '梅田,三宮,阪急神戸線,330',
  '立花\t尼崎\t190',
  '',
  'これは行ではない',
].join('\n'));
is('four fares read', paste.rows.length, 4);
is('the header was not one of them', paste.rows[0].from, '姫路');
is('a note is kept', paste.rows[1].note, '定期代が出るまで');
is('commas work as well as tabs', paste.rows[2], { from: '梅田', to: '三宮', fare: 330, line: '阪急神戸線', note: '' });
is('a table with no 路線 column still reads', paste.rows[3], { from: '立花', to: '尼崎', fare: 190, line: '', note: '' });
is('the junk line is reported, not silently dropped', paste.bad, [{ line: 7, text: 'これは行ではない' }]);

console.log('adding to a table that already has rows');
const m1 = mergeRows(table, [{ from: '姫路', to: '三ノ宮', line: 'JR神戸線', fare: 990 }]);
is('a fare revision replaces rather than stacks', [m1.added, m1.updated], [0, 1]);
is('and the new figure is the one kept',
  matches(m1.table, '姫路', '三ノ宮').map((r) => r.fare), [990]);
const m2 = mergeRows(table, [{ from: '三ノ宮', to: '姫路', line: 'JR神戸線', fare: 990 }]);
is('a row entered backwards updates the same route', [m2.added, m2.updated], [0, 1]);
const m3 = mergeRows(table, [{ from: '西明石', to: '三ノ宮', line: 'JR神戸線', fare: 680 }]);
is('a genuinely new route is added', [m3.added, m3.updated], [1, 0]);
const m4 = mergeRows(table, [{ from: '新長田', to: '三ノ宮', line: '阪神', fare: 280 }]);
is('a different line between the same stations is its own route', [m4.added, m4.updated], [1, 0]);

console.log(bad ? `\n${bad} failed` : '\nthe table reads, matches and merges as intended');
process.exit(bad ? 1 : 0);
