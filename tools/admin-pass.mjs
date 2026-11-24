#!/usr/bin/env node
/* ============================================================================
   管理者のパスワード

     node tools/admin-pass.mjs            … 設定されているかだけ見る
     node tools/admin-pass.mjs --set      … 設定する（対話）
     node tools/admin-pass.mjs --clear    … 外す（鍵なしに戻る）

   ---------------------------------------------------------------------------
   2026/11/24 佐野さん:「モラエッグ管理者。これにもパスワードがあったほうが
   よいと思います」。

   管理者は employees の行を持たない——adminIds に並んだアドレスであって、
   社員の一人ではない——ので、鍵は config に置く。入口は万歩計とモラエッグで
   共通なので、設定すれば両方で要るようになる。管理画面は全員の歩数も住所も
   読めるのだから、そのほうが筋である。

   置かれていなければ、これまでどおり素通りする。配った瞬間に本人が入れなく
   なるのを避けるためで、鍵は配ったあとに設定する。

   ---------------------------------------------------------------------------
   パスワードはこのファイルに書かない

   --set は打ち込んでもらう。引数にも取らない——引数は ps で他の人に見え、
   シェルの履歴にも残る。保存されるのは scrypt のハッシュで、元の文字列は
   どこにも残らない。
   ========================================================================= */

import readline from 'node:readline';
import {
  hashPassword, adminPassword, setAdminPassword, setKey, getKey, pool,
} from '../src/db.js';

const set = process.argv.includes('--set');
const clear = process.argv.includes('--clear');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
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

async function show() {
  const cfg = (await getKey('cfg')) || {};
  const who = (cfg.adminIds || []).join('、') || '(未設定)';
  const has = await adminPassword();
  console.log('');
  console.log(`  管理者　　　　：${who}`);
  console.log(`  パスワード　　：${has ? '設定済み' : 'なし（鍵なしで入れます）'}`);
  console.log('');
}

try {
  if (clear) {
    await setKey('adminPass', { hash: null, at: Date.now() });
    console.log('\n  パスワードを外しました。鍵なしで入れます。');
  } else if (set) {
    const a = await askHidden('  管理者のパスワード: ');
    const b = await askHidden('  もう一度          : ');
    if (!a || a !== b) console.error('\n  一致しませんでした。何もしていません。');
    else if (a.length < 8) console.error('\n  8文字以上にしてください。何もしていません。');
    else {
      await setAdminPassword(await hashPassword(a));
      console.log('\n  設定しました。');
    }
  }
  await show();
  if (!set && !clear) console.log('  --set で設定、--clear で外します。\n');
} finally {
  await pool.end();
}
