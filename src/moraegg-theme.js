/* ============================================================================
   モラエッグ — the look

   佐野:「もっと遊び心を。デザイン案を参考に、思い切って楽しくしてください。」
   And this is a page about asking for eggs, so it should feel like one.

   The palette is not invented: it is sampled from her own artwork, which is
   where the page gets its illustrations from, so the pictures and the page
   are the same object rather than drawings pasted onto a grey form.

     cream  #FEF6DF   the ground
     royal  #2152B8   Moraegg's body, and the working colour
     navy   #0B296A   every border, every piece of text
     sun    #FFC62F   highlights, selected things, celebration
     leaf   #15860A   enough eggs

   Two rules the cheerfulness does not get to break:

   1. Yellow is a background, never a mark. #FFC62F on cream is 1.46:1 —
      invisible. Navy on yellow is 8.68:1, so yellow is something you put
      text *on*. Every bar and every line here is royal, leaf or navy, all
      of which clear 4.3:1 on both surfaces.
   2. Nothing is said in colour alone. The chart changes colour as the eggs
      come in, as she asked — and the mascot changes expression and a
      sentence says the same thing in words.

   Scoped to .mg, which is only ever on the モラエッグ page. The rest of the
   app keeps the quiet grey-green it has always had.
   ========================================================================= */

