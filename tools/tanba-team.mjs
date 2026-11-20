#!/usr/bin/env node
/* ============================================================================
   丹波担当の登録

   2026/11/20 佐野さん:「丹波は3名います。休むこともあるので、3名のメール
   アドレスを丹波担当として登録してください」.

     node tools/tanba-team.mjs                 … いまの状態を見る
     node tools/tanba-team.mjs --apply         … 3名を登録する
     node tools/tanba-team.mjs --password      … パスワードを設定する（対話）

   ---------------------------------------------------------------------------
   なぜ3名で、なぜパスワードなのか

   3名のうち黒田さんは社員（0020）だが、内田さんと梅川さんは社員リストの
   どの版にも載っていない——嘱託かパートで、社員番号を持たない。ログインは
   社員番号しか受け取らないので、番号を発行するか、別の入口を作るしかない。
   佐野さんの選んだのは後者で、メールアドレスで入る。

   アドレスは推測しやすい（kuroda@morabu.com）。それだけで鶏舎の取れ高を
   書き換えられては困るので、この3名の入口にだけパスワードを置く。ほかの
   社員はこれまでどおり社員番号だけで入る——仕様書 7「入口は今のまま、個人
   情報のメニューだけ鍵をかける」から外れないように、鍵は3名ぶんである。

   ---------------------------------------------------------------------------
   パスワードはこのファイルに書かない

   --password は打ち込んでもらう。引数にも取らない——引数は ps で他の人に
   見え、シェルの履歴にも残る。保存されるのは scrypt のハッシュで、元の
   文字列はどこにも残らない。
   ========================================================================= */

import readline from 'node:readline';
import {
  getEmployee, employeeByEmail, hashPassword, setPassword, pool,
} from '../src/db.js';

/* 佐野さんが挙げた3名。番号は、持っている人はその番号、持っていない人は
   9000 番台——社員番号と見分けがつき、採番とぶつからない範囲。 */
const TEAM = [
  { email: 'kuroda@morabu.com', id: '0020', name: '黒田 邦明', employee: true },
  { email: 'uchida@morabu.com', id: '9001', name: '内田', employee: false },
  { email: 'n_umekawa@morabu.com', id: '9002', name: '梅川', employee: false },
];

const apply = process.argv.includes('--apply');
const setPw = process.argv.includes('--password');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

/** その行を、メールでも番号でも探す。 */
async function find(m) {
  return (await employeeByEmail(m.email)) || (await getEmployee(m.id));
}

async function show() {
  console.log('');
  for (const m of TEAM) {
    const got = await find(m);
    const pw = got
      ? (await pool.query('SELECT pass_hash FROM employees WHERE id = $1', [got.id]))
        .rows[0]?.pass_hash
      : null;
    console.log(`  ${m.email}`);
    console.log(got
      ? `    ${got.id}  ${got.name}  丹波=${got.eggFarm ? 'はい' : 'いいえ'}`
        + `  パスワード=${pw ? '設定済み' : 'なし'}`
      : '    登録されていません');
  }
  console.log('');
}

async function create() {
  for (const m of TEAM) {
    const got = await find(m);
    if (got) {
      /* 居る人は作らない。丹波のフラグだけ立てる——名前も事業所も、
         その人のものが既に入っている。 */
      await pool.query(
        'UPDATE employees SET egg = TRUE, egg_farm = TRUE, active = TRUE WHERE id = $1',
        [got.id],
      );
      console.log(`  ${got.id}  ${got.name}  → 丹波担当にしました`);
      continue;
    }
    /* 居ない人を作る。万歩計には入れない——社員ではないので、対象者数にも
       完歩賞にも未提出の督促にも出てはいけない。trial がその印である。 */
    const { rows } = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM employees');
    await pool.query(
      `INSERT INTO employees (id, name, email, active, trial, egg, egg_farm, sort_order)
       VALUES ($1, $2, $3, TRUE, TRUE, TRUE, TRUE, $4)`,
      [m.id, m.name, m.email, rows[0].n],
    );
    console.log(`  ${m.id}  ${m.name}  → 作成しました（万歩計の対象外）`);
  }
}

/** 打ち込んでもらう。画面には出さない。 */
function askHidden(q) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const out = process.stdout;
    const onData = (ch) => {
      if (['\n', '\r', '\u0004'].includes(String(ch))) out.write('\n');
      else { out.clearLine(0); out.cursorTo(0); out.write(`${q}${'*'.repeat(rl.line.length)}`); }
    };
    process.stdin.on('data', onData);
    rl.question(q, (a) => { process.stdin.off('data', onData); rl.close(); ok(a); });
  });
}

async function password() {
  const a = await askHidden('  丹波担当のパスワード: ');
  const b = await askHidden('  もう一度            : ');
  if (!a || a !== b) { console.error('\n  一致しませんでした。何もしていません。\n'); return false; }
  if (a.length < 8) { console.error('\n  8文字以上にしてください。何もしていません。\n'); return false; }
  const hash = await hashPassword(a);
  let n = 0;
  for (const m of TEAM) {
    const got = await find(m);
    if (!got) { console.error(`  ${m.email} が居ません。先に --apply を実行してください。`); continue; }
    /* 3名とも同じパスワード（佐野さんの指示）。それでも塩は1つなので、
       同じハッシュを3行に入れる——同じ文字列から同じ鍵が出るのは、同じ
       人たちが同じ合言葉を使っているからで、隠すものではない。 */
    await setPassword(got.id, hash);
    n += 1;
  }
  console.log(`\n  ${n}名に設定しました。\n`);
  return true;
}

try {
  if (apply) { console.log(''); await create(); }
  if (setPw) { console.log(''); await password(); }
  await show();
  if (!apply && !setPw) {
    console.log('  --apply で登録、--password でパスワードを設定します。\n');
  }
} finally {
  await pool.end();
}
