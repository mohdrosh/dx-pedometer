/* ============================================================================
   モラエッグ 社内タマゴ配布ポータル — Phase 0：需要調査

   佐野:「全正社員に匿名アンケート。受取希望場所と割当ルールの希望を集計」

   Two questions, under a minute to answer, and the answers decide which
   offices the eggs are shipped to first. Everything here is the part that
   has to be right regardless of what the screen looks like: what may be
   answered, when it may be answered, and how the answers are counted.

   ---------------------------------------------------------------------------
   Anonymity is the whole design, so it is stated here rather than left to
   whoever reads the routes.

   佐野:「誰が何を選んだかは、管理者を含め誰にも表示しない」 and, in the same
   breath,「回答の変更：受付期間内であれば変更できる。変更のため内部では回答と
   社員を紐付けて保持するが、画面・集計・出力には出さない」.

   Those two pull against each other and the resolution is deliberate: the
   employee id is stored, because without it a person cannot change their
   mind and nothing stops them voting twice — but it never leaves the
   database. One row per person, keyed by employee id, is the only link;
   `tally` below takes rows and returns counts, so the shape of what the
   server can answer with is a count and nothing else. There is deliberately
   no function here that maps a person to an answer, and no route should
   ever be written that returns one. A reader of this file should find it
   obvious that adding one would be the bug.
   ========================================================================= */

/* 10.1 決定事項:「本社、東京、大阪、三田、姫路、京都、新長田、尼崎技術研修所」 */
export const EGG_OFFICES = [
  '本社', '東京', '大阪', '三田', '姫路', '京都', '新長田', '尼崎技術研修所',
];

/* 4.1 問1 の最後の選択肢。An office is where you would collect; this is the
   answer from somebody who would not. It is counted and reported like any
   other answer — knowing how many people do not want eggs is the point of
   asking — but it is never a shipping destination. */
export const NOT_NOW = '今は不要';

/* 5.3 割当ルール. The table is data because 佐野 expects to switch between
   them later from 設定 (「運用中に見直せるよう、管理者設定で方式を切り替え
   られるようにする」), and because the survey screen has to print the pros
   and cons beside each one — nobody can vote on 「前回落選者優先」 without
   being told what it means. */
export const EGG_RULES = [
  {
    id: 'fcfs',
    ja: '先着順',
    en: 'First come, first served',
    howJa: '申請が早い順に確定',
    howEn: 'Earliest requests are confirmed first',
    proJa: '分かりやすい、実装が簡単',
    proEn: 'Easy to understand and build',
    conJa: '同じ人ばかり当たりやすい',
    conEn: 'The same people tend to win',
  },
  {
    id: 'onEach',
    ja: '1人1パック優先',
    en: 'One pack each first',
    howJa: 'まず全員に1パック、余りを2パック目以降へ',
    howEn: 'Everyone gets one pack first; extras go to additional packs',
    proJa: '公平感が高い',
    proEn: 'Feels fair',
    conJa: '仕事用の複数申請が後回しになる',
    conEn: 'Multi-pack business requests come last',
  },
  {
    id: 'lottery',
    ja: '抽選',
    en: 'Lottery',
    howJa: '締切後にランダムで確定',
    howEn: 'Random draw after the deadline',
    proJa: '公平',
    proEn: 'Fair',
    conJa: '結果が締切後まで分からない',
    conEn: 'Results unknown until after the deadline',
  },
  {
    id: 'missedFirst',
    ja: '前回落選者優先',
    en: "Last week's misses first",
    howJa: '前週に落選した人を優先',
    howEn: 'Those not selected last week get priority',
    proJa: '不満が溜まりにくい',
    proEn: 'Less frustration builds up',
    conJa: 'ルールがやや複雑',
    conEn: 'Slightly more complex',
  },
];

export const EGG_RULE_IDS = EGG_RULES.map((r) => r.id);

/* 問3 サイト名の投票. 佐野:「『タマゴ配布』は少し地味なので、社員に決めて
   もらいましょう。いちばん票の多い名前をサイト名にします」 — and until the
   vote closes the site stays タマゴ配布, so the name only changes once,
   when it has been decided.

   Optional in the data, because answers given before this question
   existed are still perfectly good answers; the form asks for it. */
