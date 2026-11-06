/* ============================================================================
   モラエッグ 最終確定メール — 仕様書 4.11, 配布ルール 10.5.

   Three letters, sent at the moment the Tamba staff press 最終確定:

     requester  did you get eggs, how many, where (with the address),
                when it arrives, when to collect by — and, if not, that
                next week prefers you
     admin      the confirmed week, as a table

   There was a third, to each office's 連絡担当者. 佐野, 2026/11/06:
   「各事業所に卵を受け取る担当者は決まっていないため、事業所宛てに卵を
   届けるかたちにします。事業所の連絡担当者（名前・メールアドレス）は
   設定画面から削除してください。連絡担当者へのメールも不要です」— so
   there is nobody for it to be to, and it is gone rather than left
   addressed to a role that no longer exists.

   ---------------------------------------------------------------------
   佐野へ：このファイルの日本語は、まだ辞書にない文面です。仕様書 6 のとおり
   ご確認をお願いします。文言辞書に追加するキー名も下に書いています。
   The Japanese below is not in moraegg_strings.json yet — these are the
   first drafts of text the dictionary has no keys for. 仕様書 6 says new
   Japanese is hers to approve, so it lives in one file she can read
   top to bottom, with the key names it would take, rather than scattered
   through the sending code.
   ---------------------------------------------------------------------

   Pure functions of their arguments, with no database and no mailer, so
   the wording can be tested and shown to her without sending anything to
   171 people.
   ========================================================================= */

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];

/** 11月24日（火）— the form every other screen prints. */
export function jpDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  const dow = DOW_JA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}月${d}日（${dow}）`;
}

const packs = (n) => `${Math.max(0, Number(n) || 0)}パック`;

/* 「モラエッグ」 in every subject line, because these land in an inbox
   beside payroll and safety notices and have to be recognisable in one
   glance at a phone's lock screen. */
const SUBJECT = 'モラエッグ';

/**
 * To somebody who asked for eggs. (mailGotSubject / mailGotBody)
 *
 * Everything they need to collect, in the order they need it: whether
 * there are eggs at all, then how many and where, then the two dates.
 */
export function requesterMail({
  name = '', got = 0, office = '', address = '', arrive = '', pickup = '',
  missed = false,
} = {}) {
  const who = name ? `${name} さん` : 'お疲れさまです';
  if (missed || !got) {
    /* 「受け取れなかった人には次回優先する旨」. Said plainly and without
       apology dressed as news: the useful part is the second line. */
    return {
      subject: `${SUBJECT}：今回はお届けできませんでした`,
      body: [
        `${who}`,
        '',
        '今週のモラエッグのリクエストは、今回はお届けできませんでした。',
        '次回のリクエストでは優先してお届けします。',
        '',
        'ご協力ありがとうございました。',
      ].join('\n'),
    };
  }
  return {
    subject: `${SUBJECT}：${packs(got)}お届けします`,
    body: [
      `${who}`,
      '',
      '今週のモラエッグが確定しました。',
      '',
      /* 佐野, 2026/11/06:「リクエストした方への結果メールにも、受け取る
         事業所の住所を入れてください」. Under the office name and
         indented, not on the same line: somebody reading this on a
         phone to find a building wants the address as its own thing to
         look at, and an office whose address nobody has filled in still
         prints a clean line rather than a dangling colon. */
      `受け取り場所：${office}`,
      ...(address ? [`　　　　　　　${address}`] : []),
      `パック数：${packs(got)}`,
      `到着予定：${jpDate(arrive)}`,
      `受け取り期限：${jpDate(pickup)}`,
      '',
      '期限までに受け取りをお願いします。',
    ].join('\n'),
  };
}

/**
 * To the administrators. (mailAdminSubject / mailAdminBody)
 *
 * The whole week on one screen, because this is the copy that gets
 * forwarded when somebody asks what happened.
 */
export function adminMail({
  ship = '', harvest = 0, shipped = 0, extra = 0, lines = [], missed = 0,
} = {}) {
  const table = lines
    .filter((l) => l.packs > 0 || l.asked > 0)
    .map((l) => {
      const note = l.extra > 0 ? `（リクエスト${l.requested}＋余り${l.extra}）`
        : l.status === 'skip' ? '（見送り）'
          : l.status === 'work' ? '（仕事用のため発送）' : '';
      return `  ${l.office}：${packs(l.packs)}${note}`;
    });
  return {
    subject: `${SUBJECT}：${jpDate(ship)}発送分を確定しました`,
    body: [
      'モラエッグの今週分を最終確定しました。',
      '',
      `発送日：${jpDate(ship)}`,
      `取れ高：${packs(harvest)}`,
      `発送合計：${packs(shipped)}（うち本社への余り ${packs(extra)}）`,
      '',
      '事業所ごとの発送数',
      ...table,
      '',
      `今回お届けできなかった方：${missed}名（次回優先）`,
    ].join('\n'),
  };
}

/* The keys these would take in moraegg_strings.json, for 佐野 to fill in
   if she would rather own the wording there than here. Listed as data so
   a later version can read them from the dictionary without any of the
   functions above changing shape. */
export const MAIL_KEYS = [
  'mailGotSubject', 'mailGotBody',
  'mailMissSubject', 'mailMissBody',
  'mailAdminSubject', 'mailAdminBody',
];
