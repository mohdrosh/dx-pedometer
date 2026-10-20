/* 料理写真の投稿 — what may be posted, what a reaction is, and who gets a
   badge. The opposite of the survey in one respect worth testing: a post
   carries its author's name on purpose. */

import {
  REACTIONS, REACTION_IDS, BADGES, ASKS_FOR_RECIPE,
  DISH_MAX, BODY_MAX, RECIPE_MAX, COMMENT_MAX, PHOTOS_MAX, PHOTO_BYTES,
  cleanPost, cleanComment, cleanReaction, photoOk,
  badgeFor, topDish, postCounts,
} from '../src/dish.js';

let n = 0;
const fails = [];
const is = (what, got, want) => {
  n += 1;
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) fails.push(`${what}\n    got  ${a}\n    want ${b}`);
};

const p = (over = {}) => cleanPost({ dish: 'だし巻き玉子', photos: ['a'], ...over });

/* ------------------------------- 投稿 ----------------------------------- */

is('a dish and a photo is a post',
  p(), { ok: true, value: { dish: 'だし巻き玉子', body: '', recipe: '' } });

is('a post needs a name for the dish', p({ dish: '' }), { ok: false, error: 'dish' });
is('spaces are not a name', p({ dish: '   ' }), { ok: false, error: 'dish' });
is('and it needs at least one photo', p({ photos: [] }), { ok: false, error: 'photo' });
is('nothing at all is refused rather than crashing', cleanPost(null), { ok: false, error: 'dish' });

/* 「写真（1〜数枚）」 — several, not unlimited. */
is('several photos are fine', p({ photos: ['a', 'b', 'c', 'd'] }).ok, true);
is('but not a whole album', p({ photos: ['a', 'b', 'c', 'd', 'e'] }), { ok: false, error: 'tooMany' });

is('a comment rides along', p({ body: '余った卵で作りました' }).value.body, '余った卵で作りました');
is('and a recipe, which is optional', p({ recipe: '卵3個、だし大さじ1' }).value.recipe, '卵3個、だし大さじ1');
is('no recipe is no recipe, not an empty one', p().value.recipe, '');

is('a very long dish name is cut, not refused',
  p({ dish: 'あ'.repeat(200) }).value.dish.length, DISH_MAX);
is('so is a long comment', p({ body: 'あ'.repeat(5000) }).value.body.length, BODY_MAX);
is('and a long recipe', p({ recipe: 'あ'.repeat(9000) }).value.recipe.length, RECIPE_MAX);

/* A recipe is a list of steps, so its line breaks survive — unlike the
   survey comment, which is one line by design. */
is('a recipe keeps its lines',
  p({ recipe: '1. 卵を割る\n2. だしを入れる' }).value.recipe, '1. 卵を割る\n2. だしを入れる');
is('but not a wall of blank ones',
  p({ recipe: 'あ\n\n\n\n\nい' }).value.recipe, 'あ\n\nい');
is('windows line endings come out the same',
  p({ recipe: 'あ\r\nい' }).value.recipe, 'あ\nい');

/* ------------------------------ コメント --------------------------------- */

is('a comment is its text', cleanComment({ body: 'おいしそう！' }), { ok: true, value: { body: 'おいしそう！' } });
is('an empty comment is not a comment', cleanComment({ body: '  ' }), { ok: false, error: 'empty' });
is('nothing at all is not either', cleanComment(null), { ok: false, error: 'empty' });
is('a long one is cut', cleanComment({ body: 'あ'.repeat(3000) }).value.body.length, COMMENT_MAX);

/* ----------------------------- リアクション ------------------------------ */

is('every button the screen offers can be pressed',
  REACTIONS.every((r) => cleanReaction(r.id) === r.id), true);
is('and nothing else can', cleanReaction('thumbsdown'), null);
is('nor nothing at all', cleanReaction(undefined), null);
is('there are three of them', REACTION_IDS.length, 3);
is('one of them asks the poster for something',
  REACTIONS.filter((r) => r.tellsPoster).map((r) => r.id), [ASKS_FOR_RECIPE]);

