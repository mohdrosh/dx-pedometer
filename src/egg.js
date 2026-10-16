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
  return okOffice && okRule ? { office, rule } : null;
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

  let answers = 0;
  for (const row of rows || []) {
    const v = cleanVote(row, offices);
    if (!v) continue;                       /* a row written before an office was renamed */
    answers += 1;
    byOffice.set(v.office, (byOffice.get(v.office) || 0) + 1);
    byRule.set(v.rule, (byRule.get(v.rule) || 0) + 1);
  }

  const offs = [...byOffice].map(([office, count]) => ({ office, count }));
  return {
    answers,
    /* 「今は不要」 is counted but is not a destination, so it is kept out of
       the ranking and handed back on its own. Sorting it among the offices
       would put it top in a company that mostly does not want eggs, which
       reads as an instruction to ship there. */
    offices: offs
      .filter((o) => o.office !== NOT_NOW)
      .sort((a, b) => b.count - a.count || offices.indexOf(a.office) - offices.indexOf(b.office)),
    notNow: offs.find((o) => o.office === NOT_NOW)?.count || 0,
    rules: EGG_RULES.map((r) => ({ ...r, count: byRule.get(r.id) || 0 })),
    /* 5.3:「最も票の多い方式を採用する」. A tie has no winner until somebody
       chooses one, so this says so rather than picking the first. */
    topRule: (() => {
      const best = Math.max(0, ...EGG_RULE_IDS.map((r) => byRule.get(r) || 0));
      const won = EGG_RULE_IDS.filter((r) => (byRule.get(r) || 0) === best);
      return best > 0 && won.length === 1 ? won[0] : null;
    })(),
  };
}
