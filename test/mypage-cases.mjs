/* マイページ — 誰に何が出るか。

   仕様書（佐野「マイページ構成・メニュー設計」2026/11/15）の表そのものが
   答えなので、ここで確かめるのは「表のとおりに出るか」である。画面は表を
   読むだけなので、表の読み方が合っていれば画面も合っている。 */

import {
  CATEGORIES, MENU_SEED, GROUPS, groupOf, menusFor, boxesFor, TOP_MAX,
} from '../src/mypage.js';

let n = 0;
const fails = [];
const is = (what, got, want) => {
  n += 1;
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) fails.push(`${what}\n    got  ${a}\n    want ${b}`);
};

const rows = MENU_SEED.map((m) => ({ ...m }));
const ids = (list) => list.map((m) => m.id);

/* ------------------------------ 区分の判定 ------------------------------- */

is('内勤は内勤', groupOf({ staffKind: 'office' }), 'office');
is('IIT のフラグが立っていれば IIT', groupOf({ staffKind: 'field', iit: true }), 'iit');
is('外勤は外勤', groupOf({ staffKind: 'field' }), 'field');
/* 区分が空なのは名簿をまだ取り込んでいない人。万歩計のリストは全員外勤
   だった（仕様書 2）ので、外勤として扱う。 */
is('区分が空なら外勤', groupOf({}), 'field');
is('内勤に IIT が立っていても内勤', groupOf({ staffKind: 'office', iit: true }), 'office');
is('誰でもない人には区分がない', groupOf(null), null);

/* --------------------------- 今回公開するもの ---------------------------- */
/* 仕様書 4:「今回公開するのは万歩計・モラエッグ・旅費経費精算（内勤）で、
   個人情報設定・勤怠・スケジュールは『準備中』とする」. */

const field = menusFor(rows, { staffKind: 'field' });
const iit = menusFor(rows, { staffKind: 'field', iit: true });
const office = menusFor(rows, { staffKind: 'office' });

is('外勤（一般）は万歩計とモラエッグだけ', ids(field), ['pedometer', 'egg']);
is('外勤 IIT はそれに個人情報設定と勤怠が加わる',
  ids(iit).sort(), ['attendance', 'egg', 'pedometer', 'personal']);
is('内勤は万歩計を持たない', ids(office).includes('pedometer'), false);
is('内勤は旅費・経費精算とスケジュールを持つ',
  ids(office).sort(), ['attendance', 'egg', 'expenses', 'personal', 'schedule']);
is('モラエッグは3区分すべて',
  GROUPS.every((g) => ids(menusFor(rows, { staffKind: g === 'office' ? 'office' : 'field', iit: g === 'iit' })).includes('egg')),
  true);

/* 状態。公開＝押せる、準備中＝出るが押せない。 */
const by = (list, id) => list.find((m) => m.id === id);
is('万歩計は公開', by(field, 'pedometer').status, 'live');
is('個人情報設定は準備中', by(iit, 'personal').status, 'soon');
is('旅費・経費精算は外部サイト', by(office, 'expenses').linkType, 'external');

/* 「将来」は誰にも出ない——行は残っているが、状態が hidden なので落ちる。 */
for (const id of ['skill', 'notices', 'monthly', 'daily', 'payslip', 'news']) {
  is(`${id} はまだ出ない`,
    [...ids(field), ...ids(iit), ...ids(office)].includes(id), false);
}

/* --------------------------- 帰国申請は国籍で ---------------------------- */
/* 仕様書 4 ※:「帰国申請は区分ではなく、外国籍社員のフラグで表示する」.
   いまは status が hidden なので誰にも出ないが、公開したときに区分ではなく
   国籍で絞れることを先に決めておく。 */
{
  const open = rows.map((m) => (m.id === 'homeleave' ? { ...m, status: 'live' } : m));
  is('外国籍なら帰国申請が出る',
    ids(menusFor(open, { staffKind: 'field', foreign: true })).includes('homeleave'), true);
  is('日本籍には出ない',
    ids(menusFor(open, { staffKind: 'field' })).includes('homeleave'), false);
  is('内勤の外国籍にも出る',
    ids(menusFor(open, { staffKind: 'office', foreign: true })).includes('homeleave'), true);
}

/* ----------------------------- カテゴリの箱 ------------------------------ */
/* 仕様書 6:「中身がないカテゴリはカテゴリごと非表示」. */

is('外勤（一般）の箱は健康・福利厚生だけ',
  boxesFor(rows, { staffKind: 'field' }).map((c) => c.id), ['health']);
is('内勤の箱は4つ',
  boxesFor(rows, { staffKind: 'office' }).map((c) => c.id),
  ['me', 'work', 'health', 'tools']);
is('箱の順番はカテゴリの順番',
  boxesFor(rows, { staffKind: 'office' }).map((c) => c.id),
  CATEGORIES.filter((c) => ['me', 'work', 'health', 'tools'].includes(c.id)).map((c) => c.id));
is('お知らせは箱にならない',
  boxesFor(rows, { staffKind: 'office' }).some((c) => c.id === 'news'), false);

/* 仕様書 6:「カテゴリ内のメニューが5件以上になったら、トップには4件だけ表示
   し、『すべて見る（N件）』からカテゴリのページへ進む」. */
{
  const many = rows.map((m) => (m.category === 'work' ? { ...m, status: 'live', targets: ['office'] } : m));
  const [work] = boxesFor(many, { staffKind: 'office', foreign: true }).filter((c) => c.id === 'work');
  is('5件以上なら4件だけ', work.menus.length, TOP_MAX);
  is('総数は数えてある', work.total, 6);
  is('すべて見るが出る', work.more, true);
  const [all] = boxesFor(many, { staffKind: 'office', foreign: true }, { all: true })
    .filter((c) => c.id === 'work');
  is('すべて見るの先では全部', all.menus.length, 6);
  is('その先にもう「すべて見る」はない', all.more, false);
}
{
  const [health] = boxesFor(rows, { staffKind: 'field' }).filter((c) => c.id === 'health');
  is('4件以下ならそのまま', health.more, false);
}

/* ------------------------------ 表の健全性 ------------------------------- */

is('カテゴリは6つ', CATEGORIES.length, 6);
is('どのメニューも実在のカテゴリに入っている',
  MENU_SEED.every((m) => CATEGORIES.some((c) => c.id === m.category)), true);
is('どのメニューの対象者も実在の区分',
  MENU_SEED.every((m) => m.targets.every((g) => GROUPS.includes(g))), true);
is('id はすべて違う', new Set(MENU_SEED.map((m) => m.id)).size, MENU_SEED.length);
is('状態は3つのうちのどれか',
  MENU_SEED.every((m) => ['live', 'soon', 'hidden'].includes(m.status)), true);
/* 外部サイトには行き先がいる。社内ページは作る前なので空でよい。 */
is('外部サイトには URL がある',
  MENU_SEED.filter((m) => m.linkType === 'external').every((m) => /^https:\/\//.test(m.link)), true);
is('押せるメニューには行き先がある',
  MENU_SEED.filter((m) => m.status === 'live').every((m) => m.link), true);

if (fails.length) {
  console.error(`\n  ${fails.length} of ${n} failed:\n`);
  fails.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`  ${n} checks — マイページの出し分け`);
