#!/usr/bin/env node
/* ============================================================================
   ひとりぶんのパスワードを、管理者が手で設定する

     node tools/set-pass.mjs                     … 手で設定するしかない人を並べる
     node tools/set-pass.mjs --id 1003045        … その人のパスワードを設定する
     node tools/set-pass.mjs --id 1003045 --clear… その人のパスワードを外す

   ---------------------------------------------------------------------------
   なぜ要るか

   ふつうは本人が設定する——社員番号を入れると会社のメールに確認コードが
   届き、それを打って鍵を作る（佐野, 2026/11/25）。メールアドレスが本人の
   ものであることが、本人である証拠になっている。

   ところが、会社のメールアドレスが登録されていない人がいる。2026/11/25
   時点では 田中 寿人（1003045）がそれで、名簿のメール欄は「ー」、
   LINEWORKS ID から綴った k_tanaka@morabu.com も実在しなかった。コードの
   送り先が無いのだから、本人にはどうやっても設定できない。

   そういう人だけ、管理者が代わりに置く。

   ---------------------------------------------------------------------------
   「社員番号だけでは設定できないように」を破っていないか

   破っていない。あれは「入口から、番号を知っているだけの人が鍵を作れて
   しまう」ことを止める決まりである。この道具はサーバの中でしか動かず、
   DATABASE_URL を持っている人——つまり管理者——にしか実行できない。入口は
   何も変わらない。

   渡し方は人が決めること。電話でも、口頭でも、本人確認ができる方法で。
   メールで送っては、送り先が無いから始まった話の意味がなくなる。

   ---------------------------------------------------------------------------
   パスワードは引数に取らない

   引数は ps で他の人に見え、シェルの履歴にも残る。打ち込んでもらって、
   保存するのは scrypt のハッシュだけにする。元の文字列はどこにも残らない。
   ========================================================================= */

import readline from 'node:readline';
import {
  hashPassword, setPassword, passwordFor, getEmployee, pwOk, pool,
} from '../src/db.js';

const argOf = (k) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : null;
};
const id = argOf('--id');
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
      /* 端末でないとき（パイプで流し込まれたときなど）は clearLine が無い。
         伏せ字にできないだけなので、黙って素通りさせる——ここで落ちると、
         設定そのものができない。 */
      if (!out.isTTY || !out.clearLine) return;
      if (['\n', '\r', '\u0004'].includes(String(ch))) out.write('\n');
      else { out.clearLine(0); out.cursorTo(0); out.write(`${q}${'*'.repeat(rl.line.length)}`); }
    };
    process.stdin.on('data', onData);
    rl.question(q, (a) => { process.stdin.off('data', onData); rl.close(); ok(a); });
  });
}

/** 本人には設定できない人——メールの登録が無く、まだ鍵も無い。 */
async function stuck() {
  const { rows } = await pool.query(
    `SELECT id, name FROM employees
      WHERE active AND COALESCE(email,'') = '' AND pass_hash IS NULL
      ORDER BY id`,
  );
  return rows;
}

try {
  if (!id) {
    const rows = await stuck();
    console.log('');
    if (!rows.length) {
      console.log('  手で設定するしかない人はいません。\n');
    } else {
      console.log(`  メールの登録が無く、まだ鍵も無い人——手で設定するしかない人（${rows.length}名）\n`);
      for (const r of rows) console.log(`      ${r.id}  ${r.name}`);
      console.log('\n  --id <社員番号> で、その人のパスワードを設定します。\n');
    }
  } else {
    const who = await getEmployee(id);
    if (!who) {
      console.error(`\n  ${id} は見つかりません。何もしていません。\n`);
      process.exitCode = 1;
    } else if (clear) {
      await setPassword(id, null);
      await pwOk(id);
      console.log(`\n  ${who.name}（${id}）のパスワードを外しました。\n`);
    } else {
      const had = await passwordFor(id);
      console.log('');
      console.log(`  社員番号　　：${id}`);
      console.log(`  お名前　　　：${who.name}`);
      console.log(`  メール　　　：${who.email || '(登録なし)'}`);
      console.log(`  いまの鍵　　：${had ? '設定済み（上書きします）' : 'なし'}`);
      console.log('');
      const a = await askHidden('  新しいパスワード: ');
      const b = await askHidden('  もう一度        : ');
      if (!a || a !== b) console.error('\n  一致しませんでした。何もしていません。\n');
      else if (a.length < 8) console.error('\n  8文字以上にしてください。何もしていません。\n');
      else {
        await setPassword(id, await hashPassword(a));
        /* 間違えた回数と錠も落としておく。締め出されたまま渡されては、
           新しい鍵を持っていても入れない。 */
        await pwOk(id);
        console.log(`\n  設定しました。${who.name}さんに、本人確認のできる方法で`);
        console.log('  お伝えください（メールは送り先が無いので使えません）。\n');
      }
    }
  }
} finally {
  await pool.end();
}
