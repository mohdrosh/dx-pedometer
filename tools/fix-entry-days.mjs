#!/usr/bin/env node
/* ============================================================================
   期をまたいで迷子になった歩数の行を、正しい期へ戻す

     node tools/fix-entry-days.mjs            … 何をするかだけ見る
     node tools/fix-entry-days.mjs --apply    … 実際に動かす

   ---------------------------------------------------------------------------
   なぜ迷子が出たか

   src/App.jsx の saveDay が latest.current を土台にして次の値を作るのに、
   月を切り替えたときにその控えを捨てていなかった。11月を提出したあと12月の
   欄に数字を入れると、土台は11月のまま——30日ぶんの歩数ごと12月の記録として
   書かれる。逆向きに切り替えれば、まばらな月が満ちた月を上書きする。

   コードのほうは直した。これは、すでに書かれてしまった行の始末である。

   ---------------------------------------------------------------------------
   消さない

   この道具は DELETE を一度も実行しない。やるのは UPDATE だけで、それも
   「正しい期のその日が空いているとき」に限る。

     移動   正しい期にその日がない        → period を書き換えて戻す
     重複   正しい期に同じ歩数で既にある  → 触らない。報告だけ
     衝突   正しい期に違う歩数で既にある  → 触らない。報告だけ

   重複を消せば表は綺麗になるが、綺麗さのために人の記録に DELETE を向ける
   理由がない。集計は期の窓の内側しか見ないので、迷子の行は数字に出ない——
   残っていても誰の実績も狂わせない。消すかどうかは、報告を読んだ人が
   決めればよい。

   衝突はこの道具では直せない。同じ日に二つの歩数があって、どちらが本人の
   ものか機械には分からないので、名前と日付を出して人に渡す。
   ========================================================================= */

import { pool } from '../src/db.js';

const apply = process.argv.includes('--apply');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

/** 期は21日から翌月20日まで（仕様書の用紙の 21..31, 1..20）。
    だから21日以降に歩いた分は、翌月の期のものである。 */
function periodOf(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  let yy = y;
  let mm = m;
  if (d >= 21) { mm += 1; if (mm > 12) { mm = 1; yy += 1; } }
  return String(yy % 100).padStart(2, '0') + String(mm).padStart(2, '0');
}

const pad = (s, n) => String(s).padEnd(n);

async function main() {
  const { rows } = await pool.query(
    `SELECT d.period, d.employee_id AS "employeeId", to_char(d.day,'YYYY-MM-DD') AS day,
            d.steps, e.name
       FROM entry_days d JOIN employees e ON e.id = d.employee_id
      ORDER BY d.employee_id, d.day`,
  );

  /* 正しい期にその日があるか、すぐ引けるように。 */
  const have = new Map();
  for (const r of rows) have.set(`${r.period}|${r.employeeId}|${r.day}`, r.steps);

  const moves = [];
  const dups = [];
  const clash = [];

  for (const r of rows) {
    const want = periodOf(r.day);
    if (want === r.period) continue;
    const there = have.get(`${want}|${r.employeeId}|${r.day}`);
    if (there === undefined) moves.push({ ...r, want });
    else if (Number(there) === Number(r.steps)) dups.push({ ...r, want });
    else clash.push({ ...r, want, there });
  }

  console.log('');
  console.log(`  ${rows.length} 行を見て、期の外にあったのは `
    + `${moves.length + dups.length + clash.length} 行。\n`);

  if (moves.length) {
    console.log(`  ■ 正しい期へ戻す（${moves.length}行）`);
    for (const m of moves) {
      console.log(`      ${pad(m.name, 26)} ${m.day}  ${pad(`${m.steps}歩`, 10)}`
        + `  ${m.period} → ${m.want}`);
    }
    console.log('');
  }

  if (dups.length) {
    console.log(`  ■ 正しい期に同じ歩数で既にある。触らない（${dups.length}行）`);
    for (const d of dups) {
      console.log(`      ${pad(d.name, 26)} ${d.day}  ${pad(`${d.steps}歩`, 10)}`
        + `  ${d.period} に残る（${d.want} に同じものあり）`);
    }
    console.log('');
  }

  if (clash.length) {
    console.log(`  ■ 歩数が食い違う。機械では決められないので人へ（${clash.length}行）`);
    for (const c of clash) {
      console.log(`      ${pad(c.name, 26)} ${c.day}  ${c.period}=${c.steps}歩`
        + `  ${c.want}=${c.there}歩`);
    }
    console.log('');
  }

  if (!apply) {
    console.log(moves.length
      ? '  --apply で上の「戻す」だけを実行します。DELETE は一度も走りません。\n'
      : '  戻せる行はありません。\n');
    return;
  }
  if (!moves.length) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const m of moves) {
      /* 行き先の期に入れ物がなければ作る。entry_days は
         (period, employee_id) を entries に向けているので、先に要る。 */
      await client.query(
        `INSERT INTO entries (period, employee_id) VALUES ($1, $2)
         ON CONFLICT (period, employee_id) DO NOTHING`,
        [m.want, m.employeeId],
      );
      await client.query(
        `UPDATE entry_days SET period = $1
          WHERE period = $2 AND employee_id = $3 AND day = $4`,
        [m.want, m.period, m.employeeId, m.day],
      );
    }
    await client.query('COMMIT');
    console.log(`  ${moves.length}行を戻しました。消した行はありません。\n`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('  失敗したので、何も変えずに戻しました:', e.message, '\n');
    throw e;
  } finally {
    client.release();
  }
}

try {
  await main();
} finally {
  await pool.end();
}
