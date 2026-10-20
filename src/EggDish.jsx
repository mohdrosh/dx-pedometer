/* ============================================================================
   モラエッグ Phase 2 — 料理写真のタイムライン

   佐野:「持ち帰った卵で作った料理を、インスタグラム風のタイムラインに投稿して
   もらう。目的は社員同士の会話を増やすことで、受け取った人には投稿を『お願い』
   する位置付けとする（義務ではない）」

   Asked, not required. Nothing here nags, nothing counts who has not
   posted, and no screen anywhere lists people who took eggs and stayed
   quiet. The badges only ever go up.

   The rules are in src/dish.js and the authorization is in the routes.
   What is here is the part neither covers: making a phone photograph small
   before it is ever sent.
   ========================================================================= */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRoot } from './storage';
import {
  PHOTO_EDGE, THUMB_EDGE, PHOTOS_MAX,
  DISH_MAX, BODY_MAX, RECIPE_MAX, COMMENT_MAX, BADGES,
} from './dish.js';

const L = {
  head: ['みんなの料理', 'What people cooked'],
  lede: ['タマゴで作ったお料理を見せてください。投稿は任意です。',
    'Show us what you made. Posting is entirely up to you.'],
  /* the front of the site */
  heroKicker: ['丹波の鶏舎から', 'From the coop in Tamba'],
  heroTitle: ['モラエッグ', 'Moraegg'],
  heroSub: ['朝どれたまごを、みんなで。', 'Fresh eggs, shared.'],
  capMorning: ['朝のお出迎え', 'Morning welcome'],
  capHarvest: ['今日の取れ高', "Today's eggs"],
  capLaying: ['産卵中…', 'Laying…'],
  post: ['投稿する', 'Post a dish'],
  posting: ['送信中…', 'Posting…'],
  dish: ['料理名', 'Dish'],
  dishPh: ['例：だし巻き玉子', 'e.g. Rolled omelette'],
  body: ['ひとこと', 'A few words'],
  bodyPh: ['どんなふうに作りましたか？', 'How did you make it?'],
  recipe: ['レシピ（任意）', 'Recipe (optional)'],
  recipePh: ['材料と手順。あとから書き足せます。', 'Ingredients and steps. You can add this later.'],
  photos: ['写真', 'Photos'],
  addPhoto: ['写真を選ぶ', 'Choose photos'],
  takePhoto: ['撮影する', 'Take a photo'],
  photoNote: ['最大{n}枚。送信前に小さくするので、通信量はわずかです。',
    'Up to {n}. They are shrunk before sending, so it costs almost no data.'],
  /* 8:「写真に顧客や社外の人が写らないよう、投稿画面に注意書きを出す」 */
  careNote: ['お客様や社外の方が写っていないか、投稿前にご確認ください。',
    'Please check that no customers or people from outside the company are in the photo.'],
  cancel: ['やめる', 'Cancel'],
  save: ['保存する', 'Save'],
  edit: ['編集', 'Edit'],
  del: ['削除', 'Delete'],
  delSure: ['この投稿を削除しますか？', 'Delete this post?'],
  hide: ['非表示にする', 'Hide'],
  unhide: ['表示に戻す', 'Show again'],
  hidden: ['非表示中', 'Hidden'],
  comments: ['コメント', 'Comments'],
  commentPh: ['コメントを書く', 'Write a comment'],
  send: ['送信', 'Send'],
  noneYet: ['まだ投稿がありません。最初のひと皿をどうぞ。',
    'Nothing here yet. Be the first to cook something.'],
  topDish: ['今月の「作ってみたい」No.1', "This month's most-wanted dish"],
  nextBadge: ['あと{n}回で「{b}」', '{n} more for "{b}"'],
  fromCoop: ['丹波の鶏舎から', 'From the coop in Tamba'],
  myBadge: ['あなたのバッジ', 'Your badge'],
  myPosts: ['{n}回の投稿', '{n} posts'],
  recipeAsked: ['レシピを聞かれています。写真の下に書き足せます。',
    'Someone asked for the recipe. You can add it under the photo.'],
  close: ['閉じる', 'Close'],
  by: ['', 'by '],
  failed: ['送信できませんでした', 'Could not send that'],
  tooBig: ['写真が大きすぎます', 'That photo is too large'],
  posted: ['投稿しました。ありがとうございます！', 'Posted — thank you!'],
};

