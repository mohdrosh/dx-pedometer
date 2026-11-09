/* ============================================================================
   佐野's text dictionary, as a lookup.

   仕様書 6:「画面の文言は、文言辞書（moraegg_strings.json）の日本語をそのまま
   使う。日本語が正で、英語は日本語からの訳である」「日本語の文言を変える必要
   があるときは、変える前に佐野に相談する」.

   So the JSON is checked in unedited and read from here. Nothing in the
   components writes Japanese of its own — a string that is not in the
   dictionary is a string she has not seen, and the only honest thing to
   show for one is the key, which is visible enough in review to get
   noticed and added rather than quietly shipped.
   ========================================================================= */

/* ---------------------------------------------------------------------------
   Added to the JSON after she sent it — 2026/11/05, for the name check on
   the sign-up. Listed here because the rule above is that the file is her
   file, so anything of mine in it should be impossible to miss on review.

   Hers, word for word, from the request:

     whoLead   お名前に間違いがなければOKボタンを押してください
     whoNg     名前が違う場合は、社員番号を確認し、再度正しい社員番号を
               入力してください
     whoOk     OK                     ——「OKボタン」, so she named it

   Mine, and the four that need her nod. Two are words lifted straight out
   of her own two sentences; two I had to write:

     whoNo     社員番号               —— her word, as a field label
     whoName   お名前                 —— her word, as a field label
     whoRedo   社員番号を入力し直す      —— the button under 「名前が違う場合
                                        は…」, from her 再度…入力してください
     whoDone   お名前を確認しました      —— what the card says once OK is pressed
     whoErr    はじめにお名前をご確認ください。 —— why the tick-box is greyed

   English throughout is mine: 「日本語が正で、英語は日本語からの訳である」.
   --------------------------------------------------------------------- */
import STRINGS from './moraegg-strings.json';

const PENDING_1105 = ['whoNo', 'whoName', 'whoRedo', 'whoDone', 'whoErr'];

/* 2026/11/06, for the sheet that goes in each box. Mine, and needing her
   nod like the five above:

     boxSheet  箱に入れる紙（事業所ごと）  —— the button the 丹波 staff press

   Her own words for the thing are 「事業所ごとのまとめ」 and 「箱ごとに入れ
   やすいように」; this is a button label, which has to be shorter than
   either, so it says what the paper is for rather than what is on it. */
const PENDING_1106 = ['boxSheet', 'tabPre', 'tHint'];

/* 2026/11/08, for the harvest card. Mine, and needing her nod:

     remainPct  残り{n}%  —— how much of this week's harvest is still
                           unclaimed, as a share rather than a count.
                           The pack count is already in her own 「あと{n}
                           パック余裕があります」 underneath; this is the
                           same fact at a glance, which is what a number
                           at the top of a page is for. */
const PENDING_1108 = ['remainPct'];

/* 2026/11/09: 発送の確定 became one press instead of two. The second
   button existed so the 丹波 staff could look at the allocation before
   the letters went out, but there is nothing for them to decide there —
   the only number they control is the pack count in the box above it. So
   the look moved into a question asked at the moment of pressing, and
   these are its words. Mine, and needing her nod:

     goFinal   確定して知らせる        —— the one button, replacing
                                        もう一度確定 and 最終確定する
     askBody   {s}パックを{p}名に発送します。
     askMiss   {n}名は落選になります。   —— 落選 is her word, from the
                                        status list in 仕様書 5.2
     askMail   全員にメールを送ります。よろしいですか？
     askYes    送信する
     askNo     やめる

   Her 最終確定する (doFinal) and 振り分け結果を確認して… (shipStep2) are
   left in the file unused rather than deleted: the file is hers, and if
   she wants the two steps back they are the words to put back. */
const PENDING_1109 = ['goFinal', 'askBody', 'askMiss', 'askMail', 'askYes', 'askNo'];

/* 2026/11/09, later: her 最終確定しました。メールを送信しました。(finalDone)
   was shown whatever happened to the letters. A server with no SMTP_HOST
   writes them to its log and sends nothing — which is right for a test
   server and wrong to describe as 送信しました to the person pressing the
   button. The message now says which of the three it was. Mine:

     finalShort  最終確定しました。      —— her sentence, without the claim
                                         about the mail
     finalDry    最終確定しました。（この環境ではメールは送信しません）
     finalNg     最終確定しました。メールの送信に失敗しました。 */
const PENDING_1109B = ['finalShort', 'finalDry', 'finalNg'];

/* 2026/11/08: tHint is HERS, and it is the one string on the 丹波 screen
   that had to change rather than one I wanted to add. It read 「10個詰める
   ごとに「＋1パック」を押してください」 — an instruction to press a button
   that is no longer on the screen, now that the day's count is typed in
   and saved. A caption naming a control nobody can see is worse than a
   reworded one, so it is reworded and listed here. Her phrasing for the
   pack is kept word for word; only the instruction changed. */

/* 2026/11/06, later: the tab now says which state the week is in rather
   than 配布状況, which she said reads oddly.

   Hers, from the message: リクエスト受付中 (tabOpen) and 確定
   (confirmed, already in the file). 確認中 (checking) is hers too and
   already there. Mine, and needing her nod:

     tabPre    受付前  —— before the window opens at all, which is where
                         the site sits until the 21st and is neither of
                         the two states she named.

   トップページへ replaced 配布状況を見る on her instruction, so toHome's
   Japanese is hers and is not listed here. */

/**
 * One string, in the current language.
 *
 * `vars` fills the {n} / {a} / {b} parts: 「{n} などの部分には数字や名前が
 * 入る」. Missing keys come back as the key itself rather than as an empty
 * space, because an empty space on a screen is a bug nobody reports.
 */
/** The keys above that she has not signed off yet, for anyone checking. */
export const pendingKeys = () => [
  ...PENDING_1105, ...PENDING_1106, ...PENDING_1108,
  ...PENDING_1109, ...PENDING_1109B,
];

export function mg(key, lang = 'ja', vars = null) {
  const row = STRINGS[key];
  if (!row) return key;
  let out = typeof row === 'object' ? (row[lang] ?? row.ja ?? key) : row;
  if (typeof out !== 'string') return out;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/** The eight offices, as 佐野 writes them, in her order. */
export function officeList(lang = 'ja') {
  const row = STRINGS.offices;
  const ja = row?.ja || {};
  const other = row?.[lang] || ja;
  return Object.keys(ja).map((id) => ({ id, name: ja[id], label: other[id] || ja[id] }));
}

/* 「英語の単数・複数（1 pack／2 packs）はプログラムで切り替える」 — the
   dictionary cannot carry both, so the one place it matters does it here. */
export function packs(n, lang = 'ja') {
  const v = Number(n) || 0;
  return lang === 'ja' ? `${v}パック` : `${v} pack${v === 1 ? '' : 's'}`;
}

export { STRINGS };
