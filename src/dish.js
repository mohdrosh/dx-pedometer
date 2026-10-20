/* ============================================================================
   モラエッグ Phase 2 — 料理写真の投稿

   佐野:「持ち帰った卵で作った料理を、インスタグラム風のタイムラインに投稿して
   もらう。目的は社員同士の会話を増やすこと」「受け取った人には投稿を『お願い』
   する位置付けとする（義務ではない）」

   The point is conversation, not compliance. Nothing here nags, nothing
   counts who has not posted, and no screen lists people who took eggs and
   stayed quiet.

   ---------------------------------------------------------------------------
   This file is where the rules live, away from the routes and the screens:
   what a post may contain, what a reaction is, and how posts are counted
   for the badges. The two things worth saying out loud:

   1. 7.1.2「投稿者名は表示する（匿名にはしない）」. This is the opposite of
      the survey, deliberately. A dish with a name on it starts a
      conversation; an anonymous one is just a photograph. So nothing in
      here hides an author, and the anonymity machinery of src/egg.js has
      no business being borrowed for it.

   2. 7.1.4「画像は自動で縮小して保存し、容量を抑える」. The downscaling
      happens in the browser, before the bytes are ever sent — which also
      strips the EXIF, and a phone photograph's EXIF carries the GPS
      position it was taken at. Somebody posting last night's omelette
      would otherwise be posting their home address. The limits below are
      the server's backstop, because a browser is not a guard.
   ========================================================================= */

/* 7.2 リアクションボタン. 佐野:「上表はあくまで参考例である。インスタグラム
   などを参考に、これ以外のボタンや機能を自由に追加してよい」 — so this is a
   table rather than three hard-coded buttons, and another can be added
   without touching the counting, the storage or the screens. */
export const REACTIONS = [
  {
    id: 'like',
    ja: '良いね', en: 'Like',
    emoji: '🥚',
    meaningJa: '気軽な反応', meaningEn: 'A casual reaction',
  },
  {
    id: 'wantToMake',
    ja: '作ってみたい！', en: 'I want to make this!',
    emoji: '🍳',
    meaningJa: '真似したい', meaningEn: 'Want to try it',
  },
  {
    /* 「投稿者に知らせる。投稿者は写真の下にレシピを追記できる」 — the only
       button that asks the poster for something, so the only one that is
       reported back to them. */
    id: 'recipePlease',
    ja: 'レシピを教えて！', en: 'Share the recipe!',
    emoji: '📖',
    meaningJa: 'レシピのリクエスト', meaningEn: 'Asks for the recipe',
    tellsPoster: true,
  },
];

export const REACTION_IDS = REACTIONS.map((r) => r.id);
export const ASKS_FOR_RECIPE = 'recipePlease';

/* Limits. The photo cap is what the server will accept after the browser
   has resized; a 1400px WebP of a plate of food is 200–300KB, so 1.5MB is
   loose enough to never reject an honest post and tight enough that a
   crafted one cannot fill the disk. */
export const DISH_MAX = 40;        /* 料理名 */
export const BODY_MAX = 600;       /* コメント */
export const RECIPE_MAX = 2000;    /* レシピ（任意） */
export const COMMENT_MAX = 400;
export const PHOTOS_MAX = 4;       /* 「写真（1〜数枚）」 */
export const PHOTO_BYTES = 1_500_000;
export const PHOTO_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

/* What the browser resizes to before uploading. Big enough that a dish
   still looks worth making, small enough that a year of posts is a few
   hundred megabytes. */
export const PHOTO_EDGE = 1400;
export const THUMB_EDGE = 420;

const tidy = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n')
  .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

/**
 * The one shape a post may take, or an error code saying why not.
 *
 * {ok:true, value} / {ok:false, error}, like cleanRequest and for the same
 * reason: somebody typed this on purpose and expects to be told what is
 * wrong with it, which a null cannot say.
 */