/* ---------------------------------------------------------------------------
   7.1.4「画像は自動で縮小して保存し、容量を抑える」.

   Done in the browser, on a canvas, for three reasons. The upload is a
   couple of hundred kilobytes instead of four megabytes, which matters to
   somebody posting from a phone in a car park. The server needs no native
   image library. And — the one that actually matters — re-encoding
   through a canvas drops the EXIF, and a phone photograph's EXIF carries
   the GPS position it was taken at. Posting last night's omelette should
   not post your home address.
--------------------------------------------------------------------------- */
async function shrink(file, edge, quality) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((done) => canvas.toBlob(done, 'image/webp', quality));
  /* A browser too old for WebP gives back null or a PNG; both are handled
     by falling back to JPEG, which every one of them can write. */
  if (blob && blob.type === 'image/webp') return blob;
  return new Promise((done) => canvas.toBlob(done, 'image/jpeg', quality));
}

export default function EggDish({ lang, toast }) {
  const t = useCallback((k) => (L[k] ? L[k][lang === 'ja' ? 0 : 1] || L[k][0] : k), [lang]);
  const img = (n) => `${import.meta.env.BASE_URL}moraegg/${n}.webp`;
  const pic = (id, thumb) => `${apiRoot()}/egg/photo?id=${id}${thumb ? '&thumb=1' : ''}`;

  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);          /* the composer */
  const [editing, setEditing] = useState(null);     /* a post id */
  const [form, setForm] = useState({ dish: '', body: '', recipe: '' });
  const [files, setFiles] = useState([]);
  const [showing, setShowing] = useState(null);     /* a post id, opened */
  const [full, setFull] = useState(null);           /* a photo id, full size */
  const [threads, setThreads] = useState({});       /* post id -> comments */
  const [draft, setDraft] = useState({});
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const feedRef = useRef(null);

  const api = useCallback(async (path, method = 'GET', body, type) => {
    const res = await fetch(`${apiRoot()}/egg${path}`, {
      method,
      credentials: 'same-origin',
      headers: type ? { 'Content-Type': type } : body ? { 'Content-Type': 'application/json' } : undefined,
      ...(body ? { body: type ? body : JSON.stringify(body) } : {}),
    });
    let j = null;
    try { j = await res.json(); } catch { /* an image or an empty body */ }
    return { ok: res.ok, status: res.status, ...(j || {}) };
  }, []);

  const load = useCallback(async () => {
    const j = await api('/dish');
    if (j.ok) setD(j);
  }, [api]);
  useEffect(() => { load(); }, [load]);

  /* Posts rise as they scroll into view. Marked one at a time rather than
     with a blanket class so a post already on screen is not animated in
     from nowhere, and skipped entirely for anybody who has asked for less
     movement. */
  useEffect(() => {
    if (!feedRef.current) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const io = new IntersectionObserver((rows) => {
      rows.forEach((r) => r.isIntersecting && r.target.classList.add('in'));
    }, { rootMargin: '0px 0px -40px 0px' });
    feedRef.current.querySelectorAll('.mg-post').forEach((el) => {
      el.classList.add('rise');
      io.observe(el);
    });
    return () => io.disconnect();
  }, [d]);

  if (!d) return <div className="pad muted">…</div>;

  const reset = () => {
    setOpen(false); setEditing(null);
    setForm({ dish: '', body: '', recipe: '' }); setFiles([]);
  };

  const pickFiles = (list) => {
    const picked = [...list].slice(0, PHOTOS_MAX - files.length);
    setFiles((f) => [...f, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (editing) {
        const j = await api(`/dish?id=${editing}`, 'PUT', form);
        if (!j.ok) { toast?.(t('failed')); return; }
      } else {
        if (!files.length) return;
        const made = await api('/dish', 'POST', form);
        if (!made.ok || !made.id) { toast?.(t('failed')); return; }
        let landed = 0;
        for (let i = 0; i < files.length; i += 1) {
          /* Full size first, then the small copy against the id it comes
             back with. If the second never lands the timeline simply shows
             the full image — slower, never broken. */
          const big = await shrink(files[i].file, PHOTO_EDGE, 0.82);
          const up = await api(`/photo?post=${made.id}&ord=${i}`, 'POST', big, big.type);
          if (!up.ok) { toast?.(up.status === 413 ? t('tooBig') : t('failed')); continue; }
          landed += 1;
          const small = await shrink(files[i].file, THUMB_EDGE, 0.72);
          await api(`/photo?id=${up.id}`, 'PUT', small, small.type);
        }
        /* The post is made before its photographs, so a failed upload
           would otherwise leave a dish with no picture of it sitting in
           the grid as an empty tile. If none of them landed, the post
           goes with them. */
        if (!landed) {
          await api(`/dish?id=${made.id}`, 'DELETE');
          toast?.(t('failed'));
          return;
        }
        toast?.(t('posted'));
      }
      reset();
      load();
    } finally { setBusy(false); }
  };

  const react = async (id, kind) => {
    await api('/dish/react', 'POST', { id, kind });
    load();
  };

  const openThread = async (id) => {
    if (threads[id]) { setThreads((p) => ({ ...p, [id]: null })); return; }
    const j = await api(`/dish/comments?id=${id}`);
    setThreads((p) => ({ ...p, [id]: j.comments || [] }));
  };

  const sendComment = async (id) => {
    const body = (draft[id] || '').trim();
    if (!body) return;
    const j = await api('/dish/comment', 'POST', { id, body });
    if (!j.ok) { toast?.(t('failed')); return; }
    setThreads((p) => ({ ...p, [id]: j.comments || [] }));
    setDraft((p) => ({ ...p, [id]: '' }));
    load();
  };

  const startEdit = (p) => {
    setEditing(p.id);
    setForm({ dish: p.dish || '', body: p.body || '', recipe: p.recipe || '' });
    setOpen(true);
  };

  const when = (iso) => new Date(iso).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-GB',
    { month: 'numeric', day: 'numeric' });

  return (
    <div className="mg-dish">

      {/* --------------------------- the front ---------------------------
          Three pictures across the top, the egg under them, the name on a
          banner under that — the shape he sketched. The photographs are
          pinned up rather than framed: a white edge, a soft shadow and a
          few degrees of tilt, which is what gives the Hay Day pages their
          hand-made feel. */}
      <div className="mg-hero">
        <div className="mg-hero-pics">
          {[['coop-door', 'capMorning', -5], ['dish-hero', 'capHarvest', 2],
            ['coop-nest', 'capLaying', 5]].map(([file, cap, deg]) => (
              <figure key={file} style={{ '--tilt': `${deg}deg` }}>
                <img src={img(file)} alt="" />
                <figcaption>{t(cap)}</figcaption>
              </figure>
          ))}
        </div>

        <img src={img('hug')} alt="" className="mg-hero-egg" />

        <div className="mg-hero-banner">
          <em>{t('heroKicker')}</em>
          <b>{t('heroTitle')}</b>
          <span>{t('heroSub')}</span>
        </div>
      </div>

      {/* The heading, what it is for, and the way to add to it — one bar
          rather than three stacked rows. */}
      {/* 7.4, as a strip rather than a column beside the feed: the grid
          below wants the whole width now. */}
      <div className="mg-strip2">
        {d.myBadge && (
          <span className="mg-chip">
            <img src={img(d.myBadge.art)} alt="" />
            <b>{lang === 'ja' ? d.myBadge.ja : d.myBadge.en}</b>
            <em>{t('myPosts').replace('{n}', String(d.myPosts))}</em>
          </span>
        )}
        {d.topDish && (
          <span className="mg-chip top">
            <i aria-hidden="true">🍳</i>
            <b>{d.topDish.dish}</b>
            <em>{t('topDish')}</em>
          </span>
        )}
        {!d.admin && (() => {
          const next = BADGES.find((x) => x.at > d.myPosts);
          return next ? (
            <span className="mg-next">
              {t('nextBadge')
                .replace('{n}', String(next.at - d.myPosts))
                .replace('{b}', lang === 'ja' ? next.ja : next.en)}
            </span>
          ) : null;
        })()}
      </div>

      <div className="mg-dbar">
        <b>{t('head')}</b>
        <span>{t('lede')}</span>
        {!d.admin && !open && (
          <button className="btn primary sm mg-newpost" onClick={() => setOpen(true)}>
            ＋ {t('post')}
          </button>
        )}
      </div>

      {/* -------------------------- the composer ------------------------ */}
      {open && (
        <div className="card mg-compose">
          <label className="fld"><span>{t('dish')}</span>
            <input
              value={form.dish} maxLength={DISH_MAX} placeholder={t('dishPh')}
              onChange={(e) => setForm({ ...form, dish: e.target.value })}
            />
          </label>
          <label className="fld"><span>{t('body')}</span>
            <textarea
              rows={2} maxLength={BODY_MAX} value={form.body} placeholder={t('bodyPh')}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
          <label className="fld"><span>{t('recipe')}</span>
            <textarea
              rows={3} maxLength={RECIPE_MAX} value={form.recipe} placeholder={t('recipePh')}
              onChange={(e) => setForm({ ...form, recipe: e.target.value })}
            />
          </label>

          {!editing && (
            <>
              <div className="eg-q">{t('photos')}</div>
              <div className="mg-picks">
                {files.map((f, i) => (
                  <div key={f.url} className="mg-pick">
                    <img src={f.url} alt="" />
                    <button
                      type="button" className="mg-pick-x" aria-label="×"
                      onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                    >×</button>
                  </div>
                ))}
              </div>
              {/* 7.1.3「スマホから撮ってそのまま投稿できること」 — capture
                  opens the camera directly; the other button is the roll. */}
              <input
                ref={camRef} type="file" accept="image/*" capture="environment"
                hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }}
              />
              <input
                ref={fileRef} type="file" accept="image/*" multiple
                hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }}
              />
              <div className="eg-acts">
                <button className="btn" onClick={() => camRef.current?.click()}
                  disabled={files.length >= PHOTOS_MAX}>📷 {t('takePhoto')}</button>
                <button className="btn" onClick={() => fileRef.current?.click()}
                  disabled={files.length >= PHOTOS_MAX}>{t('addPhoto')}</button>
              </div>
              <p className="muted sm">{t('photoNote').replace('{n}', String(PHOTOS_MAX))}</p>
              <p className="mg-care">{t('careNote')}</p>
            </>
          )}

          <div className="eg-acts">
            <button
              className="btn primary" disabled={busy || !form.dish.trim() || (!editing && !files.length)}
              onClick={submit}
            >{busy ? t('posting') : editing ? t('save') : t('post')}</button>
            <button className="btn ghost" disabled={busy} onClick={reset}>{t('cancel')}</button>
          </div>
        </div>
      )}

      {/* ---------------------------- the grid --------------------------
          Small square tiles, tapped to open — the shape a photo app uses,
          and the reason: a dish is recognised from a thumbnail, so twelve
          of them in a glance beats one and a half down a column. The
          whole post — the other photographs, the recipe, the reactions,
          the comments — is a tap away rather than always on screen. */}
      <div className="mg-grid" ref={feedRef}>
        {!d.posts.length && (
          <div className="card eg-shut mg-grid-none">
            <img src={img('empty')} alt="" />
            <p className="muted sm">{t('noneYet')}</p>
          </div>
        )}
        {d.posts.map((p) => (
          <button
            key={p.id} type="button"
            className={`mg-tile${p.hidden ? ' off' : ''}`}
            onClick={() => setShowing(p.id)}
          >
            {p.photos[0]
              ? <img src={pic(p.photos[0], true)} alt={p.dish} loading="lazy" />
              : <span className="mg-tile-no">🍳</span>}
            <span className="mg-tile-over">
              <b>{p.dish}</b>
              <em>{p.authorName}</em>
            </span>
            <span className="mg-tile-sum">
              {p.photos.length > 1 && <i className="mg-tile-many" aria-hidden="true">❏</i>}
              {!!p.like && <i>🥚{p.like}</i>}
              {!!p.wantToMake && <i>🍳{p.wantToMake}</i>}
              {!!p.comments && <i>💬{p.comments}</i>}
            </span>
            {p.hidden && <em className="eg-exp mg-tile-hid">{t('hidden')}</em>}
          </button>
        ))}
      </div>

      {/* ------------------------- one post, opened --------------------- */}
      {showing && (() => {
        const p = d.posts.find((x) => x.id === showing);
        if (!p) return null;
        const isMine = String(p.employeeId) === String(d.me);
        const thread = threads[p.id];
        return (
          <div
            className="mg-sheet" role="dialog" aria-modal="true"
            onClick={(e) => e.target === e.currentTarget && setShowing(null)}
          >
            <article className="mg-sheet-in">
              <header className="mg-post-h">
                <b>{p.authorName}</b>
                <span>{when(p.createdAt)}</span>
                {p.hidden && <em className="eg-exp">{t('hidden')}</em>}
                {isMine && (
                  <>
                    <button className="btn sm ghost" onClick={() => { setShowing(null); startEdit(p); }}>
                      {t('edit')}
                    </button>
                    <button
                      className="btn sm danger"
                      onClick={async () => {
                        /* eslint-disable-next-line no-alert */
                        if (!window.confirm(t('delSure'))) return;
                        await api(`/dish?id=${p.id}`, 'DELETE');
                        setShowing(null); load();
                      }}
                    >{t('del')}</button>
                  </>
                )}
                {d.admin && (
                  <button
                    className="btn sm"
                    onClick={async () => { await api('/dish/hide', 'POST', { id: p.id, hide: !p.hidden }); load(); }}
                  >{p.hidden ? t('unhide') : t('hide')}</button>
                )}
                <button
                  type="button" className="mg-sheet-x" aria-label={t('close')}
                  onClick={() => setShowing(null)}
                >×</button>
              </header>

              <h3 className="mg-post-d">{p.dish}</h3>

              {!!p.photos.length && (
                <div className={`mg-shots n${Math.min(p.photos.length, 4)}`}>
                  {p.photos.map((id) => (
                    <button key={id} type="button" onClick={() => setFull(id)}>
                      <img src={pic(id, true)} alt={p.dish} />
                    </button>
                  ))}
                </div>
              )}

              {p.body && <p className="mg-post-b">{p.body}</p>}
              {p.recipe && (
                <details className="mg-recipe" open>
                  <summary>{t('recipe')}</summary>
                  <pre>{p.recipe}</pre>
                </details>
              )}
              {isMine && !p.recipe && p.recipePlease > 0 && (
                <p className="mg-asked">{t('recipeAsked')}</p>
              )}

              <div className="mg-react">
                {d.reactions.map((r) => (
                  <button
                    key={r.id} type="button"
                    className={`mg-rx${p.mine.includes(r.id) ? ' on' : ''}`}
                    disabled={d.admin}
                    onClick={() => react(p.id, r.id)}
                    title={lang === 'ja' ? r.meaningJa : r.meaningEn}
                  >
                    <span aria-hidden="true">{r.emoji}</span>
                    {lang === 'ja' ? r.ja : r.en}
                    <b>{p[r.id] || 0}</b>
                  </button>
                ))}
                <button type="button" className="mg-rx talk" onClick={() => openThread(p.id)}>
                  💬 {t('comments')}<b>{p.comments}</b>
                </button>
              </div>

              {thread && (
                <div className="mg-thread">
                  {thread.map((c) => (
                    <div key={c.id} className="mg-cm">
                      <b>{c.authorName}</b>
                      <p>{c.body}</p>
                      {String(c.employeeId) === String(d.me) && (
                        <button
                          type="button" className="mg-cm-x"
                          onClick={async () => {
                            await api(`/dish/comment?id=${c.id}`, 'DELETE');
                            const j = await api(`/dish/comments?id=${p.id}`);
                            setThreads((q) => ({ ...q, [p.id]: j.comments || [] }));
                            load();
                          }}
                        >{t('del')}</button>
                      )}
                    </div>
                  ))}
                  {!d.admin && (
                    <div className="mg-cm-new">
                      <input
                        value={draft[p.id] || ''} maxLength={COMMENT_MAX} placeholder={t('commentPh')}
                        onChange={(e) => setDraft((q) => ({ ...q, [p.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && sendComment(p.id)}
                      />
                      <button className="btn sm primary" onClick={() => sendComment(p.id)}>{t('send')}</button>
                    </div>
                  )}
                </div>
              )}
            </article>
          </div>
        );
      })()}

      {/* and one photograph, at its full size, over the top of that */}
      {full && (
        <button type="button" className="mg-lightbox" onClick={() => setFull(null)}>
          <img src={pic(full, false)} alt="" />
        </button>
      )}
    </div>
  );
}
