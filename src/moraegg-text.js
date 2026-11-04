/* ============================================================================
   佐野's text dictionary, as a lookup.

   仕様書 6:「画面の文言は、文言辞書（moraegg_strings.json）の日本語をそのまま
   使う。日本語が正で、英語は日本語からの訳である」「日本語の文言を変える必要
   があるときは、変える前に佐野に相談する」.

   So the JSON is checked in unedited and read from here. Nothing in the
   components writes Japanese of its own — a string that is not in the
   dictionary is a string she has not seen, and the only honest thing to
   show for one is the key, which is visible enough in review to get
   noticed and added rather than quietly shipped.
   ========================================================================= */

import STRINGS from './moraegg-strings.json';

/**
 * One string, in the current language.
 *
 * `vars` fills the {n} / {a} / {b} parts: 「{n} などの部分には数字や名前が
 * 入る」. Missing keys come back as the key itself rather than as an empty
 * space, because an empty space on a screen is a bug nobody reports.
 */
export function mg(key, lang = 'ja', vars = null) {
  const row = STRINGS[key];
  if (!row) return key;
  let out = typeof row === 'object' ? (row[lang] ?? row.ja ?? key) : row;
  if (typeof out !== 'string') return out;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/** The eight offices, as 佐野 writes them, in her order. */
export function officeList(lang = 'ja') {
  const row = STRINGS.offices;
  const ja = row?.ja || {};
  const other = row?.[lang] || ja;
  return Object.keys(ja).map((id) => ({ id, name: ja[id], label: other[id] || ja[id] }));
}

/* 「英語の単数・複数（1 pack／2 packs）はプログラムで切り替える」 — the
   dictionary cannot carry both, so the one place it matters does it here. */
export function packs(n, lang = 'ja') {
  const v = Number(n) || 0;
  return lang === 'ja' ? `${v}パック` : `${v} pack${v === 1 ? '' : 's'}`;
}

export { STRINGS };
