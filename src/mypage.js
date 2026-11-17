/* ============================================================================
   マイページ — カテゴリとメニュー一覧

   佐野「マイページ構成・メニュー設計」2026/11/15.

   全社員共通の「マイページトップ」を入口にして、そこから万歩計・モラエッグ・
   勤怠などへ進む。人によって使えるメニューだけを出す。

   ---------------------------------------------------------------------------
   なぜ表があるのか

   仕様書 5:「トップ画面は『メニュー一覧表』（DB のテーブル）を読み込んで自動
   で並べるだけにする。新しい機能は表に1行足すだけで、該当する人のトップに出る
   ようにしたい」.

   だからここにあるのは画面ではなく、行の集まりである。どの画面にも「万歩計は
   外勤だけ」とは書かない——表の targets にそう書いてあるだけで、変えるときは
   設定を変える。

   ---------------------------------------------------------------------------
   区分（3つ）

     field   外勤（一般）        万歩計のリストにいる人（iit を除く）
     iit     外勤（IIT 請負・待機） 万歩計のリストにいて、IIT の名簿にもいる人
     office  内勤                モラエッグにいて、万歩計のリストにいない人

   仕様書 2 はこの3つを「既存のリストの差分」で定義している。社員リストの
   「区分」欄（外勤（正社員）／内勤（正社員）／役員）がそのまま field と
   office を分けるので、名簿を取り込むときにその欄を staff_kind として持つ。
   iit は 13名の名簿がまだ届いていないので、届くまで誰にも立たない——そのとき
   この3人目の区分は field と同じものを見る。フラグひとつで、画面は変わらない。

   ---------------------------------------------------------------------------
   状態（3つ）と対象者

   仕様書 6 の表は、メニューごとに区分別の状態（○／準備中／将来／−）を持って
   いる。ここでは状態をメニューに1つだけ持たせ、「誰に出すか」は targets で
   表す。たとえば個人情報設定は (1)将来 (2)準備中 (3)準備中 なので、
   status=soon, targets=[iit, office] と書く——対象でない区分には出ないので、
   (1) にとっての「将来」はそれで言えている。

     live    ○     出す・押せる
     soon    準備中  出すが押せない。公開時期は書かない（仕様書 6）
     hidden  将来   いまは出さない。行は残す——公開は status を変えるだけ

   「−」（対象外）は targets から外すことで表す。
   ========================================================================= */

/** 区分。社員1人はこのうちのどれか1つ。 */
export const GROUPS = ['field', 'iit', 'office'];

/** カテゴリは6つで固定（仕様書 10:「カテゴリの追加はめったにない例外」）。 */
export const CATEGORIES = [
  { id: 'me', ja: 'わたしの情報', en: 'My Info', icon: 'person' },
  { id: 'work', ja: '勤務・申請', en: 'Work & Requests', icon: 'clipboard' },
  { id: 'pay', ja: '給与・手続き', en: 'Pay & Procedures', icon: 'yen' },
  { id: 'health', ja: '健康・福利厚生', en: 'Health & Benefits', icon: 'heart' },
  { id: 'tools', ja: '仕事のツール', en: 'Work Tools', icon: 'tools' },
  { id: 'news', ja: 'お知らせ', en: 'Announcements', icon: 'bell' },
];

/* 外部サイトの URL は仕様書 4 に書かれているもの。ロゴは使わず、文字と
   「外部サイト ↗」の印で出す（仕様書 10）。 */
const RAKURAKU = 'https://rsstaining.rakurakuseisan.jp/VQ8aG5S2qUa/';
const PCA_HUB = 'https://naikinkyuyo.pcahub.jp/p/';

/**
 * メニュー一覧表の初期値。
 *
 * 並び順は仕様書 4 の表の順。order はカテゴリの中での順番で、カテゴリをまたい
 * だ比較はしない。
 */
