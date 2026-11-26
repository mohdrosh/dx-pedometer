#!/usr/bin/env node
/* ============================================================================
   管理者——誰が、どちらの持ち場で、どの鍵で入るか

     node tools/admin-pass.mjs                          … いまの状態を見る
     node tools/admin-pass.mjs --id <アドレス> --set     … その人の鍵を置く（対話）
     node tools/admin-pass.mjs --id <アドレス> --scope steps|egg|both
     node tools/admin-pass.mjs --id <アドレス> --add     … 管理者に加える
     node tools/admin-pass.mjs --id <アドレス> --remove  … 管理者から外す
     node tools/admin-pass.mjs --id <アドレス> --clear   … その人の鍵を外す
     node tools/admin-pass.mjs --set                    … 共通の鍵（旧いやり方）
     node tools/admin-pass.mjs --clear                  … 共通の鍵を外す

   ---------------------------------------------------------------------------
   持ち場（佐野, 2026/11/26）

     「万歩計の管理者であって、たまごは関係ない。アドレスもパスワードも
       別にしたほうがよい」

     steps … 万歩計・勤怠・旅費精算。モラエッグには入れない
     egg   … モラエッグだけ。歩数も名簿も住所も読めない
     both  … 両方（既定。書いていない人はこれまでどおり）

   画面を隠すだけでなく、サーバが断る。だから steps の人がモラエッグの
   API を直接叩いても 403 になる。

   ---------------------------------------------------------------------------
   鍵は一人ずつ置ける

   一人ぶんが無ければ、これまでの共通の鍵に落ちる。分ける作業の途中で誰も
   閉め出されないように。全員に自分の鍵を置いたら、共通のものは --clear で
   外してよい。

   パスワードは引数に取らない——ps で他の人に見え、履歴にも残るので、
   打ち込んでもらう。保存するのは scrypt のハッシュだけ。
   ========================================================================= */

import readline from 'node:readline';
import {
  hashPassword, adminPassword, adminHasOwnPassword, setAdminPassword,
  setKey, getKey, pool,
} from '../src/db.js';

const argOf = (k) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : null;
};
const has = (k) => process.argv.includes(k);

const id = (argOf('--id') || '').trim().toLowerCase();
const scope = argOf('--scope');
const set = has('--set');
const clear = has('--clear');
const add = has('--add');
const remove = has('--remove');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

function askHidden(q) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const out = process.stdout;
    const onData = (ch) => {
      if (!out.isTTY || !out.clearLine) return;
      if (['\n', '\r', '\u0004'].includes(String(ch))) out.write('\n');
      else { out.clearLine(0); out.cursorTo(0); out.write(`${q}${'*'.repeat(rl.line.length)}`); }
    };
    process.stdin.on('data', onData);
    rl.question(q, (a) => { process.stdin.off('data', onData); rl.close(); ok(a); });
  });
}

const LABEL = { steps: '万歩計のみ', egg: 'モラエッグのみ', both: '両方' };

async function show() {
  const cfg = (await getKey('cfg')) || {};
  const ids = cfg.adminIds || [];
  const scopes = cfg.adminScopes || {};
  const shared = await adminPassword();
  console.log('');
  if (!ids.length) console.log('  管理者は設定されていません。\n');
  else {
    console.log('  管理者');
    for (const a of ids) {
      const sc = scopes[String(a).toLowerCase()] || scopes[a] || 'both';
      const own = await adminHasOwnPassword(a);
      console.log(`      ${String(a).padEnd(26)} ${LABEL[sc] || sc}`
        + `　鍵: ${own ? '本人のもの' : (shared ? '共通のものを使用' : 'なし')}`);
    }
    console.log('');
  }
  console.log(`  共通の鍵　　：${shared ? '設定済み' : 'なし（鍵なしで入れます）'}`);
  console.log('');
}

try {
  const cfg = (await getKey('cfg')) || {};
  const ids = [...(cfg.adminIds || [])];
  const scopes = { ...(cfg.adminScopes || {}) };

  if (id && add) {
    if (ids.some((a) => String(a).toLowerCase() === id)) {
      console.log(`\n  ${id} はすでに管理者です。`);
    } else {
      ids.push(id);
      await setKey('cfg', { ...cfg, adminIds: ids, adminScopes: scopes });
      console.log(`\n  ${id} を管理者に加えました。--scope で持ち場を決めてください。`);
    }
  } else if (id && remove) {
    const next = ids.filter((a) => String(a).toLowerCase() !== id);
    if (next.length === ids.length) console.log(`\n  ${id} は管理者ではありません。`);
    else if (!next.length) console.error('\n  最後の一人は外せません。先に別の管理者を加えてください。');
    else {
      delete scopes[id];
      await setKey('cfg', { ...cfg, adminIds: next, adminScopes: scopes });
      console.log(`\n  ${id} を管理者から外しました。鍵はそのまま残っています。`);
    }
  } else if (id && scope) {
    if (!['steps', 'egg', 'both'].includes(scope)) {
      console.error('\n  --scope は steps / egg / both のいずれかです。');
    } else if (!ids.some((a) => String(a).toLowerCase() === id)) {
      console.error(`\n  ${id} は管理者ではありません。先に --add してください。`);
    } else {
      scopes[id] = scope;
      await setKey('cfg', { ...cfg, adminIds: ids, adminScopes: scopes });
      console.log(`\n  ${id} の持ち場を「${LABEL[scope]}」にしました。`);
      console.log('  いま入っている人は、入り直すまで前の持ち場のままです。');
    }
  } else if (id && clear) {
    await setAdminPassword(null, id);
    console.log(`\n  ${id} の鍵を外しました。共通の鍵があればそちらになります。`);
  } else if (id && set) {
    const a = await askHidden(`  ${id} のパスワード: `);
    const b = await askHidden('  もう一度          : ');
    if (!a || a !== b) console.error('\n  一致しませんでした。何もしていません。');
    else if (a.length < 8) console.error('\n  8文字以上にしてください。何もしていません。');
    else {
      await setAdminPassword(await hashPassword(a), id);
      console.log(`\n  ${id} の鍵を置きました。`);
    }
  } else if (clear) {
    await setKey('adminPass', { hash: null, at: Date.now() });
    console.log('\n  共通の鍵を外しました。');
  } else if (set) {
    const a = await askHidden('  共通のパスワード: ');
    const b = await askHidden('  もう一度        : ');
    if (!a || a !== b) console.error('\n  一致しませんでした。何もしていません。');
    else if (a.length < 8) console.error('\n  8文字以上にしてください。何もしていません。');
    else {
      await setAdminPassword(await hashPassword(a));
      console.log('\n  共通の鍵を置きました。');
    }
  }

  await show();
  if (!id && !set && !clear) {
    console.log('  --id <アドレス> --set で一人ぶんの鍵、--scope で持ち場を決めます。\n');
  }
} finally {
  await pool.end();
}
