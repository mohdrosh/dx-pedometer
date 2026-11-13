#!/usr/bin/env node
/* ============================================================================
   社員リスト（Excel）→ employees テーブル の同期

   佐野さん／吉成さんが管理している「社員リスト」の .xlsx を読み、
   employees テーブルをその内容に合わせる。

     node tools/roster-sync.mjs <社員リスト.xlsx>            … 確認のみ（何も書かない）
     node tools/roster-sync.mjs <社員リスト.xlsx> --apply    … 実行する
     node tools/roster-sync.mjs <社員リスト.xlsx> --apply --deactivate
                                                            … 消さずに「退職」にする

   2026/11/13 佐野さん:「モラブメール以外の方は、そちらに送ってほしいと連絡を
   頂いている方です。個人用アドレスの方はそのまま残しています。個人用アドレス
   にもお送りをお願いいたします。企業用アドレスの方は削除し、モラブメールへ
   変更しています。※田中寿人さんのみ、メールアドレスなしです」.

   なぜスクリプトなのか。名簿は毎月変わり、次の版も同じ形で届く。一度かぎりの
   SQL を書くと、次の版でまた同じ作業をすることになる。そして名簿そのものは
   氏名とメールアドレスの固まりなので、リポジトリには置かない——ファイルを
   読むだけの、このスクリプトだけを置く。
   ========================================================================= */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import pg from 'pg';

const DIR = path.dirname(fileURLToPath(import.meta.url));

/* 名簿から落ちても消してはいけない人。二人とも今の名簿には載っているので、
   いまは何もしない——次の版で取り違えがあっても、サイトを運営している本人が
   締め出されることだけはないように置いてある。 */
const KEEP = new Set([
  '0208',    /* 佐野 ちいほ（健康対策委員会） */
  '2407036', /* モハメド ロシャン（開発） */
]);
/* kenkou@morabu.com は employees の行ではなく設定の adminIds なので、
   この同期では触れない。 */

const file = process.argv[2];
const apply = process.argv.includes('--apply');
const soft = process.argv.includes('--deactivate');
if (!file) {
  console.error('usage: node tools/roster-sync.mjs <社員リスト.xlsx> [--apply] [--deactivate]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

/* ------------------------------ the sheet -------------------------------- */

const cellText = (c) => {
  let v = c?.value;
  if (v && typeof v === 'object') v = v.text ?? v.result ?? '';
  return String(v ?? '').replace(/ /g, ' ').trim();
};

/* 「―」「ー」「－」「-」 はどれも「メールアドレスなし」の意味で入っている。
   見た目は同じでも別の文字なので、どれも空として扱う。 */
const DASHES = /^[-‐-―－ー−]+$/;

/** 1セルのメールアドレス。複数あるときは「; 」でつなぐ。 */
function mailOf(raw) {
  const v = String(raw || '').trim();
  if (!v || DASHES.test(v)) return null;
  const parts = v.split(/[;,\n]/).map((s) => s.trim()).filter((s) => s && s.includes('@'));
  return parts.length ? [...new Set(parts)].join('; ') : null;
}

/** 氏名の全角スペースは、画面の表記にあわせて半角ひとつにする。 */
const nameOf = (raw) => String(raw || '').replace(/[\s　]+/g, ' ').trim();

async function readSheet(xlsx) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsx);
  const ws = wb.getWorksheet('データベース') || wb.worksheets[0];
  if (!ws) throw new Error('シートが見つかりません');

  /* 見出しの行を探す。いまの版は3行目だが、上に行が足されることがある。 */
  let head = 0;
  for (let r = 1; r <= Math.min(10, ws.rowCount); r += 1) {
    const cells = [];
    ws.getRow(r).eachCell({ includeEmpty: true }, (c) => cells.push(cellText(c)));
    if (cells.includes('社員番号') && cells.includes('氏名')) { head = r; break; }
  }
  if (!head) throw new Error('「社員番号」「氏名」の見出し行が見つかりません');

  const hdr = [];
  ws.getRow(head).eachCell({ includeEmpty: true }, (c, i) => { hdr[i] = cellText(c); });
  const col = (name) => {
    const i = hdr.indexOf(name);
    if (i < 0) throw new Error(`列「${name}」が見つかりません`);
    return i;
  };
  const C = {
    id: col('社員番号'), name: col('氏名'),
    mail: col('メールアドレス'), sex: col('性別'),
  };

  const out = [];
  const seen = new Set();
  for (let r = head + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const id = cellText(row.getCell(C.id));
    if (!id) continue;
    /* 同じ社員番号が二度出てきたら、後の行を採る方が危ない——どちらが正しいか
       はこちらでは決められないので、止めて人に見てもらう。 */
    if (seen.has(id)) throw new Error(`社員番号 ${id} が2行あります（${r}行目）`);
    seen.add(id);
    const sex = cellText(row.getCell(C.sex));
    out.push({
      id,
      name: nameOf(cellText(row.getCell(C.name))),
      email: mailOf(cellText(row.getCell(C.mail))),
      gender: sex === '男' || sex === '女' ? sex : null,
    });
  }
  return out;
}

/* ------------------------------- the sync -------------------------------- */

const same = (a, b) => String(a ?? '') === String(b ?? '');

