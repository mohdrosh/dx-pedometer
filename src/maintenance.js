/* ============================================================================
   メンテナンスのお知らせ.

   佐野, 11/2:「11月4日(水) 11:00〜14:00頃にサーバメンテナンスを行い、その間
   万歩計アプリが使えなくなります。ログイン画面やトップ画面にお知らせを出して
   ください」「作業が延びそうな場合は、表示している終了時刻をすぐ直してください」.

   That last sentence is the whole design. A date typed into the markup is a
   deploy away from being wrong, and the one moment it will need changing is
   the one moment nobody can afford to wait for a build — the work is
   running over and people are staring at a time that has already passed.
   So the window lives in 設定, and this file only reads it.

   Three states, because they are three different messages:

     notice   before it starts — "this is coming, here is when"
     during   between the two times — "it is happening now, back by X"
     none     outside both, or switched off

   `during` is best-effort by nature. While the server is stopped the app
   cannot say anything at all; what covers that is public/maintenance.html,
   which nginx serves on a 502 without asking Node anything. This state is
   for the minutes either side — the app still up, the database going away
   under it — and for a maintenance that never takes the app fully down.
   ========================================================================= */

/** Parse 'YYYY-MM-DDTHH:MM' (what <input type="datetime-local"> gives). */
function at(v) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  return s.slice(0, 16);
}

/**
 * What to show, given the settings and the clock.
 *
 * `now` is 'YYYY-MM-DDTHH:MM' in Tokyo. Strings rather than Date objects,
 * for the reason the egg weeks use them: the browser reads the laptop's
 * clock and the server reads Tokyo's, and a maintenance notice that
 * appears an hour early on one machine and an hour late on another is
 * worse than none. Strings in this format compare correctly.
 */
export function maintenanceState(cfg, now) {
  const m = cfg?.maintenance;
  if (!m || m.on !== true) return { state: 'none' };
  const from = at(m.from);
  const to = at(m.to);
  const n = at(now);
  if (!from || !to || !n) return { state: 'none' };
  /* A window that ends before it starts is a typo, and acting on it would
     put the app into maintenance forever. */
  if (to <= from) return { state: 'none' };
  if (n >= to) return { state: 'none' };
  return { state: n >= from ? 'during' : 'notice', from, to, note: m.note || '' };
}

/* 11月4日（水）11:00 〜 14:00 — the form people recognise. Both times are
   written out even when they fall on one day, because 「〜14:00」 alone has
   been read as "until 2am". */
const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function windowText(from, to, lang = 'ja') {
  const f = at(from); const t = at(to);
  if (!f || !t) return '';
  const [fd, ft] = f.split('T');
  const [td, tt] = t.split('T');
  const [, fm, fdd] = fd.split('-').map(Number);
  const dow = DOW_JA[new Date(`${fd}T00:00:00Z`).getUTCDay()];
  if (lang === 'ja') {
    const head = `${fm}月${fdd}日（${dow}）`;
    return fd === td ? `${head} ${ft} 〜 ${tt}` : `${head} ${ft} 〜 ${td.slice(5).replace('-', '/')} ${tt}`;
  }
  const en = new Date(`${fd}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' });
  return fd === td ? `${en}, ${ft}–${tt} JST` : `${en} ${ft} – ${td.slice(5).replace('-', '/')} ${tt} JST`;
}