/* ------------------------------- 写真 ------------------------------------ */

is('a resized webp is accepted', photoOk('image/webp', 240_000), { ok: true });
is('so is a jpeg from an older phone', photoOk('image/jpeg', 900_000), { ok: true });
is('a PDF is not a dish', photoOk('application/pdf', 1000), { ok: false, error: 'type' });
is('nor is an empty file', photoOk('image/webp', 0), { ok: false, error: 'empty' });
/* The browser resizes before uploading; this is the backstop for when it
   did not, because a browser is not a guard. */
is('a full-size photo straight off a camera is refused',
  photoOk('image/jpeg', 8_000_000), { ok: false, error: 'big' });
is('right on the limit is still fine', photoOk('image/webp', PHOTO_BYTES), { ok: true });

/* -------------------------------- バッジ --------------------------------- */

is('nobody has a badge before they post', badgeFor(0), null);
is('the first post earns one', badgeFor(1).id, 'first');
is('and it holds until the next step', badgeFor(2).id, 'first');
is('three posts', badgeFor(3).id, 'cook');
is('six', badgeFor(6).id, 'chef');
is('twelve', badgeFor(12).id, 'master');
is('and it does not run out after that', badgeFor(400).id, 'master');
is('nonsense earns nothing', badgeFor('many'), null);
is('every badge has a picture', BADGES.every((bd) => !!bd.art), true);

is('posts are counted per person',
  [...postCounts([
    { employeeId: 'a' }, { employeeId: 'b' }, { employeeId: 'a' },
  ])].sort(), [['a', 2], ['b', 1]]);
is('a hidden post does not count towards a badge',
  postCounts([{ employeeId: 'a' }, { employeeId: 'a', hidden: true }]).get('a'), 1);
is('nothing at all counts as nobody', postCounts(null).size, 0);

/* --------------------------- 今月の一番 ---------------------------------- */

const month = [
  { id: 1, dish: 'オムレツ', createdAt: '2026-11-03T09:00:00Z', wantToMake: 2 },
  { id: 2, dish: 'TKG', createdAt: '2026-11-10T09:00:00Z', wantToMake: 5 },
  { id: 3, dish: 'プリン', createdAt: '2026-10-28T09:00:00Z', wantToMake: 9 },
];
is('the month’s most wanted dish wins', topDish(month, '2026-11').dish, 'TKG');
is('last month’s winner does not carry over', topDish(month, '2026-12'), null);
is('a month nobody posted in has no winner', topDish([], '2026-11'), null);

/* Nobody pressed 作ってみたい！ — so there is no "most wanted" to print. */
is('posts with no votes produce no winner',
  topDish([{ dish: 'x', createdAt: '2026-11-01T00:00:00Z', wantToMake: 0 }], '2026-11'), null);

/* The survey's rule, for the same reason: an arbitrary winner printed as
   a fact is worse than no winner at all. */
is('a tie decides nothing', topDish([
  { dish: 'A', createdAt: '2026-11-01T00:00:00Z', wantToMake: 4 },
  { dish: 'B', createdAt: '2026-11-02T00:00:00Z', wantToMake: 4 },
], '2026-11'), null);

/* pg hands timestamps back as Date objects, and String(aDate) begins
   "Tue Oct" — which matched no month at all and left the front page
   without a winner until it was caught against the live routes. */
is('a Date is understood as well as a string', topDish([
  { dish: 'ゆでたまご', createdAt: new Date('2026-11-04T02:00:00Z'), wantToMake: 3 },
], '2026-11').dish, 'ゆでたまご');

is('a hidden post cannot be the month’s best', topDish([
  { dish: 'hidden', createdAt: '2026-11-01T00:00:00Z', wantToMake: 99, hidden: true },
  { dish: 'shown', createdAt: '2026-11-02T00:00:00Z', wantToMake: 1 },
], '2026-11').dish, 'shown');

if (fails.length) {
  console.error(`\n  ${fails.length} of ${n} failed:\n`);
  fails.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`  ${n} checks — posts carry a name, photos are small, ties decide nothing`);
