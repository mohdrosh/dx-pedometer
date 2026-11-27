#!/usr/bin/env node
/* ============================================================================
   私用のパック数の上限

     node tools/egg-priv-cap.mjs          … いまの状態を見る
     node tools/egg-priv-cap.mjs --on     … 1パックまでにする
     node tools/egg-priv-cap.mjs --off    … 上限をやめる
     node tools/egg-priv-cap.mjs --set 2  … 2パックまでにする

   ---------------------------------------------------------------------------
   佐野, 2026/11/27:「リクエストが多いため、当面の間、私用は1人1パックまでと
   させていただきます」。

   「当面の間」なので、数をコードに書かずにここから変える。掛かっているあい
   だは、リクエストの画面にも断り書きが出る——上限と文面が別々に動くと、
   「1パックまで」と書いてあるのに2パック押せる、ということが起きる。

   仕事用はこの上限の外。
   ========================================================================= */

import { getKey, setKey, pool } from '../src/db.js';

const argOf = (k) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : null;
};
const on = process.argv.includes('--on');
const off = process.argv.includes('--off');
const set = argOf('--set');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

try {
  const cfg = (await getKey('cfg')) || {};
  const egg = cfg.egg || {};
  const now = Number.isInteger(egg.privMax) ? egg.privMax : null;

  let next = now;
  if (off) next = null;
  else if (on) next = 1;
  else if (set !== null) {
    const n = Number(set);
    if (!Number.isInteger(n) || n < 1 || n > 99) {
      console.error('\n  --set は1〜99の整数です。何もしていません。\n');
      process.exit(1);
    }
    next = n;
  }

  if (next !== now) {
    const nextEgg = { ...egg };
    if (next === null) delete nextEgg.privMax;
    else nextEgg.privMax = next;
    await setKey('cfg', { ...cfg, egg: nextEgg });
  }

  console.log('');
  console.log(`  私用の上限　：${next === null ? 'なし' : `${next}パックまで`}`);
  console.log('  仕事用　　　：この上限の外（これまでどおり）');
  if (next !== null) {
    console.log('');
    console.log('  リクエストの画面に、次の断り書きが出ます：');
    console.log('    リクエストが多いため、当面の間、私用は1人1パックまでと');
    console.log('    させていただきます。');
  }
  console.log('');
  if (next === now) console.log('  --on で1パックまで、--off で上限なし、--set <数> で任意の数。\n');
} finally {
  await pool.end();
}
