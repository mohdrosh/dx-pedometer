/* ============================================================================
   モラエッグ 最終確定メール — 仕様書 4.11, 配布ルール 10.5.

   Three letters, sent at the moment the Tamba staff press 最終確定:

     requester  did you get eggs, how many, where, when it arrives, when
                to collect by — and, if not, that next week prefers you
     contact    how many packs are coming to your office and when
     admin      the confirmed week, as a table

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
  name = '', got = 0, office = '', arrive = '', pickup = '', missed = false,
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
      `受け取り場所：${office}`,
      `パック数：${packs(got)}`,
      `到着予定：${jpDate(arrive)}`,
      `受け取り期限：${jpDate(pickup)}`,
      '',
      '期限までに受け取りをお願いします。',
    ].join('\n'),
  };
}

/**
 * To an office's contact. (mailOfficeSubject / mailOfficeBody)
 *
 * 「その事業所に届くパック数と到着日」 and nothing else — they are not
 * responsible for who gets what, only for the box arriving safely.
 */
export function contactMail({ office = '', packs: n = 0, arrive = '', people = 0 } = {}) {
  return {
    subject: `${SUBJECT}：${office}に${packs(n)}届きます`,
    body: [
      'お疲れさまです。',
      '',
      `今週のモラエッグを ${office} にお届けします。`,
      '',
      `パック数：${packs(n)}`,
      `到着予定：${jpDate(arrive)}`,
      people ? `受け取る方：${people}名` : '',
      '',
      '到着しましたら、モラエッグの「事務所」画面で到着の確認をお願いします。',
      '受け取りは今週の金曜日までです。',
    ].filter((l) => l !== '').join('\n'),
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
  'mailOfficeSubject', 'mailOfficeBody',
  'mailAdminSubject', 'mailAdminBody',
];