async function main() {
  const list = await readSheet(path.resolve(file));
  const byId = new Map(list.map((p) => [p.id, p]));

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /sslmode=disable/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
  });

  const { rows: now } = await pool.query(
    'SELECT id, name, email, gender, active, egg FROM employees ORDER BY id',
  );
  const have = new Map(now.map((r) => [String(r.id), r]));

  const add = list.filter((p) => !have.has(p.id));
  const change = [];
  for (const p of list) {
    const r = have.get(p.id);
    if (!r) continue;
    const bits = [];
    if (!same(r.name, p.name)) bits.push('氏名');
    if (!same(r.email, p.email)) bits.push('メール');
    if (p.gender && !same(r.gender, p.gender)) bits.push('性別');
    if (!r.active) bits.push('在籍');
    if (!r.egg) bits.push('モラエッグ');
    if (bits.length) change.push({ ...p, was: r, bits });
  }
  const drop = now.filter((r) => !byId.has(String(r.id)) && !KEEP.has(String(r.id)));

  /* 消す人が何を一緒に失うのか。万歩計の記録は月ごとの集計のもとなので、
     「30人消えます」より「30人と、その人たちの入力◯件が消えます」の方が
     決める材料になる。 */
  let loses = { entries: 0, requests: 0, posts: 0 };
  if (drop.length) {
    const ids = drop.map((r) => String(r.id));
    const q = async (sql) => Number((await pool.query(sql, [ids])).rows[0].n);
    loses = {
      entries: await q('SELECT COUNT(*) n FROM entries WHERE employee_id = ANY($1::text[])'),
      requests: await q('SELECT COUNT(*) n FROM egg_requests WHERE employee_id = ANY($1::text[])'),
      posts: await q('SELECT COUNT(*) n FROM egg_posts WHERE employee_id = ANY($1::text[])'),
    };
  }

  console.log('');
  console.log(`  名簿（Excel）   : ${list.length}名`);
  console.log(`  いまの登録      : ${now.length}名（在籍 ${now.filter((r) => r.active).length}）`);
  console.log('  ------------------------------------------------------------');
  console.log(`  追加            : ${add.length}名`);
  console.log(`  変更            : ${change.length}名`);
  console.log(`  ${soft ? '退職にする' : '削除する    '}    : ${drop.length}名`);
  if (drop.length && !soft) {
    console.log(`                    （万歩計の入力 ${loses.entries}件、`
      + `卵のリクエスト ${loses.requests}件、料理の投稿 ${loses.posts}件も一緒に消えます）`);
  }
  console.log('');

  /* 詳細はファイルに。氏名とメールアドレスの一覧を画面に流すと、肩越しに
     見えるし、スクロールの履歴にも残る。 */
  const report = path.join(DIR, 'roster-sync-report.csv');
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['区分', '社員番号', '氏名', '内容', '現在', '名簿'].map(esc).join(',')];
  for (const p of add) lines.push(['追加', p.id, p.name, '', '', p.email].map(esc).join(','));
  for (const p of change) {
    for (const b of p.bits) {
      const [was, next] = b === '氏名' ? [p.was.name, p.name]
        : b === 'メール' ? [p.was.email, p.email]
          : b === '性別' ? [p.was.gender, p.gender]
            : b === '在籍' ? ['退職', '在籍'] : ['なし', 'あり'];
      lines.push(['変更', p.id, p.name, b, was, next].map(esc).join(','));
    }
  }
  for (const r of drop) lines.push([soft ? '退職' : '削除', r.id, r.name, '', r.email, ''].map(esc).join(','));
  fs.writeFileSync(report, `﻿${lines.join('\r\n')}\r\n`);
  console.log(`  内訳を書きました: ${report}`);

  if (!apply) {
    console.log('');
    console.log('  まだ何も書いていません。内訳を確認したうえで --apply を付けて実行してください。');
    console.log('');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [{ n: order }] } = await client.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS n FROM employees',
    );
    let next = Number(order);
    for (const p of add) {
      next += 1;
      await client.query(
        `INSERT INTO employees (id, name, email, gender, active, egg, sort_order)
         VALUES ($1, $2, $3, $4, TRUE, TRUE, $5)`,
        [p.id, p.name, p.email, p.gender, next],
      );
    }
    for (const p of change) {
      /* 名簿にあるのは氏名・メール・性別だけ。事業所や歩数の設定は画面で
         決めたものなので、ここでは触らない。 */
      await client.query(
        `UPDATE employees
            SET name = $2, email = $3,
                gender = COALESCE($4, gender),
                active = TRUE, egg = TRUE
          WHERE id = $1`,
        [p.id, p.name, p.email, p.gender],
      );
    }
    if (drop.length) {
      const ids = drop.map((r) => String(r.id));
      await client.query(
        soft
          ? 'UPDATE employees SET active = FALSE, egg = FALSE WHERE id = ANY($1::text[])'
          : 'DELETE FROM employees WHERE id = ANY($1::text[])',
        [ids],
      );
    }
    await client.query('COMMIT');
    console.log('');
    console.log(`  完了：追加 ${add.length}／変更 ${change.length}／`
      + `${soft ? '退職' : '削除'} ${drop.length}`);
    console.log('  反映するにはサーバを再起動してください: systemctl restart pedometer');
    console.log('');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('  失敗したので、何も変えずに戻しました:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
