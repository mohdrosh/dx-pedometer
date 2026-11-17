/* ============================================================================
   マイページトップ

   佐野「マイページ構成・メニュー設計」2026/11/15.

   全社員共通の入口。万歩計・モラエッグ・勤怠などへ、ここから進む。

   この画面は何も決めない。どのメニューを誰に出すかはメニュー一覧表が持って
   いて、サーバがその人のぶんだけを渡してくる（src/mypage.js）。ここにあるのは
   「渡された箱を並べる」ことだけで、機能が増えても表に1行足せば勝手に出る
   ——仕様書 5 が求めているのはそれである。
   ========================================================================= */

import React, { useEffect, useState } from 'react';

/* 印。佐野のデモはカテゴリとメニューのそれぞれに細い線のアイコンを置いて
   いるので、同じ場所に同じものを置く。

   絵文字ではなく線画なのは、絵文字が端末の持っている色付きの絵に化けるから
   ——🧰 は赤い道具箱として出てきて、この画面の青とベージュの中で一人だけ
   よそから来た顔をする。24 の枠に currentColor で描けば、文字と同じ色で、
   文字と同じ大きさに従う。 */
const P = {
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c0-3.3 3.6-5 8-5s8 1.7 8 5',
  clipboard: 'M9 4h6v3H9zM7 5H5v15h14V5h-2M9 11h6M9 15h4',
  yen: 'M8 5l4 6 4-6M12 11v8M8 13h8M8 16h8',
  heart: 'M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z',
  tools: 'M4 8h16v12H4zM9 8V5h6v3',
  bell: 'M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 19a2 2 0 0 0 4 0',
  file: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h6M10 16h4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  doc: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3',
  receipt: 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21zM9 8h6M9 12h6',
  send: 'M21 3 3 10l7 3 3 7 8-17Z',
  chart: 'M5 20V9M12 20V4M19 20v-7',
  list: 'M5 7h14M5 12h14M5 17h9',
  card: 'M3 6h18v12H3zM3 10h18M7 14h4',
  steps: 'M4 18l5-5 4 3 7-8M15 8h5v5',
  egg: 'M12 21c-3.3 0-6-2.5-6-6S9 3 12 3s6 6.5 6 12-2.7 6-6 6Z',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
};

const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round"
  ><path d={P[name] || P.doc} /></svg>
);

/* カテゴリの印。 */
const ICON = {
  person: 'person', clipboard: 'clipboard', yen: 'yen',
  heart: 'heart', tools: 'tools', bell: 'bell',
};

/* メニューごとの印。表の列ではなく画面の都合なので、仕様書 5 のメニュー一覧表
   には持たせず、ここで id から引く。知らない id はカテゴリの印に落ちる。 */
const MENU_ICON = {
  personal: 'person', skill: 'file',
  attendance: 'clock', notices: 'doc', expenses: 'receipt', homeleave: 'send',
  monthly: 'chart', daily: 'list',
  payslip: 'card',
  pedometer: 'steps', egg: 'egg',
  schedule: 'calendar',
  news: 'bell',
};

const STR = {
  hello: ['こんにちは！ メニューを選んでください。', 'Hello — choose a menu.'],
  soon: ['準備中', 'In preparation'],
  external: ['外部サイト ↗', 'External site ↗'],
  seeAll: ['すべて見る（{n}件）', 'See all ({n})'],
  back: ['マイページトップに戻る', 'Back to My Page top'],
  logout: ['ログアウト', 'Sign out'],
  title: ['マイページ', 'My Page'],
  news: ['お知らせ', 'News'],
  none: ['使えるメニューがまだありません。', 'No menus are available to you yet.'],
  loading: ['読み込み中…', 'Loading…'],
};

/**
 * One menu. A box, a link, or a dead box.
 *
 * 仕様書 6:「『準備中』は表示するがクリック不可。公開時期は表示しない」——so a
 * 準備中 row is a <div>, not a disabled <a>: there is nothing to tab to and
 * nothing to press, which is what "not clickable" has to mean for somebody
 * using a keyboard or a screen reader.
 */