export const EGG_NAMES = [
  {
    id: 'moratama',
    ja: 'モラたま',
    en: 'Moratama',
    noteJa: 'モラブ＋たまご。短くて呼びやすい',
    noteEn: '"Morabu" + "tamago". Short and easy to say',
  },
  {
    id: 'moraeggbin',
    ja: 'モラエッグ便',
    en: 'Moraegg Bin',
    noteJa: 'キャラクターの名前で、毎週届く「便」',
    noteEn: "The character's name, plus 便 — the weekly delivery",
  },
  {
    id: 'tambatayori',
    ja: '丹波たまご便り',
    en: 'Tamba Tamago Tayori',
    noteJa: '卵のお届けと、料理写真の「便り」',
    noteEn: '便り is both a delivery and a letter — the eggs and the dish photos',
  },
];

export const EGG_NAME_IDS = EGG_NAMES.map((n) => n.id);

/* 5.2 申請の目的.「私用」と「仕事用」を分けて集計できるようにする — 佐野 wants
   the split because a week where most packs went to customers reads very
   differently from one where they went home with people, and the committee
   will be asked which it was. Ids rather than the Japanese words, so the
   label can be reworded without rewriting every stored row. */
export const EGG_PURPOSES = [
  { id: 'private', ja: '私用', en: 'Personal' },
  { id: 'work', ja: '仕事用', en: 'Business' },
];
export const EGG_PURPOSE_IDS = EGG_PURPOSES.map((p) => p.id);

/* 2パック以上を申請するときは理由を書いてもらう。1パックなら不要. */
export const REASON_MAX = 300;

/* ------------------------------- the terms ------------------------------- */

/* 6. 同意フロー. 佐野:「受け取り条件に同意した社員だけが申請できる」「管理者が
   文面を改定した場合は、全員に再度同意を求める」.

   That last sentence is why the version is a hash of the text rather than a
   number somebody remembers to bump. An administrator editing the terms in
   設定 changes the hash, every stored consent stops matching, and everybody
   is asked again — without anyone having had to think of it. */
