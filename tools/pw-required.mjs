#!/usr/bin/env node
/* ============================================================================
   全社で「社員番号＋パスワード」を要る状態にする切り替え

     node tools/pw-required.mjs           … いまどちらかを見る
     node tools/pw-required.mjs --on      … 全員に要る状態にする
     node tools/pw-required.mjs --off     … 元に戻す（設定した人だけ要る）

   ---------------------------------------------------------------------------
   佐野さん, 2026/11/25:「マイページの入口で『社員番号＋パスワード』にする。
   ログインするまでは氏名などの個人情報を表示しない」。

   切れているあいだ（既定）
     パスワードを設定した人にだけ、パスワードを訊く。設定していない人は
     これまでどおり社員番号だけで入れて、確認の画面に名前が出る。

   入れたあと
     設定していない人は入れない。番号を打つと、名前を出さずにそのまま
     設定の画面へ送られ、会社のメールに届く確認コードで鍵を作る。

   ---------------------------------------------------------------------------
   なぜ切り替えにしたか

   掛けた瞬間から、鍵を持たない人は全員が締め出される。600名が一斉に設定の
   列に並ぶことになるので、掛ける日は人が決めるべきであって、デプロイの
   ついでに決まってよいものではない。佐野さんも「会社に確認してから」と
   書いている。

   --on のときは、鍵を持っている人数と持っていない人数を出してから訊く。
   ========================================================================= */

import readline from 'node:readline';
import { getKey, setKey, pool } from '../src/db.js';

const on = process.argv.includes('--on');
const off = process.argv.includes('--off');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

function ask(q) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); ok(a.trim()); });
  });
}

/** 鍵を持っている人と、持っていない人。 */
async function counts() {
  const { rows } = await pool.query(
    `SELECT count(*) FILTER (WHERE pass_hash IS NOT NULL) AS with_pw,
            count(*) FILTER (WHERE pass_hash IS NULL)     AS without_pw,
            count(*) FILTER (WHERE pass_hash IS NULL
                               AND COALESCE(email,'') = '') AS no_mail
       FROM employees WHERE active`,
  );
  return rows[0];
}

try {
  const cfg = (await getKey('cfg')) || {};
  const now = cfg.pwRequired === true;
  const c = await counts();

  console.log('');
  console.log(`  いまの状態　　　　　：${now ? '全員に要る' : '設定した人だけ要る（既定）'}`);
  console.log(`  パスワードあり　　　：${c.with_pw}名`);
  console.log(`  パスワードなし　　　：${c.without_pw}名`);
  console.log(`  　うちメール登録なし：${c.no_mail}名　← この人たちは自分では設定できません`);
  console.log('');

  if (!on && !off) {
    console.log('  --on で全員に要る状態、--off で元に戻します。\n');
  } else if (on && now) {
    console.log('  すでに全員に要る状態です。何もしていません。\n');
  } else if (off && !now) {
    console.log('  すでに元の状態です。何もしていません。\n');
  } else if (on) {
    console.log(`  --on にすると、いまこの瞬間から ${c.without_pw}名 が入れなくなります。`);
    console.log('  その人たちは入口で設定の画面へ送られ、会社のメールに届く');
    console.log('  確認コードで鍵を作ることになります。');
    if (Number(c.no_mail) > 0) {
      console.log('');
      console.log(`  ※ ${c.no_mail}名 はメールアドレスが登録されていないので、自分では`);
      console.log('     設定できません。先にアドレスを入れてください。');
    }
    console.log('');
    const a = await ask('  本当に掛けますか？ yes と打ってください: ');
    if (a !== 'yes') console.log('\n  やめました。何も変えていません。\n');
    else {
      await setKey('cfg', { ...cfg, pwRequired: true });
      console.log('\n  掛けました。全員にパスワードが要ります。\n');
    }
  } else {
    await setKey('cfg', { ...cfg, pwRequired: false });
    console.log('  戻しました。設定した人だけに要ります。\n');
  }
} finally {
  await pool.end();
}