function Menu({ m, lang, base }) {
  const t = (k) => STR[k][lang === 'ja' ? 0 : 1] || STR[k][0];
  const name = lang === 'ja' ? m.nameJa : (m.nameEn || m.nameJa);
  const note = lang === 'ja' ? m.noteJa : (m.noteEn || m.noteJa);
  const soon = m.status === 'soon';
  const external = m.linkType === 'external';

  const inner = (
    <>
      <span className="mp-ic"><Icon name={MENU_ICON[m.id] || ICON[m.icon] || 'doc'} /></span>
      <span className="mp-m-t">
        <b>{name}</b>
        {note && <small>{note}</small>}
      </span>
      {soon && <em className="mp-soon">{t('soon')}</em>}
      {external && !soon && <em className="mp-ext">{t('external')}</em>}
    </>
  );

  if (soon) return <div className="mp-m soon">{inner}</div>;

  /* 社内ページは同じタブ、外部サイトは別タブ。戻るボタンで戻れるものと、
     戻ってこられないものを同じ扱いにしない。

     モラエッグには「?from=mypage」を付ける。別のページなので、付けないと
     向こうはここから来たことを知らず、「マイページに戻る」を隠したまま
     ——リンクで送り出しておいて帰り道がない、ということになる。万歩計には
     付けない：仕様書 3「万歩計のサイト自体は、既存の URL・画面・ログイン・
     マニュアルを変更しない」. */
  const to = m.id === 'egg' ? `${m.link}?from=mypage` : m.link;
  const href = m.linkType === 'internal' && m.link.startsWith('/')
    ? `${base.replace(/\/$/, '')}${to}`.replace(/^\/\//, '/')
    : m.link;
  return (
    <a
      className="mp-m" href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
    >{inner}</a>
  );
}

/** One category box. */
function Box({ c, lang, base, onAll }) {
  const t = (k) => STR[k][lang === 'ja' ? 0 : 1] || STR[k][0];
  return (
    <section className="mp-box">
      <h2>
        <span className="mp-bi"><Icon name={ICON[c.icon] || 'doc'} /></span>
        {lang === 'ja' ? c.ja : c.en}
      </h2>
      <div className="mp-ms">
        {c.menus.map((m) => <Menu key={m.id} m={{ ...m, icon: c.icon }} lang={lang} base={base} />)}
      </div>
      {/* 仕様書 6:「カテゴリ内のメニューが5件以上になったら、トップには4件だけ
          表示し、『すべて見る（N件）』からカテゴリのページへ進む」. */}
      {c.more && (
        <button type="button" className="mp-all" onClick={() => onAll(c.id)}>
          {t('seeAll').replace('{n}', String(c.total))} →
        </button>
      )}
    </section>
  );
}

/**
 * The top page.
 *
 * `onSignOut` and the language switch are the host's, so this stays one
 * screen rather than a second application with its own header.
 */
export default function MyPage({ lang, setLang, onSignOut, apiRoot, base = '/' }) {
  const t = (k) => STR[k][lang === 'ja' ? 0 : 1] || STR[k][0];
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [openCat, setOpenCat] = useState(null);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const r = await fetch(`${apiRoot}/mypage${openCat ? '?all=1' : ''}`,
          { credentials: 'same-origin' });
        if (!r.ok) { if (!gone) setErr(true); return; }
        const j = await r.json();
        if (!gone) { setD(j); setErr(false); }
      } catch { if (!gone) setErr(true); }
    })();
    return () => { gone = true; };
  }, [apiRoot, openCat]);

  if (err) return <div className="mp"><p className="mp-lead">{t('none')}</p></div>;
  if (!d) return <div className="mp"><p className="mp-lead">{t('loading')}</p></div>;

  const boxes = openCat ? d.boxes.filter((c) => c.id === openCat) : d.boxes;

  return (
    <div className="mp">
      <header className="mp-hdr">
        <div className="mp-who">
          <img className="mp-logo" src={`${base}morabu-mark.png`} alt="" />
          <div>
            <b>{t('title')}</b>
            <span>{[d.user.name, d.user.where].filter(Boolean).join('／')}</span>
          </div>
        </div>
        <div className="mp-hdr-r">
          <button type="button" className="mp-mini" onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>
            {lang === 'ja' ? 'EN' : '日本語'}
          </button>
          <button type="button" className="mp-mini" onClick={onSignOut}>{t('logout')}</button>
        </div>
      </header>

      <main className="mp-main">
        {openCat ? (
          <button type="button" className="mp-back" onClick={() => setOpenCat(null)}>
            ← {t('back')}
          </button>
        ) : <p className="mp-lead">{t('hello')}</p>}

        {/* 仕様書 3:「一番上に『お知らせ（モラブ情報）』欄を置く。お知らせが
            ないときは欄ごと非表示」——so there is no empty bar on a quiet day. */}
        {!openCat && d.notice && (
          <div className="mp-news">
            <em>{t('news')}</em>
            <p>{d.notice}</p>
          </div>
        )}

        {boxes.length ? (
          <div className="mp-grid">
            {boxes.map((c) => (
              <Box key={c.id} c={c} lang={lang} base={base} onAll={setOpenCat} />
            ))}
          </div>
        ) : <p className="mp-lead">{t('none')}</p>}
      </main>

      <footer className="mp-foot">モラブ阪神工業株式会社</footer>
    </div>
  );
}