export function hashText(str) {
  let h = 2166136261;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export const EGG_TERMS_JA = [
  '受け取りは指定の事務所でお願いします。移動の費用は各自のご負担となります。',
  '割れ・ヒビのあるタマゴについて、交換や返金のご対応はできません。',
  '生ものですので、受け取り後の保管・調理・飲食は自己責任でお願いします。',
  '発送週の金曜日までに受け取ってください。',
].join('\n');

export const EGG_TERMS_EN = [
  'Collect at your chosen office. Travel there is at your own expense.',
  'No replacement or refund for broken or cracked eggs.',
  'These are fresh food: storage, cooking and eating after collection are at your own risk.',
  'Collect by the Friday of the shipping week.',
].join('\n');

/** The terms as they stand, with the version a consent is recorded against. */
export function eggTerms(cfg) {
  const ja = String(cfg?.egg?.termsJa || '').trim() || EGG_TERMS_JA;
  const en = String(cfg?.egg?.termsEn || '').trim() || EGG_TERMS_EN;
  /* The Japanese text is the one that binds, so it alone sets the version —
     fixing a typo in the English should not put 171 people back through the
     consent screen. */
  return { ja, en, version: hashText(ja) };
}

/**
 * Has this person agreed to the terms as they read today?
 *
 * A consent recorded against text that has since been revised is not a
 * consent to the new text, so it reads as no and they are asked again.
 */
export function consentOk(row, cfg) {
  return !!row?.version && row.version === eggTerms(cfg).version;
}

/* ------------------------------- the answer ------------------------------ */

/**
 * The one answer this system accepts, or null.
 *
 * Nothing is coerced into something close enough: an office that is not on
 * the list and a rule that is not one of the four are both refused outright,
 * because a tally is only worth reading if every row in it was a real choice.
 * The office list is passed in rather than read from the constant above so
 * that 設定 can add one — 尼崎技術研修所 was added to the spec late, and the
 * next one should not need a deploy.
 */
export function cleanVote(v, offices = EGG_OFFICES) {
  const office = String(v?.office ?? '').trim();
  const rule = String(v?.rule ?? '').trim();
  const okOffice = office === NOT_NOW || offices.includes(office);
  const okRule = EGG_RULE_IDS.includes(rule);
  if (!okOffice || !okRule) return null;
  const name = String(v?.name ?? '').trim();
  const okName = EGG_NAME_IDS.includes(name);
  /* 佐野:「投票するときに、意見があれば一緒に書いてもらってください」. Optional,
     capped, and newlines collapsed so one person cannot push the rest of the
     list off the screen. Empty means no comment rather than an empty one. */
  const comment = String(v?.comment ?? '').replace(/\s+/g, ' ').trim().slice(0, COMMENT_MAX);
  return { office, rule, ...(okName ? { name } : {}), ...(comment ? { comment } : {}) };
}

export const COMMENT_MAX = 200;

/* ------------------------------ the request ------------------------------ */

/** Most people may ask for this many packs at once unless 設定 says otherwise. */
export const PACKS_MAX = 10;

export function eggMaxPacks(cfg) {
  const n = Number(cfg?.egg?.maxPacks);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : PACKS_MAX;
}

/**
 * 5.2 申請. The one shape a request may take, or an error code saying why not.
 *
 * Returns {ok:true, value} or {ok:false, error} rather than null, because
 * unlike a survey answer a request is something a person typed on purpose
 * and expects to be told about: 「2パック以上は理由を入力してください」 is a
 * sentence the screen has to be able to say, and it cannot say it from a
 * null. The error codes are what the server sends back; the wording lives
 * in the UI, in both languages.
 */
export function cleanRequest(v, offices = EGG_OFFICES, cfg = null) {
  const office = String(v?.office ?? '').trim();
  if (!offices.includes(office)) return { ok: false, error: 'office' };

  const packs = Math.floor(Number(v?.packs));
  if (!Number.isFinite(packs) || packs < 1) return { ok: false, error: 'packs' };
  if (packs > eggMaxPacks(cfg)) return { ok: false, error: 'tooMany' };

  const purpose = String(v?.purpose ?? '').trim();
  if (!EGG_PURPOSE_IDS.includes(purpose)) return { ok: false, error: 'purpose' };

  const reason = String(v?.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, REASON_MAX);
  /* 「2パック以上の場合は理由を必須とする」. One pack is the ordinary case and
     asking why would only be in the way. */
  if (packs >= 2 && !reason) return { ok: false, error: 'reason' };

  return { ok: true, value: { office, packs, purpose, ...(reason ? { reason } : {}) } };
}

/* ------------------------------ the totals ------------------------------- */

/**
 * 5.2:「申請の合計数は、目的別の内訳も含めて確認できる」.
 *
 * Unlike the survey this is not anonymous — a request has to be collected by
 * the person who made it, and the office contact needs a name to hand a pack
 * to. What this returns is still only counts, because the totals screen is
 * read by everyone and nobody needs a list of who asked for what to see
 * whether the week is oversubscribed.
 */
export function requestTotals(rows, offices = EGG_OFFICES) {
  const byOffice = new Map(offices.map((o) => [o, 0]));
  const byPurpose = new Map(EGG_PURPOSE_IDS.map((p) => [p, 0]));
  let packs = 0;
  let people = 0;
  for (const r of rows || []) {
    const want = Math.max(0, Math.floor(Number(r?.packs) || 0));
    if (!want) continue;
    people += 1;
    packs += want;
    if (byOffice.has(r.office)) byOffice.set(r.office, byOffice.get(r.office) + want);
    if (byPurpose.has(r.purpose)) byPurpose.set(r.purpose, byPurpose.get(r.purpose) + want);
  }
  return {
    people,
    packs,
    offices: [...byOffice].map(([office, count]) => ({ office, count })),
    purposes: EGG_PURPOSES.map((p) => ({ ...p, count: byPurpose.get(p.id) || 0 })),
  };
}

/* ------------------------------- the window ------------------------------ */

/* Plain YYYY-MM-DD strings, and compared as strings, for the same reason the
   提出期間 does it: the browser reads the laptop's clock and the server reads
   Tokyo's, and a Date would let the two disagree about which day it is.
   Dates in this format sort correctly with < and >. */

/** The survey's open and close days, inclusive, or null when unset. */
export function eggWindow(cfg) {
  const from = String(cfg?.egg?.from || '');
  const to = String(cfg?.egg?.to || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
    ? { from, to }
    : null;
}

/**
 * Is the survey accepting answers on `todayIso`?
 *
 * An unset window is closed, not open. The survey is the thing that decides
 * where a van of eggs drives every Monday, so it opening itself because
 * nobody filled in a date is the wrong way round.
 */
export function eggOpen(cfg, todayIso) {
  const w = eggWindow(cfg);
  return !!w && String(todayIso) >= w.from && String(todayIso) <= w.to;
}

/** The offices 設定 has configured, falling back to the spec's list. */
export function eggOffices(cfg) {
  const list = cfg?.egg?.offices;
  return Array.isArray(list) && list.length ? list.filter(Boolean).map(String) : EGG_OFFICES;
}

/* ------------------------------- the count ------------------------------- */

/**
 * Counts, and only counts.
 *
 * Takes the stored rows — which do carry an employee id, because the table
 * needs one — and returns how many chose each office and each rule. The
 * employee id is read nowhere in here and appears nowhere in what comes
 * back; that is the point, and it is why the screens and the server both go
 * through this function rather than looking at rows themselves.
 *
 * Every office is present in the result even with nobody on it, so the chart
 * shows an empty bar rather than the office silently vanishing — 「希望人数
 * の多い事務所を最初の配布先とする」 is a decision somebody makes by looking
 * at all of them, including the ones nobody picked.
 */
export function tally(rows, offices = EGG_OFFICES) {
  const byOffice = new Map([...offices, NOT_NOW].map((o) => [o, 0]));
  const byRule = new Map(EGG_RULE_IDS.map((r) => [r, 0]));
  const byName = new Map(EGG_NAME_IDS.map((n) => [n, 0]));

  let answers = 0;
  const comments = [];
  for (const row of rows || []) {
    const v = cleanVote(row, offices);
    if (!v) continue;                       /* a row written before an office was renamed */
    answers += 1;
    byOffice.set(v.office, (byOffice.get(v.office) || 0) + 1);
    byRule.set(v.rule, (byRule.get(v.rule) || 0) + 1);
    if (v.name) byName.set(v.name, (byName.get(v.name) || 0) + 1);
    /* The comment travels with no office and no rule beside it. Published
       together they would narrow a comment down to whoever picked that
       pair, which on a list of eight offices is often one person. */
    if (v.comment) comments.push(v.comment);
  }

  const offs = [...byOffice].map(([office, count]) => ({ office, count }));
  return {
    answers,
    comments,
    /* 「今は不要」 is counted but is not a destination, so it is kept out of
       the ranking and handed back on its own. Sorting it among the offices
       would put it top in a company that mostly does not want eggs, which
       reads as an instruction to ship there. */
    offices: offs
      .filter((o) => o.office !== NOT_NOW)
      .sort((a, b) => b.count - a.count || offices.indexOf(a.office) - offices.indexOf(b.office)),
    notNow: offs.find((o) => o.office === NOT_NOW)?.count || 0,
    rules: EGG_RULES.map((r) => ({ ...r, count: byRule.get(r.id) || 0 })),
    names: EGG_NAMES.map((n) => ({ ...n, count: byName.get(n.id) || 0 })),
    /* The one that becomes the site's name. A tie decides nothing, the
       same as the allocation rule — somebody has to pick. */
    topName: (() => {
      const best = Math.max(0, ...EGG_NAME_IDS.map((n) => byName.get(n) || 0));
      const won = EGG_NAME_IDS.filter((n) => (byName.get(n) || 0) === best);
      return best > 0 && won.length === 1 ? won[0] : null;
    })(),
    /* 5.3:「最も票の多い方式を採用する」. A tie has no winner until somebody
       chooses one, so this says so rather than picking the first. */
    topRule: (() => {
      const best = Math.max(0, ...EGG_RULE_IDS.map((r) => byRule.get(r) || 0));
      const won = EGG_RULE_IDS.filter((r) => (byRule.get(r) || 0) === best);
      return best > 0 && won.length === 1 ? won[0] : null;
    })(),
  };
}