export function cleanPost(v) {
  const dish = tidy(v?.dish, DISH_MAX);
  if (!dish) return { ok: false, error: 'dish' };

  const photos = Array.isArray(v?.photos) ? v.photos : [];
  if (!photos.length) return { ok: false, error: 'photo' };
  if (photos.length > PHOTOS_MAX) return { ok: false, error: 'tooMany' };

  return {
    ok: true,
    value: {
      dish,
      body: tidy(v?.body, BODY_MAX),
      /* 「任意でレシピ」, and 「投稿者は写真の下にレシピを追記できる」 — so it
         is equally fine to post without one and to add one later. */
      recipe: tidy(v?.recipe, RECIPE_MAX),
    },
  };
}

/** A comment: text and nothing else. 7.3 */
export function cleanComment(v) {
  const body = tidy(v?.body, COMMENT_MAX);
  return body ? { ok: true, value: { body } } : { ok: false, error: 'empty' };
}

/** Is this a reaction this system knows about? */
export const cleanReaction = (id) => (REACTION_IDS.includes(String(id)) ? String(id) : null);

/**
 * What the server will accept as a photo, having been told its type and
 * size. The browser has already resized it; this is the backstop for the
 * case where it did not.
 */
export function photoOk(mime, bytes) {
  if (!PHOTO_TYPES.includes(String(mime))) return { ok: false, error: 'type' };
  if (!(bytes > 0)) return { ok: false, error: 'empty' };
  if (bytes > PHOTO_BYTES) return { ok: false, error: 'big' };
  return { ok: true };
}

/* ---------------------------- 7.4 盛り上げ ------------------------------- */

/* 佐野:「投稿数に応じたモラエッグのバッジ」. Thresholds rather than a formula
   so the names and the steps are visible and arguable; the first is at one
   post, because the moment worth marking is posting at all. */
export const BADGES = [
  { at: 1, id: 'first', ja: 'はじめてのひと皿', en: 'First dish', art: 'hatch' },
  { at: 3, id: 'cook', ja: 'たまごクッカー', en: 'Egg cook', art: 'hug' },
  { at: 6, id: 'chef', ja: 'モラエッグシェフ', en: 'Moraegg chef', art: 'basket' },
  { at: 12, id: 'master', ja: 'たまご番長', en: 'Egg master', art: 'seal-round' },
];

/** The badge somebody has earned with this many posts, or null. */
export function badgeFor(posts) {
  const n = Math.max(0, Math.floor(Number(posts) || 0));
  return [...BADGES].reverse().find((b) => n >= b.at) || null;
}

/**
 * 7.4:「月間の『いちばん作ってみたい料理』などをトップに表示」.
 *
 * The month's most-wanted dish, by 作ってみたい！ — the button that means
 * somebody would cook it, which is the one worth celebrating. A tie is no
 * winner rather than whichever row came back first, the same rule the
 * survey uses: an arbitrary winner printed as a fact is worse than none.
 */
export function topDish(posts, monthKey) {
  /* A Date here instead of a string is the bug that cost the front page
     its winner: String(aDate) begins "Tue Oct", not "2026-10". The caller
     should pass ISO text and does, but a function that silently returns
     nothing when handed the wrong shape is a trap, so it converts. */
  const monthOf = (v) => (v instanceof Date
    ? v.toISOString().slice(0, 7)
    : String(v || '').slice(0, 7));
  const inMonth = (posts || []).filter((p) => !p.hidden && monthOf(p.createdAt) === monthKey);
  const best = Math.max(0, ...inMonth.map((p) => Number(p.wantToMake) || 0));
  if (best <= 0) return null;
  const won = inMonth.filter((p) => (Number(p.wantToMake) || 0) === best);
  return won.length === 1 ? won[0] : null;
}

/** How many posts each person has, for the badges. Hidden ones do not count. */
export function postCounts(posts) {
  const by = new Map();
  for (const p of posts || []) {
    if (p?.hidden) continue;
    const id = String(p?.employeeId ?? '');
    if (id) by.set(id, (by.get(id) || 0) + 1);
  }
  return by;
}