/* 画面の形。仕様書 6:「PC・携帯の両方に対応する。PC はカテゴリを2列、携帯は
   1列に並べる」——その1行が下の grid-template-columns で、ほかは佐野のデモの
   見た目に合わせた余白と色。 */
export const MYPAGE_CSS = `
.mp{min-height:100%;background:#F4F6FA;color:#13316B;
  font-family:Inter,"Noto Sans JP",system-ui,sans-serif;display:flex;flex-direction:column}
.mp-hdr{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:12px 18px;background:#fff;border-bottom:1px solid #E2E7F0}
.mp-who{display:flex;align-items:center;gap:11px;min-width:0}
.mp-logo{width:34px;height:auto;flex:none}
.mp-who b{display:block;font-size:16px;line-height:1.25}
.mp-who span{display:block;font-size:11.5px;color:#6B7A94;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-hdr-r{display:flex;gap:8px;flex:none}
.mp-mini{border:1px solid #CBD4E4;background:#fff;color:#13316B;border-radius:8px;
  padding:5px 11px;font-size:12.5px;font-weight:600;cursor:pointer}
.mp-mini:hover{background:#F2F6FD}
.mp-main{flex:1;width:100%;max-width:1040px;margin:0 auto;padding:20px 16px 36px}
.mp-lead{margin:0 0 16px;font-size:15.5px;font-weight:600}
.mp-back{border:0;background:none;color:#1A56B8;font-size:13.5px;font-weight:600;
  cursor:pointer;padding:0;margin:0 0 14px}

.mp-news{display:flex;align-items:flex-start;gap:11px;margin:0 0 18px;padding:11px 13px;
  background:#FFF6DC;border:1px solid #F0C33C;border-radius:10px}
.mp-news em{flex:none;font-style:normal;font-size:11.5px;font-weight:700;
  background:#F0C33C;color:#13316B;border-radius:999px;padding:3px 10px}
.mp-news p{margin:0;font-size:13.5px;line-height:1.65;font-weight:600}

.mp-grid{display:grid;grid-template-columns:1fr;gap:16px;align-items:start}
@media (min-width:860px){ .mp-grid{grid-template-columns:1fr 1fr} }

.mp-box{background:#fff;border:1px solid #E2E7F0;border-radius:12px;padding:14px}
.mp-box h2{display:flex;align-items:center;gap:7px;margin:0 0 10px;
  font-size:13.5px;font-weight:700;color:#4A5A77}
.mp-bi{display:inline-flex;width:16px;height:16px;color:#8595AF}
.mp-bi svg{width:100%;height:100%}
.mp-ms{display:flex;flex-direction:column;gap:8px}

.mp-m{display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:10px;
  border:1px solid #E2E7F0;background:#F8FAFE;text-decoration:none;color:inherit}
a.mp-m:hover{background:#EDF3FF;border-color:#B9CBEA}
.mp-m.soon{border-style:dashed;background:#FBFCFE;color:#8A97AC;cursor:default}
.mp-ic{flex:none;width:32px;height:32px;border-radius:50%;background:#E7EEFC;
  display:grid;place-items:center;color:#1A56B8}
.mp-ic svg{width:17px;height:17px}
.mp-m.soon .mp-ic{color:#9AA6BA}
.mp-m.soon .mp-ic{background:#F0F2F7}
.mp-m-t{flex:1;min-width:0}
.mp-m-t b{display:block;font-size:14.5px;line-height:1.3}
.mp-m-t small{display:block;font-size:11.5px;color:#7A879D;margin-top:1px}
.mp-soon,.mp-ext{flex:none;font-style:normal;font-size:11px;font-weight:700;
  border-radius:999px;padding:3px 9px}
.mp-soon{background:#FFE9B8;color:#8A6400}
.mp-ext{background:#E7EEFC;color:#1A56B8}
.mp-all{margin-top:10px;border:0;background:none;color:#1A56B8;font-size:12.5px;
  font-weight:600;cursor:pointer;padding:0}

.mp-foot{text-align:center;font-size:11px;color:#9AA6BA;padding:14px 0 20px}
`;