export const MENU_SEED = [
  /* わたしの情報 */
  {
    id: 'personal',
    nameJa: '個人情報設定',
    nameEn: 'Personal Info',
    noteJa: '所属・勤務時間・通勤経路',
    noteEn: 'Affiliation, hours, commute',
    category: 'me',
    targets: ['iit', 'office'],
    status: 'soon',
    auth: 'password',
    linkType: 'internal',
    link: '/mypage/personal',
    order: 1,
  },
  {
    id: 'skill',
    nameJa: 'スキルシート',
    nameEn: 'Skill Sheet',
    noteJa: '経歴・スキルの登録',
    noteEn: 'Experience and skills',
    category: 'me',
    targets: ['field', 'iit'],
    status: 'hidden',
    auth: 'password',
    linkType: 'internal',
    link: '/mypage/skill',
    order: 2,
  },

  /* 勤務・申請 */
  {
    id: 'attendance',
    nameJa: '勤怠',
    nameEn: 'Attendance',
    noteJa: '出退勤の入力',
    noteEn: 'Clock in and out',
    category: 'work',
    targets: ['iit', 'office'],
    status: 'soon',
    auth: 'password',
    linkType: 'internal',
    link: '/mypage/attendance',
    order: 1,
  },
  {
    id: 'notices',
    nameJa: '各種届',
    nameEn: 'Notices',
    noteJa: '遅刻・早退・休暇など',
    noteEn: 'Late, early leave, holidays',
    category: 'work',
    targets: ['field', 'iit', 'office'],
    status: 'hidden',
    auth: 'password',
    linkType: 'internal',
    link: '/mypage/notices',
    order: 2,
  },
  {
    id: 'expenses',
    nameJa: '旅費・経費精算',
    nameEn: 'Travel & Expenses',
    noteJa: '楽楽精算で申請',
    noteEn: 'File in Rakuraku Seisan',
    category: 'work',
    targets: ['office'],
    status: 'live',
    auth: 'id',
    linkType: 'external',
    link: RAKURAKU,
    order: 3,
  },
  {
    id: 'homeleave',
    nameJa: '帰国申請',
    nameEn: 'Home Leave',
    noteJa: '一時帰国の申請',
    noteEn: 'Apply for home leave',
    category: 'work',
    targets: ['field', 'iit', 'office'],
    status: 'hidden',
    auth: 'password',
    linkType: 'internal',
    link: '/mypage/home-leave',
    order: 4,
    /* 仕様書 4 ※:「帰国申請は区分ではなく、外国籍社員のフラグで表示する
       （基本的に外人のみ）」——区分とは別の軸なので、targets ではなく
       これで絞る。 */
    foreignOnly: true,
  },
  {
    id: 'monthly',
    nameJa: '月報',
    nameEn: 'Monthly Report',
    noteJa: '毎月の業務報告',
    noteEn: 'Monthly work report',
    category: 'work',
    targets: ['field', 'iit'],
    status: 'hidden',
    auth: 'password',
    linkType: 'internal',
    link: '/mypage/monthly',
    order: 5,
  },
  {
    id: 'daily',
    nameJa: '日報',
    nameEn: 'Daily Report',
    noteJa: '毎日の業務報告',
    noteEn: 'Daily work report',
    category: 'work',
    targets: ['office'],
    status: 'hidden',
    auth: 'password',
    linkType: 'internal',
    link: '/mypage/daily',
    order: 6,
  },

  /* 給与・手続き */
  {
    id: 'payslip',
    nameJa: '給与明細',
    nameEn: 'Payslip',
    noteJa: 'PCA給与hubで給与を見る',
    noteEn: 'View your payslip in PCA Hub',
    category: 'pay',
    targets: ['field', 'iit', 'office'],
    status: 'hidden',
    auth: 'id',
    linkType: 'external',
    link: PCA_HUB,
    order: 1,
  },

  /* 健康・福利厚生 */
  {
    id: 'pedometer',
    nameJa: '万歩計',
    nameEn: 'Pedometer',
    noteJa: '毎日の歩数を入力・提出',
    noteEn: 'Enter and submit your steps',
    category: 'health',
    targets: ['field', 'iit'],
    status: 'live',
    auth: 'id',
    linkType: 'internal',
    link: '/pedometer/',
    order: 1,
  },
  {
    id: 'egg',
    nameJa: 'モラエッグ',
    nameEn: 'Mora Egg',
    noteJa: '卵のリクエスト',
    noteEn: 'Request your eggs',
    category: 'health',
    targets: ['field', 'iit', 'office'],
    status: 'live',
    auth: 'id',
    linkType: 'internal',
    link: '/egg',
    order: 2,
  },

  /* 仕事のツール */
  {
    id: 'schedule',
    nameJa: 'スケジュール',
    nameEn: 'Schedule',
    noteJa: '予定の確認・共有',
    noteEn: 'View and share schedules',
    category: 'tools',
    targets: ['office'],
    status: 'soon',
    auth: 'password',
    /* 架電システムは別のエンジニアが持っていて DB も別。将来は共通 RDB で
       ログインを引き継ぐ（仕様書 8）ので、社内ページとは種別を分けておく。 */
    linkType: 'system',
    link: '',
    order: 1,
  },

  /* お知らせ — トップ上部の欄。カテゴリの箱としては出さない。 */
  {
    id: 'news',
    nameJa: 'モラブ情報',
    nameEn: 'Morub Info',
    noteJa: '',
    noteEn: '',
    category: 'news',
    targets: ['field', 'iit', 'office'],
    status: 'hidden',
    auth: 'id',
    linkType: 'internal',
    link: '/mypage/news',
    order: 1,
  },
];

/** その人の区分。office が先——内勤は万歩計のリストにいない人の差分である。 */
export function groupOf(person) {
  if (!person) return null;
  if (person.staffKind === 'office') return 'office';
  return person.iit === true ? 'iit' : 'field';
}

/**
 * この人のトップに出るメニュー。
 *
 * 仕様書 6:「対象外のメニューは表示しない（グレー表示もしない）。中身がない
 * カテゴリはカテゴリごと非表示」——だから hidden と対象外はどちらもここで
 * 落とし、画面には残ったものだけが渡る。
 */
export function menusFor(rows, person) {
  const group = groupOf(person);
  if (!group) return [];
  return (rows || [])
    .filter((m) => m.status !== 'hidden')
    .filter((m) => (m.targets || []).includes(group))
    .filter((m) => !m.foreignOnly || person?.foreign === true)
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * カテゴリの箱。中身のないカテゴリは返さない。
 *
 * 仕様書 6:「カテゴリ内のメニューが5件以上になったら、トップには4件だけ表示
 * し、『すべて見る（N件）』からカテゴリのページへ進む」——その判断は数を数える
 * ところでするので、ここで more を立てておく。
 */
export const TOP_MAX = 4;

export function boxesFor(rows, person, { all = false } = {}) {
  const menus = menusFor(rows, person);
  return CATEGORIES
    /* お知らせはトップ上部の欄であってカテゴリの箱ではない。 */
    .filter((c) => c.id !== 'news')
    .map((c) => {
      const mine = menus.filter((m) => m.category === c.id);
      const over = !all && mine.length > TOP_MAX;
      return { ...c, menus: over ? mine.slice(0, TOP_MAX) : mine, total: mine.length, more: over };
    })
    .filter((c) => c.menus.length);
}