export const MG_CSS = `
.mg{
  --mg-cream:#FEF6DF; --mg-royal:#2152B8; --mg-navy:#0B296A;
  --mg-sun:#FFC62F; --mg-leaf:#15860A; --mg-paper:#fff;
  --mg-dot:#F2E6C4; --mg-sky:#EAF0FB;
  --mg-round:14px;
  /* The sticker shadow: a hard offset in the border colour, no blur. It is
     what makes a card look stuck on rather than floating. */
  --mg-pop:0 3px 0 rgba(11,41,106,.16);
  font-family:"Zen Maru Gothic","Noto Sans JP","Hiragino Maru Gothic ProN",
    "Inter",system-ui,sans-serif;
}

/* The dotted ground, straight off her artwork. Fixed, so it does not slide
   under the cards as the page scrolls. */
.mg-page{
  min-height:100vh;
  background:
    radial-gradient(var(--mg-dot) 1.6px, transparent 1.7px) 0 0/19px 19px,
    var(--mg-cream);
  background-attachment:fixed;
  color:var(--mg-navy);
  padding-bottom:40px;
}

/* ------------------------------ the header ------------------------------
   A quiet bar. The first version shouted: a 4px yellow rule under it and
   every control a thick outlined pill, which is a lot of border for three
   words and two links. Same colours, a third of the weight.
------------------------------------------------------------------------ */
.mg-hdr{
  display:flex;align-items:center;gap:14px;
  padding:0 18px;height:54px;background:var(--mg-navy);
  box-shadow:inset 0 -1px 0 rgba(255,198,47,.5);
}
.mg-back i{font-style:normal;line-height:1}
.mg-back{
  display:inline-flex;align-items:center;gap:6px;
  padding:5px 2px;border:0;background:none;color:rgba(255,255,255,.72);
  font:inherit;font-size:12.5px;font-weight:700;white-space:nowrap;
}
.mg-back:hover{color:var(--mg-sun)}
.mg-brand{display:flex;align-items:center;gap:9px;margin:0 auto;
  padding-left:14px;border-left:1px solid rgba(255,255,255,.16)}
.mg-seal{width:30px;height:30px;flex:none;border-radius:999px}
.mg-brand h1{margin:0;font-size:16.5px;font-weight:900;color:#fff;letter-spacing:.01em}
.mg-brand p{display:none}
.mg-hdr-r{display:flex;gap:4px}
.mg-mini{
  padding:5px 10px;border:0;border-radius:7px;
  background:rgba(255,255,255,.09);color:rgba(255,255,255,.82);
  font:inherit;font-size:11.5px;font-weight:700;
}
.mg-mini:hover{background:rgba(255,255,255,.2);color:#fff}

/* On a phone the bar holds four things across 390px, and the name is the
   one that must not break: 「モラエッグ」 wrapping to two lines is what
   made the bar look broken. The way back keeps its arrow and loses its
   words — the arrow is the affordance, the words were the width. */
@media(max-width:620px){
  .mg-hdr{height:48px;padding:0 10px;gap:8px}
  .mg-back span{display:none}
  .mg-back{gap:0;padding:5px 4px}
  .mg-back i{font-size:17px}
  .mg-brand{padding-left:8px;gap:7px;min-width:0}
  .mg-brand h1{font-size:15px;white-space:nowrap}
  .mg-seal{width:26px;height:26px}
  .mg-mini{padding:5px 8px;font-size:11px}
}

/* ------------------------------- the tabs ------------------------------- */
.mg .eg-sub{
  display:flex;gap:8px;padding:12px 16px 0;background:none;border:0;
  overflow-x:auto;scrollbar-width:none;
}
.mg .eg-sub::-webkit-scrollbar{display:none}
.mg .eg-sub button{
  padding:6px 14px 7px;border:2.5px solid var(--mg-navy);border-radius:999px;
  background:var(--mg-paper);color:var(--mg-navy);
  font:inherit;font-size:12.5px;font-weight:700;white-space:nowrap;
  box-shadow:var(--mg-pop);
}
.mg .eg-sub button:hover{background:var(--mg-sky)}
.mg .eg-sub button.on{background:var(--mg-sun);box-shadow:0 3px 0 var(--mg-navy)}

.mg-body{padding:12px 14px 0;max-width:1240px}

/* ------------------------------- the cards ------------------------------ */
/* One shape for everything: white, a thick navy outline, a hard shadow. */
.mg .card{
  background:var(--mg-paper);
  border:2.5px solid var(--mg-navy);border-radius:var(--mg-round);
  box-shadow:var(--mg-pop);
  padding:12px 13px;margin-bottom:11px;
}
.mg .card.soft{background:var(--mg-sky)}

/* A heading is a label stuck to the top of what it names, not a grey bar. */
.mg .sechead{
  display:flex;align-items:baseline;gap:10px;justify-content:space-between;
  background:none;border:0;padding:0;margin:14px 0 7px;
}
.mg .sechead:first-child{margin-top:2px}
.mg .sechead>span:first-child{
  font-size:13.5px;font-weight:900;color:var(--mg-navy);
  /* the yellow marker-pen underline */
  background:linear-gradient(transparent 62%,var(--mg-sun) 62%,var(--mg-sun) 94%,transparent 94%);
  padding:0 3px;
}
.mg .sechead>span+span{font-size:11.5px;font-weight:700;color:var(--mg-royal)}

/* ------------------------------ the buttons ----------------------------- */
.mg .btn{
  padding:7px 15px 8px;border:2.5px solid var(--mg-navy);border-radius:999px;
  background:var(--mg-paper);color:var(--mg-navy);
  font:inherit;font-size:13px;font-weight:700;
  box-shadow:0 2px 0 var(--mg-navy);transition:transform .07s,box-shadow .07s;
}
.mg .btn:hover{background:var(--mg-sky);border-color:var(--mg-navy)}
/* Pressed buttons go down and the shadow goes with them. */
.mg .btn:active{transform:translateY(2px);box-shadow:0 0 0 var(--mg-navy)}
.mg .btn.primary{background:var(--mg-royal);color:#fff}
.mg .btn.primary:hover{background:#1A449E}
.mg .btn.ghost{background:var(--mg-paper)}
.mg .btn.big{width:auto;padding:10px 24px 11px;font-size:14.5px;font-weight:900}
.mg .btn.sm{padding:4px 11px 5px;font-size:11.5px;box-shadow:0 2px 0 var(--mg-navy)}
.mg .btn.sm:active{transform:translateY(2px)}
.mg .btn:disabled{
  background:#E7E9EE;color:#9AA3B2;border-color:#C3C9D4;
  box-shadow:0 2px 0 #C3C9D4;cursor:not-allowed;transform:none;
}
.mg .btn.danger{color:#B3261E;border-color:#B3261E;box-shadow:0 3px 0 #B3261E}

/* ------------------------------- the fields ----------------------------- */
.mg .fld{margin-bottom:13px}
.mg .fld>span{font-size:12.5px;font-weight:700;color:var(--mg-navy);margin-bottom:5px}
.app.mg .fld input,.app.mg .fld select,.app.mg .fld textarea,
.app.mg .eg-offs-add input,.app.mg .eg-offs-a,.app.mg .eg-offs select{
  border:2px solid var(--mg-navy);border-radius:10px;background:#FFFDF6;
  padding:7px 11px;font:inherit;font-size:13.5px;color:var(--mg-navy);outline:none;
}
.app.mg .fld input:focus,.app.mg .fld select:focus,.app.mg .fld textarea:focus{
  border-color:var(--mg-royal);background:#fff;
  box-shadow:0 0 0 3px rgba(33,82,184,.18);
}
.app.mg .fld textarea{width:100%;line-height:1.65;resize:vertical}
.mg .muted{color:#5B6B86}
.mg .sm{font-size:12.5px;line-height:1.75}

/* A checkbox, drawn by the browser.

   This has been broken twice in this codebase by a rule that set
   appearance:none on every input inside a wrapper: the box kept its
   checked property, every test still passed, and it could not draw a tick.
   So the native drawing is asserted here rather than assumed, and
   accent-color makes it ours without taking the painting away. */
.app.mg input[type=checkbox]{
  -webkit-appearance:checkbox;appearance:auto;
  width:auto;height:auto;padding:0;border:0;background:none;border-radius:0;
  accent-color:var(--mg-royal);
}
.mg .check{display:flex;align-items:center;gap:8px;font-size:13.5px;
  font-weight:700;color:var(--mg-navy);cursor:pointer}
.mg .mg-tick{
  background:var(--mg-sky);border:2px solid var(--mg-royal);border-radius:12px;
  padding:10px 13px;margin:0 0 11px;
}
.mg .eg-exp{
  font-style:normal;font-size:10.5px;font-weight:900;margin-left:7px;
  color:var(--mg-navy);background:var(--mg-sun);
  border:1.5px solid var(--mg-navy);border-radius:999px;padding:1px 7px 2px;
}

/* ------------------------------- the chips ------------------------------ */
/* Selected is yellow with a tick, so it is never colour on its own. */
.mg .eg-opts{display:flex;flex-wrap:wrap;gap:8px}
.mg .eg-opt{
  display:inline-flex;align-items:center;gap:5px;
  padding:6px 13px 7px;border:2.5px solid var(--mg-navy);border-radius:999px;
  background:var(--mg-paper);color:var(--mg-navy);
  font:inherit;font-size:13px;font-weight:700;box-shadow:0 2px 0 var(--mg-navy);
}
.mg .eg-opt:hover{background:var(--mg-sky)}
.mg .eg-opt.on{background:var(--mg-sun)}
.mg .eg-opt.on::before{content:"✓";font-weight:900;font-size:13px}
.mg .eg-opt.none{color:#5B6B86;border-color:#8C96A8;box-shadow:0 2px 0 #8C96A8}
.mg .eg-opt.none.on{background:#E7E9EE;color:var(--mg-navy)}
.mg .eg-opt small{display:block;font-size:10.5px;font-weight:500;opacity:.8}

/* --------------------------- the choice cards --------------------------- */
.mg .eg-rules{display:grid;gap:10px}
.mg .eg-rule{
  display:grid;gap:2px;text-align:left;padding:12px 14px;
  border:2.5px solid var(--mg-navy);border-radius:14px;
  background:var(--mg-paper);box-shadow:0 2px 0 var(--mg-navy);
}
.mg .eg-rule:hover{background:var(--mg-sky)}
.mg .eg-rule.on{background:var(--mg-sun);box-shadow:0 2px 0 var(--mg-navy)}
.mg .eg-rule strong{font-size:13.5px;font-weight:900;color:var(--mg-navy)}
.mg .eg-rule span{font-size:12.5px;font-weight:500;color:#3E4F6E}
.mg .eg-rule em{font-style:normal;font-size:11.5px;font-weight:700}
.mg .eg-rule em.pro{color:var(--mg-leaf)}
.mg .eg-rule.on em.pro{color:#0C5E06}
.mg .eg-rule em.con{color:#7A6418}
.mg .eg-rule.on em.con{color:#6B4E00}

/* -------------------------------- notices ------------------------------- */
.mg .eg-anon{
  font-size:12.5px;font-weight:500;color:var(--mg-navy);
  background:var(--mg-sky);border:2px dashed var(--mg-royal);
  border-radius:12px;padding:9px 13px;margin:0 0 14px;
}
.mg .eg-q{font-size:13.5px;font-weight:900;color:var(--mg-navy);margin:0 0 9px}
.mg .pill{
  border-radius:999px;font-size:11.5px;font-weight:900;padding:3px 11px 4px;
  border:2px solid var(--mg-navy);background:var(--mg-paper);color:var(--mg-navy);
}
.mg .pill.ok{background:var(--mg-leaf);border-color:var(--mg-leaf);color:#fff}
.mg .pill.warn{background:var(--mg-sun);border-color:var(--mg-navy);color:var(--mg-navy)}
.mg .eg-warn{color:#B3261E;font-weight:700}

/* ------------------------------ the pictures ---------------------------- */
/* Shown whole, never cropped: each one carries its own words and its own
   background, and a crop would cut the speech bubble off. */
.mg-pic{display:block;width:100%;height:auto;border-radius:14px;
  border:2.5px solid var(--mg-navy);box-shadow:var(--mg-pop)}
/* Capped by HEIGHT, not width: the artwork comes square (1400×1400) and
   wide (1600×977), and a width cap that suits one makes the other own the
   screen. Never cropped — the speech bubble is part of the picture. */
.mg-strip{margin-bottom:14px;max-height:270px;width:auto;max-width:100%}
/* Two full-width pictures stacked on a phone is half a screen of scrolling
   for decoration. The one at the top goes; the 鶏舎だより below stays,
   because it is the one carrying news. */
@media(max-width:899px){.mg-strip.mg-opt{display:none}}

/* ------------------------------ the verdict ----------------------------- */
/* 佐野:「最低パック数を超えたら『今週はこの事務所にタマゴが届きます！』、
   届かなかったら残念賞のメッセージ」 */
.mg-verdict{
  display:flex;align-items:center;gap:14px;
  border:3px solid var(--mg-navy);border-radius:var(--mg-round);
  padding:13px 16px;margin-bottom:14px;box-shadow:var(--mg-pop);
}
.mg-verdict img{width:66px;height:66px;flex:none}
.mg-verdict b{display:block;font-size:17px;font-weight:900;line-height:1.35}
.mg-verdict p{margin:3px 0 0;font-size:12.5px;font-weight:500;color:#3E4F6E}
.mg-verdict.go{background:#E7F5E5;border-color:var(--mg-leaf)}
.mg-verdict.go b{color:#0C5E06}
.mg-verdict.wait{background:#FFF6DF}
.mg-verdict.miss{background:var(--mg-sky)}

/* ------------------------------- the race ------------------------------- */
.mg .eg-race-top{display:flex;align-items:center;gap:14px;margin-bottom:14px}
.mg .eg-race-top img{width:72px;height:72px;flex:none}
.mg .eg-race-n{font-size:34px;font-weight:900;line-height:1;color:var(--mg-navy)}
.mg .eg-race-u{font-size:14px;font-weight:700;color:#5B6B86;margin-left:7px}
.mg .eg-race-s{font-size:13.5px;font-weight:900;margin:5px 0 0;color:var(--mg-royal)}
.mg .eg-race-s.win{color:var(--mg-leaf)}

/* One plot area with one outline. Boxing each day separately turned a
   seven-day week into seven empty containers, and the day that actually
   had eggs in it read as the odd one out. */
.mg .eg-race-ch{
  position:relative;display:grid;grid-template-columns:repeat(7,1fr);
  gap:6px;height:132px;padding:7px 7px 26px;
  background:#FFFDF6;border:2.5px solid var(--mg-navy);border-radius:14px;
}
.mg .eg-race-col{display:flex;flex-direction:column;justify-content:flex-end;position:relative}
.mg .eg-race-track{position:relative;flex:1;border-radius:7px;overflow:hidden}
/* The fill is royal while the eggs are still coming and leaf once there are
   enough — a state, not a series, which is why the sentence above it and
   Moraegg's face say the same thing. The 2px white gap keeps one day's
   eggs from merging into the next. */
.mg .eg-race-seg{
  position:absolute;left:0;right:0;background:var(--mg-royal);
  border-top:2px solid #FFFDF6;border-radius:5px 5px 0 0;
  transition:height .45s cubic-bezier(.34,1.3,.64,1);
}
.mg .eg-race.win .eg-race-seg{background:var(--mg-leaf)}
.mg .eg-race-col em{
  position:absolute;bottom:-22px;left:0;right:0;text-align:center;
  font-style:normal;font-size:11.5px;font-weight:700;color:#5B6B86;
}
.mg .eg-race-col.today em{color:var(--mg-navy);font-weight:900}
.mg .eg-race-line{
  position:absolute;left:7px;right:7px;height:0;
  border-top:3px dashed var(--mg-navy);pointer-events:none;
}
.mg .eg-race-line b{
  position:absolute;right:0;top:-12px;font-size:11px;font-weight:900;
  color:var(--mg-navy);background:var(--mg-sun);
  border:2px solid var(--mg-navy);border-radius:999px;padding:1px 9px 2px;
}
@media(prefers-reduced-motion:reduce){.mg .eg-race-seg{transition:none}}

/* ------------------------------- the lists ------------------------------ */
.mg .eg-hist li,.mg .eg-days li,.mg .eg-mini li,.mg .eg-hand li,.mg .eg-offs li{
  border-top:2px dotted #D9CFB0;font-weight:700;color:var(--mg-navy);
}
.mg .eg-hist li:first-child,.mg .eg-days li:first-child,
.mg .eg-mini li:first-child,.mg .eg-hand li:first-child,
.mg .eg-offs li:first-child{border-top:0}
.mg .eg-mini li,.mg .eg-hist li,.mg .eg-days li{font-size:13px;padding:6px 0}
.mg .eg-days li.on{color:var(--mg-royal)}
.mg .eg-hand li.done .eg-hand-n{color:#8C96A8}
.mg .eg-notes li{
  background:var(--mg-sky);border:2px solid var(--mg-royal);border-radius:12px;
  padding:9px 13px;margin-bottom:8px;font-size:13px;font-weight:500;
  color:var(--mg-navy);list-style:none;
}

/* ------------------------------- the bars ------------------------------- */
.mg .eg-ch{font-size:13px;font-weight:900;color:var(--mg-navy);margin:0 0 9px}
/* A label, a track and the count. The row IS the grid — without it the list
   falls back to bullets and every bar collapses to nothing, which is
   exactly what happened when this stylesheet was rewritten. */
.mg .eg-bars{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.mg .eg-bars li{display:grid;grid-template-columns:7.2em minmax(0,1fr) 2.2em;
  align-items:center;gap:10px}
.mg .eg-bl{font-size:12.5px;font-weight:700;color:#3E4F6E;text-align:right;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mg .eg-bt{display:block;height:20px;background:#FFFDF6;
  border:2px solid var(--mg-navy);border-radius:7px;overflow:hidden}
.mg .eg-bt i{display:block;height:100%;background:var(--mg-royal);
  border-radius:0 4px 4px 0;transition:width .4s cubic-bezier(.34,1.3,.64,1)}
.mg .eg-bars li.lead .eg-bt i{background:var(--mg-leaf)}
.mg .eg-bn{font-size:14px;font-weight:900;color:var(--mg-navy);
  font-variant-numeric:tabular-nums}
@media(prefers-reduced-motion:reduce){.mg .eg-bt i{transition:none}}
.mg .eg-nn{font-size:12.5px;font-weight:700;color:#3E4F6E;margin:7px 0 0}
.mg .eg-nn b{color:var(--mg-navy)}

/* --------------------------- the big tap target ------------------------- */
/* 丹波: pressed with a thumb, often one-handed, often holding eggs. */
.mg .eg-tap{
  min-height:50px;padding:0 26px;font-size:17px;font-weight:900;
  background:var(--mg-sun);color:var(--mg-navy);border-color:var(--mg-navy);
}
.mg .eg-tap:hover{background:#FFD45E}
.mg .eg-farm-now b{font-size:38px;font-weight:900;color:var(--mg-navy)}
.mg .eg-farm-now em{font-size:12.5px;font-weight:700;color:#5B6B86}
.mg .eg-farm-now span{font-size:13px;font-weight:700;color:#3E4F6E}

/* -------------------------------- sundry -------------------------------- */
.mg .eg-wk{display:flex;flex-wrap:wrap;gap:6px 24px;background:var(--mg-sky)}
.mg .eg-wk em{font-size:11.5px;font-weight:700;color:#3E4F6E}
.mg .eg-wk b{font-size:14.5px;font-weight:900;color:var(--mg-navy)}
.mg .eg-terms li{font-size:13px;font-weight:500;color:#3E4F6E;line-height:1.6}
.mg .eg-step b{font-size:22px;font-weight:900;color:var(--mg-navy);min-width:1.5em;
  text-align:center}
.mg .eg-step .btn{width:42px;height:42px;padding:0;font-size:20px;line-height:1}
.mg .eg-mystat-v b,.mg .eg-mine-v b{font-size:16px;font-weight:900}
.mg .eg-mine-v i,.mg .eg-mystat-v i{color:#A9B4C6}
.mg .eg-none{display:flex;align-items:center;gap:13px}
.mg .eg-none img{width:58px;height:58px;flex:none}
.mg .eg-none p{margin:0;font-weight:700}
.mg .eg-where b{font-size:15px;font-weight:900}
.mg .eg-where-by{color:var(--mg-royal) !important;font-weight:900}
/* Tilted like something stuck on by hand, but in the row's flow so it can
   never land on the heading above or the button beside it. */
.mg .eg-stamp{width:50px;height:auto;flex:none;transform:rotate(-8deg);
  margin:-2px 2px -2px -2px}


/* print-ready artwork the 丹波 staff can stick on a carton */
.mg-print{display:grid;gap:11px}
.mg-print a span{min-width:0}
.mg-print a{
  display:flex;align-items:center;gap:11px;text-decoration:none;
  border:2.5px solid var(--mg-navy);border-radius:14px;padding:9px 13px;
  background:var(--mg-paper);box-shadow:0 2px 0 var(--mg-navy);color:var(--mg-navy);
}
.mg-print a:hover{background:var(--mg-sky)}
.mg-print img{width:74px;height:auto;border-radius:7px;flex:none}
.mg-print b{font-size:13.5px;font-weight:900;display:block}
.mg-print span{font-size:11.5px;font-weight:500;color:#5B6B86}

@media(min-width:900px){
  .mg-body{margin:0 auto;padding:16px 22px 0}
  .mg .eg-sub{padding:14px 22px 0;max-width:1240px;margin:0 auto}
  .mg .eg-rules.eg-r4{grid-template-columns:repeat(4,minmax(0,1fr))}
  .mg .eg-race-ch{height:152px}
}

/* ========================= layout ========================================
   The arrangement, kept apart from the look. Phones get one column of
   everything; from 900px up each screen is the two-pane shape the rest of
   the app settled on — what you do on the left, how the week is going on
   the right, and no scrolling between them.
------------------------------------------------------------------------- */

/* 配布 */
.mg .eg-p2{display:grid}
.mg .eg-p2-r{order:-1}           /* the chart first on a phone: it is the answer */
.mg .eg-row2{display:grid;gap:13px}
.mg .eg-acts{display:flex;gap:9px;flex-wrap:wrap;margin-top:13px}
.mg .eg-req .fld{margin-top:12px}
.mg .eg-step{display:flex;align-items:center;gap:11px}
.mg .eg-wk{padding:12px 15px}
.mg .eg-wk div{display:flex;align-items:baseline;gap:7px}
.mg .eg-mystat,.mg .eg-mine{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.mg .eg-mystat-v,.mg .eg-mine-v{display:flex;align-items:baseline;gap:9px;margin-right:auto}
.mg .eg-mystat p{flex:1 1 100%;margin:0}
.mg .eg-mine-note{flex:1 1 100%;margin:7px 0 0;font-size:13px;font-weight:500}
.mg .eg-hist,.mg .eg-days,.mg .eg-mini,.mg .eg-hand,.mg .eg-offs,
.mg .eg-notes,.mg .mg-print{list-style:none;margin:0;padding:0}
.mg .eg-hist li{display:grid;grid-template-columns:5.6em minmax(0,1fr) 4.2em 6.6em;
  align-items:center;gap:9px}
.mg .eg-hist em{font-style:normal;text-align:right;color:#5B6B86}
.mg .eg-mini li,.mg .eg-days li{display:flex;justify-content:space-between;gap:11px}
.mg .eg-where{display:grid;gap:3px}
.mg .eg-shut{display:flex;align-items:center;gap:13px}
.mg .eg-shut img{width:66px;height:66px;flex:none}
.mg .eg-shut p{margin:0}

/* 需要調査 */
.mg .eg-sv-form .eg-fq{margin-bottom:15px}
.mg .eg-sv-form .eg-fq:last-child{margin-bottom:0}
.mg .eg-fq-row{display:grid;gap:15px}
.mg .eg-send{display:flex;flex-direction:column;align-items:flex-start}
.mg .eg-send .fld{width:100%}
.mg .eg-note-why{margin:-6px 0 0}
.mg .eg-sv-go{display:flex;align-items:center;gap:15px;flex-wrap:wrap;
  padding-top:14px;margin-top:4px;border-top:2px dotted #D9CFB0}
.mg .eg-sv-go p{margin:0;order:2}
.mg .eg-win{display:block;font-size:12.5px;font-weight:900;color:var(--mg-royal);margin-top:5px}
.mg .mg-win{display:flex;align-items:center;gap:15px}
.mg .mg-win-pic{width:96px;height:96px;flex:none;border-radius:12px;
  border:2.5px solid var(--mg-navy)}
.mg .mg-win b{font-size:16px;font-weight:900;display:block}
.mg .mg-win p{margin:2px 0 0}
.mg .eg-two{display:grid;gap:6px}

/* 丹波 */
.mg .eg-farm{display:grid}
.mg .eg-farm-c{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.mg .eg-farm-now{display:flex;align-items:baseline;gap:8px;margin-right:auto}
.mg .eg-farm-c>p{flex:1 1 100%;margin:0}

/* 事務所 */
.mg .eg-off{display:grid}
.mg .eg-off-bar{display:flex;align-items:center;gap:13px;flex-wrap:wrap}
.mg .eg-off-bar>span{margin-left:auto;font-size:12.5px;font-weight:700}
.mg .eg-arr{display:flex;align-items:center;gap:13px}
.mg .eg-arr-n{margin-left:auto;font-size:17px;font-weight:900}
.mg .eg-hand li{display:grid;grid-template-columns:minmax(0,1fr) 5.2em auto;
  align-items:center;gap:11px;padding:7px 0}
.mg .eg-hand-n{font-size:14px;font-weight:700}
.mg .eg-hand b{font-size:12.5px;font-weight:700;color:#3E4F6E}

/* 管理 */
.mg .eg-adm{display:grid}
.mg .eg-offs li{display:grid;
  grid-template-columns:6.4em minmax(0,1fr) 9.5em 4.6em auto auto;
  align-items:center;gap:8px;padding:7px 0}
.mg .eg-offs li>b{font-size:14px;font-weight:900}
.mg .eg-offs-on{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700}
.app.mg .eg-offs-m{text-align:center}
.mg .eg-offs-add{display:grid;grid-template-columns:6.4em minmax(0,1fr) auto;gap:9px;
  margin-top:11px;padding-top:11px;border-top:2px dotted #D9CFB0}
.mg .eg-draw{display:flex;align-items:center;gap:13px;flex-wrap:wrap}
.mg .eg-draw-r{margin:0;font-size:12.5px;font-weight:700}
.mg .eg-draw>p.muted{flex:1 1 100%;margin:0}
.mg .ad-set,.mg .eg-admin{display:grid;gap:4px}
.mg .eg-admin{align-items:end}

@media(min-width:900px){
  .mg .eg-p2{grid-template-columns:minmax(0,1fr) minmax(0,430px);
    align-items:start;column-gap:22px}
  .mg .eg-p2-r{order:0}
  .mg .eg-row2{grid-template-columns:auto minmax(0,1fr);gap:24px}
  .mg .eg-fq-row{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);
    column-gap:24px;align-items:start}
  .mg .eg-two{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:26px;
    align-items:start}
  .mg .eg-two .eg-bars li{grid-template-columns:7.2em minmax(0,1fr) 2em}
  .mg .eg-off{grid-template-columns:minmax(0,340px) minmax(0,1fr);
    align-items:start;column-gap:22px}
  .mg .eg-adm{grid-template-columns:minmax(0,1fr) minmax(0,430px);
    align-items:start;column-gap:22px}
  /* 丹波: the picture and the one button on the left, the week's tally and
     the printables on the right. One column ran to a screen and a half for
     what is really two short jobs. */
  .mg .eg-farm{grid-template-columns:minmax(0,1fr) minmax(0,430px);
    align-items:start;column-gap:22px}
  .mg .ad-set,.mg .eg-admin{grid-template-columns:1fr 1fr;gap:4px 14px}
  .mg .ad-set .fld:last-child{grid-column:span 2}
  .mg .eg-admin>p{grid-column:span 2;margin:0}
}

/* ======================= 料理写真のタイムライン ==========================
   Instagram-ish, in her colours. The banner is composed here rather than
   baked into an image: the title stays bilingual and sharp at any size,
   and the photograph underneath stays a file somebody can swap.
------------------------------------------------------------------------- */
.mg-dish{display:grid}

/* ------------------------------- the front ------------------------------
   Photographs pinned up, the egg beneath them, the name on a banner —
   the arrangement he drew. Hay Day's pictures are a white edge, a soft
   shadow and a few degrees of tilt, and that is most of why their pages
   feel hand-made rather than laid out; the same three things here.
------------------------------------------------------------------------ */
.mg-hero{display:grid;justify-items:center;margin:4px auto 20px;width:100%;max-width:820px}
.mg-hero-pics{display:grid;grid-template-columns:repeat(3,1fr);
  gap:4px;width:100%;align-items:start}
.mg-hero-pics figure{
  margin:0;background:#fff;padding:5px 5px 0;border-radius:3px;
  box-shadow:0 3px 9px rgba(11,41,106,.22);
  transform:rotate(var(--tilt));
  transition:transform .25s cubic-bezier(.34,1.3,.64,1);
}
.mg-hero-pics figure:hover{transform:rotate(0deg) translateY(-4px) scale(1.03);z-index:2}
.mg-hero-pics img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;
  border-radius:2px}
.mg-hero-pics figcaption{
  font-size:10.5px;font-weight:900;color:var(--mg-navy);
  text-align:center;padding:4px 2px 5px;
}

/* The egg sits under the photographs and breathes. */
.mg-hero-egg{width:74px;height:74px;margin:-14px 0 -6px;position:relative;z-index:3;
  animation:mg-bob 3.4s ease-in-out infinite}
@keyframes mg-bob{
  0%,100%{transform:translateY(0) rotate(-2deg)}
  50%{transform:translateY(-7px) rotate(2deg)}
}

/* A ribbon, with the ends notched out of it. */
.mg-hero-banner{
  position:relative;background:var(--mg-navy);color:#fff;
  padding:9px 34px 10px;text-align:center;min-width:240px;
  clip-path:polygon(0 0,100% 0,100% 100%,0 100%,14px 50%);
  box-shadow:0 3px 0 rgba(11,41,106,.25);
}
.mg-hero-banner::before,.mg-hero-banner::after{
  content:"";position:absolute;top:0;bottom:0;width:16px;background:var(--mg-sun)}
.mg-hero-banner::before{left:0;clip-path:polygon(0 0,100% 0,60% 50%,100% 100%,0 100%)}
.mg-hero-banner::after{right:0;clip-path:polygon(0 0,100% 0,100% 100%,0 100%,40% 50%)}
.mg-hero-banner em{display:block;font-style:normal;font-size:10px;font-weight:700;
  color:var(--mg-sun);letter-spacing:.08em}
.mg-hero-banner b{display:block;font-size:23px;font-weight:900;line-height:1.1;
  /* Hay Day outlines its display type rather than shadowing it. */
  text-shadow:0 2px 0 rgba(0,0,0,.25)}
.mg-hero-banner span{display:block;font-size:10.5px;font-weight:700;color:var(--mg-sun)}

@media(prefers-reduced-motion:reduce){
  .mg-hero-egg{animation:none}
  .mg-hero-pics figure{transition:none}
}

.mg-dbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 11px}
.mg-dbar b{font-size:14px;font-weight:900;color:var(--mg-navy);
  background:linear-gradient(transparent 62%,var(--mg-sun) 62%,var(--mg-sun) 94%,transparent 94%);
  padding:0 3px}
.mg-dbar span{font-size:11.5px;font-weight:500;color:#5B6B86;margin-right:auto}
.mg-dbar .btn{flex:none}
.mg-dtop{display:grid;gap:11px;margin-bottom:14px}
.mg-side{display:grid;gap:12px;align-content:start}
.mg-next{font-size:12px;font-weight:700;color:#5B6B86;margin:-4px 0 0;text-align:center}
.mg-coop{padding:0;overflow:hidden;position:relative}
.mg-coop img{display:block;width:100%;height:auto}
.mg-coop span{position:absolute;left:10px;bottom:9px;font-size:11.5px;font-weight:900;
  color:var(--mg-navy);background:var(--mg-sun);border:2px solid var(--mg-navy);
  border-radius:999px;padding:2px 11px 3px}
.mg-top1,.mg-badge{margin:0}
.mg-top1 em{display:block;font-style:normal;font-size:11.5px;font-weight:700;color:#5B6B86}
.mg-top1 b{font-size:17px;font-weight:900}
.mg-badge{display:flex;align-items:center;gap:12px}
.mg-badge img{width:54px;height:54px;flex:none}
.mg-badge em{display:block;font-style:normal;font-size:11.5px;font-weight:700;color:#5B6B86}
.mg-badge b{display:block;font-size:14.5px;font-weight:900}
.mg-badge span{font-size:11.5px;font-weight:700;color:#5B6B86}
.mg-newpost{justify-self:start}

/* the composer */
.mg-compose .eg-q{margin-top:4px}
.mg-picks{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:10px}
.mg-pick{position:relative;width:86px;height:86px}
.mg-pick img{width:100%;height:100%;object-fit:cover;border-radius:12px;
  border:2.5px solid var(--mg-navy)}
.mg-pick-x{position:absolute;top:-7px;right:-7px;width:24px;height:24px;
  border-radius:999px;border:2px solid var(--mg-navy);background:#fff;
  color:var(--mg-navy);font-weight:900;line-height:1;padding:0}
/* 8:「写真に顧客や社外の人が写らないよう、投稿画面に注意書きを出す」 */
.mg-care{font-size:12.5px;font-weight:700;color:var(--mg-navy);
  background:var(--mg-sun);border:2px solid var(--mg-navy);border-radius:12px;
  padding:9px 13px;margin:4px 0 0}

/* ------------------------------- the grid -------------------------------
   Square tiles, the way a photo app shows a profile. A dish is
   recognisable from a thumbnail, so a dozen in one glance beats one and a
   half down a column — which is what the full-width feed gave, and why
   one post was taking half the screen.
------------------------------------------------------------------------ */
.mg-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.mg-grid-none{grid-column:1/-1;margin:0}
.mg-tile{
  position:relative;padding:0;border:2px solid var(--mg-navy);
  border-radius:10px;overflow:hidden;background:var(--mg-sky);
  aspect-ratio:1;display:block;line-height:0;
  box-shadow:0 2px 0 rgba(11,41,106,.16);
  transition:transform .18s ease,box-shadow .18s ease;
}
.mg-tile:hover{transform:translateY(-2px);box-shadow:0 5px 0 rgba(11,41,106,.18);z-index:2}
.mg-tile img{width:100%;height:100%;object-fit:cover;display:block}
.mg-tile-no{display:flex;align-items:center;justify-content:center;
  width:100%;height:100%;font-size:34px}
.mg-tile.off{opacity:.55;border-style:dashed}

/* The name sits on the picture, so a tile says what it is without being
   opened — legible because of the wash under it, not the colour of it. */
/* line-height is restored here: the tile itself is set to 0 so the image
   leaves no gap under it, and that collapses the text in these overlays
   to a sliver if they do not set their own. */
.mg-tile-over{
  position:absolute;inset:auto 0 0 0;padding:16px 8px 6px;text-align:left;
  background:linear-gradient(transparent,rgba(11,41,106,.82) 62%);
  line-height:1.3;
}
.mg-tile-over b{display:block;font-size:12px;font-weight:900;color:#fff;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-tile-over em{font-style:normal;font-size:10px;font-weight:700;color:var(--mg-sun)}
.mg-tile-sum{position:absolute;top:5px;right:6px;display:flex;gap:4px;line-height:1.3}
.mg-tile-sum i{font-style:normal;font-size:10px;font-weight:900;color:var(--mg-navy);
  background:rgba(255,255,255,.92);border-radius:999px;padding:2px 6px 3px;
  line-height:1.2}
.mg-tile-many{font-size:11px !important}
.mg-tile-hid{position:absolute;top:5px;left:6px}

/* ----------------------------- the photos ------------------------------
   Every link in the chain has to be told it may shrink: the grid column,
   the button inside it, and the image inside that. Miss one and
   max-width:100% resolves against the photograph's own width — which is
   how a 1368px picture came to hang out of a 560px card.

   A dish is whatever shape it was photographed in, so one photograph is
   shown whole and bounded by a height. Several share a square cell,
   because a common cell is what makes a row read as a set — and a square
   takes the middle of a plate rather than a slice of it.
------------------------------------------------------------------------ */
.mg-shots{display:grid;gap:5px}
.mg-shots button{padding:0;border:0;background:none;display:block;
  line-height:0;min-width:0;max-width:100%}
.mg-shots img{display:block;width:100%;border-radius:10px;
  border:2px solid var(--mg-navy)}
.mg-shots.n1{grid-template-columns:minmax(0,1fr)}
.mg-shots.n1 button{width:100%;display:flex;justify-content:center}
.mg-shots.n1 img{width:auto;height:auto;max-width:100%;max-height:420px;
  object-fit:contain}
.mg-shots.n2,.mg-shots.n3,.mg-shots.n4{grid-template-columns:1fr 1fr}
.mg-shots.n2 img,.mg-shots.n3 img,.mg-shots.n4 img{
  aspect-ratio:1;height:100%;object-fit:cover}

/* ------------------------------ the recipe -----------------------------
   A recipe is the one thing on a post somebody copies out, so it keeps
   its own panel and pre-wrapped whitespace — the line breaks a cook typed
   are the instructions. The ask below it is only ever shown to the poster:
   「レシピ教えて」 is a nudge, not a public scoreboard.
------------------------------------------------------------------------ */
.mg-recipe{margin:8px 0 0;border:2px solid var(--mg-navy);border-radius:12px;
  background:var(--mg-cream);padding:8px 10px}
.mg-recipe summary{font-weight:800;color:var(--mg-navy);cursor:pointer;
  font-size:13px;list-style:none}
.mg-recipe summary::-webkit-details-marker{display:none}
.mg-recipe summary::before{content:'\\25B8';display:inline-block;
  margin-right:6px;transition:transform .15s}
.mg-recipe[open] summary::before{transform:rotate(90deg)}
.mg-recipe pre{margin:6px 0 0;font:inherit;font-size:13px;line-height:1.6;
  white-space:pre-wrap;word-break:break-word;color:var(--mg-ink)}
.mg-asked{margin:8px 0 0;font-size:12px;font-weight:700;color:var(--mg-green)}

/* ------------------------- one post, opened ----------------------------- */
.mg-sheet{position:fixed;inset:0;z-index:50;display:flex;
  align-items:flex-start;justify-content:center;padding:18px 12px;
  background:rgba(11,41,106,.55);overflow:auto}
.mg-sheet-in{
  background:var(--mg-paper);border:2.5px solid var(--mg-navy);
  border-radius:var(--mg-round);box-shadow:0 10px 0 rgba(11,41,106,.18);
  padding:13px 14px;width:100%;max-width:560px;margin:auto 0;
}
.mg-sheet-x{margin-left:4px;width:28px;height:28px;padding:0;border-radius:999px;
  border:2px solid var(--mg-navy);background:#fff;color:var(--mg-navy);
  font:inherit;font-size:16px;font-weight:900;line-height:1}
.mg-sheet-x:hover{background:var(--mg-sun)}
.mg-post-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}
.mg-post-h b{font-size:13px;font-weight:900}
.mg-post-h span{font-size:11.5px;font-weight:700;color:#5B6B86;margin-right:auto}
.mg-post-d{font-size:16px;font-weight:900;margin:0 0 10px;color:var(--mg-navy)}
.mg-post-b{font-size:13px;font-weight:500;line-height:1.7;margin:11px 0 0;color:#2C3C58}

/* 7.4, as a strip rather than a column beside the feed */
.mg-strip2{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 11px}
.mg-chip{display:inline-flex;align-items:center;gap:7px;
  border:2px solid var(--mg-navy);border-radius:999px;background:#fff;
  padding:3px 13px 4px 4px;box-shadow:0 2px 0 rgba(11,41,106,.14)}
.mg-chip img{width:28px;height:28px;flex:none}
.mg-chip i{font-style:normal;font-size:16px;margin-left:8px}
.mg-chip b{font-size:12.5px;font-weight:900;color:var(--mg-navy)}
.mg-chip em{font-style:normal;font-size:10.5px;font-weight:700;color:#5B6B86}
.mg-chip.top{background:var(--mg-sun)}
.mg-next{font-size:11px;font-weight:700;color:#5B6B86}

/* 7.2 the buttons */
.mg-react{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
.mg-rx{display:inline-flex;align-items:center;gap:4px;
  padding:4px 10px 5px;border:2px solid var(--mg-navy);border-radius:999px;
  background:#fff;color:var(--mg-navy);font:inherit;font-size:11.5px;font-weight:700}
.mg-rx:hover{background:var(--mg-sky)}
.mg-rx.on{background:var(--mg-sun)}
.mg-rx b{font-variant-numeric:tabular-nums;font-weight:900}
.mg-rx:disabled{opacity:.55;cursor:default}
.mg-rx.talk{margin-left:auto}

/* 7.3 comments */
.mg-thread{margin-top:12px;padding-top:11px;border-top:2px dotted #D9CFB0;display:grid;gap:9px}
.mg-cm{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:baseline}
.mg-cm b{font-size:12.5px;font-weight:900}
.mg-cm p{margin:0;font-size:13px;font-weight:500;color:#2C3C58}
.mg-cm-x{background:none;border:0;font:inherit;font-size:11.5px;font-weight:700;
  color:#8C96A8;padding:0}
.mg-cm-x:hover{color:#B3261E}
.mg-cm-new{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
.app.mg .mg-cm-new input{border:2.5px solid var(--mg-navy);border-radius:999px;
  background:#FFFDF6;padding:8px 15px;font:inherit;font-size:13.5px;
  color:var(--mg-navy);outline:none}
.app.mg .mg-cm-new input:focus{border-color:var(--mg-royal);background:#fff}

/* a tapped photograph */
.mg-lightbox{position:fixed;inset:0;z-index:60;border:0;padding:16px;
  background:rgba(11,41,106,.9);display:flex;align-items:center;justify-content:center}
.mg-lightbox img{max-width:100%;max-height:100%;border-radius:12px;
  border:3px solid var(--mg-sun)}

@media(min-width:900px){
  .mg-dtop{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-items:center}
  /* The front of the site, so it gets the middle of the page and some
     size. It is the first thing anybody sees and it should look like it. */
  .mg-hero{max-width:820px;margin-bottom:26px}
  .mg-hero-pics{gap:16px}
  .mg-hero-pics figure{padding:9px 9px 0;border-radius:4px}
  .mg-hero-pics figcaption{font-size:13px;padding:7px 2px 8px}
  .mg-hero-egg{width:104px;height:104px;margin:-18px 0 -8px}
  .mg-hero-banner{padding:12px 46px 13px;min-width:330px}
  .mg-hero-banner b{font-size:33px}
  .mg-hero-banner em{font-size:11.5px}
  .mg-hero-banner span{font-size:12px}
  .mg-shots.n3{grid-template-columns:repeat(3,1fr)}
  .mg-shots.n4{grid-template-columns:repeat(4,1fr)}
  /* One centred column. The hero is the front of the site, so it sits in
     the middle of the page rather than at the left edge of a text column
     with three hundred pixels of nothing beside it. */
  .mg-dish{max-width:860px;margin:0 auto}
  .mg-grid{grid-template-columns:repeat(3,1fr);gap:10px}
  .mg-compose{max-width:560px}
}
@media(min-width:1280px){
  .mg-grid{grid-template-columns:repeat(4,1fr)}
}
`;
