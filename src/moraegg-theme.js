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
  /* Hairlines. Every border on this page is one of these three, at 1px.
     They are the palette's own navy, royal and sun let down to the weight
     a line needs: present when you look for it, silent when you do not. */
  --mg-line:#E2E7F1; --mg-line-s:#CCD6E8; --mg-line-b:#C4D2EC;
  --mg-line-y:#F0DCA8;
  /* The lift: a soft, short shadow. The old one was a hard 3px offset in
     the border colour, which stuck every card onto the page like a vinyl
     sticker and is most of what made the site look like an arcade. */
  --mg-pop:0 1px 2px rgba(11,41,106,.05), 0 6px 16px -8px rgba(11,41,106,.16);
  --mg-pop-s:0 1px 2px rgba(11,41,106,.05);
  font-family:"Zen Maru Gothic","Noto Sans JP","Hiragino Maru Gothic ProN",
    "Inter",system-ui,sans-serif;
  /* Zen Maru Gothic ships 500, 700 and 900 — no 600 and no 800. Asked
     for either, the browser smears the nearest one wider by itself, and
     faux-bold on a rounded face is what made some lines look like a
     different font. Off: a weight we do not have falls back to one we
     do, as drawn. */
  font-synthesis:none;
  -webkit-font-synthesis:none;
}

/* The ground. It used to carry her printed dot screen at 19px, which is
   charming on a poster and restless behind a page of numbers: the dots
   sit under every card edge and the whole screen reads as texture.
   Flat cream instead — the colour is hers, the noise is gone. */
.mg-page{
  min-height:100vh;
  background:var(--mg-cream);
  color:var(--mg-navy);
  padding-bottom:40px;
}

/* ---------------------------------------------------------------------------
   The sign-in screen at /egg.

   The same component as the pedometer's — one sign-in to maintain, not
   two — wearing モラエッグ's clothes: the cream ground with her dots, navy
   on sun, the sticker shadow under the card and the button. Nothing is
   moved and nothing is added, so a person who signs in to both sites
   finds the fields exactly where they were.

   Every selector starts .login.mg-door rather than .mg-door, and that is
   not decoration: this stylesheet is concatenated BEFORE the app's own,
   so at equal specificity the app wins. Plain .mg-door rules lost to
   .login{background:#fff} and the screen came back unstyled apart from
   the buttons, which were heavier by accident.
   --------------------------------------------------------------------- */
.login.mg-door{
  border-top:0;
  /* The ground has to be set here and not left to .mg-page: that rule and
     .login are both one class, and .login is in the stylesheet that comes
     second. */
  background:var(--mg-cream);
}
.login.mg-door .login-inner{
  max-width:428px;margin:26px auto 34px;padding:26px 24px 28px;
  background:var(--mg-paper);
  border:1px solid var(--mg-line-s);border-radius:20px;
  box-shadow:var(--mg-pop);
}
@media(min-width:600px){ .login.mg-door .login-inner{margin-top:46px} }

/* The company logo stays as it is — this is still モラブ阪神's site — but
   the language button joins the rest of the furniture. */
.login.mg-door .lang{
  background:var(--mg-sun);color:var(--mg-navy);border:1px solid var(--mg-line-s);
  border-radius:999px;padding:4px 13px;font-size:12px;font-weight:800;
  box-shadow:var(--mg-pop-s);
}
.login.mg-door .lang:hover{background:#FFD45E;color:var(--mg-navy);border-color:var(--mg-navy)}

/* The character is a picture here, not the MoraBot component, so it
   sizes by its own aspect ratio rather than the 104x118 box the SVG is
   given. Height-capped: it is taller than it is wide. */
.login.mg-door .login-hello{align-items:flex-end;gap:12px;margin:10px 0 10px}
.login.mg-door .login-hello .mg-door-bot{
  width:auto;height:150px;flex:0 0 auto;align-self:flex-end;
}
@media(max-width:600px){
  .login.mg-door .login-hello{gap:9px}
  .login.mg-door .login-hello .mg-door-bot{height:112px}
}
.login.mg-door .login-hello .bubble{
  background:var(--mg-sky);border:1px solid var(--mg-line-s);border-radius:14px;
  color:var(--mg-navy);font-weight:700;
}
.login.mg-door .eyebrow{color:var(--mg-royal);font-weight:800}
.login.mg-door .login-title h1{font-weight:900;color:var(--mg-navy);letter-spacing:0}
/* The underline she puts under every heading inside the site. */
.login.mg-door .login-title h1::after{
  content:'';display:block;width:2.1em;height:7px;margin-top:7px;border-radius:999px;
  background:var(--mg-sun);
}

.login.mg-door .fld>span{color:var(--mg-navy);font-weight:700;font-size:12.5px}
.login.mg-door .fld input{
  border:1px solid var(--mg-line-s);border-radius:12px;background:#FFFDF6;
  color:var(--mg-navy);font-weight:700;
}
.login.mg-door .fld input:focus{background:#fff;box-shadow:0 0 0 3px rgba(255,198,47,.55)}
.login.mg-door .fld input::placeholder{color:#9AA7BC;font-weight:600}

/* While the name is on screen, the greeting is not. The card has one
   question on it at that point — is this you — and the mascot with its
   こんにちは costs 150px, which is what made the door scroll on a laptop
   and on a small phone. It comes back with 社員番号を入力し直す. */
.login.mg-door.mg-door-who .login-hello{display:none}
.login.mg-door.mg-door-who .login-title{margin-bottom:18px}
/* A short screen — an older phone, or a laptop with its browser chrome —
   gets the same card with less air around it, so the door never scrolls
   for the sake of 30px. */
@media(max-height:700px){
  .login.mg-door .login-inner{padding-top:16px;padding-bottom:18px}
  .login.mg-door .login-top{margin-bottom:18px}
  .login.mg-door .login-hello{margin:4px 0 6px}
  .login.mg-door .login-title{margin-bottom:16px}
}

/* 社員番号の確認 — the name the number belongs to, between the box and
   the way in. Plain and large: on this screen it is the one thing the
   person is being asked to read. */
.login.mg-door .login-who{
  margin:0 0 9px;padding:7px 11px 8px;border-radius:11px;
  background:var(--mg-sky);border:1px solid var(--mg-line-b);
}
.login.mg-door .login-who>span{display:block;font-size:10.5px;font-weight:700;
  color:#5B6B86}
.login.mg-door .login-who b{display:block;margin:0 0 2px;font-size:18px;
  font-weight:700;color:var(--mg-navy);line-height:1.35}
.login.mg-door .login-who p{margin:0;font-size:11.5px;font-weight:500;
  color:#3E4F6E;line-height:1.45}
.login.mg-door .fld input:disabled{background:#F4F6FA;color:#5B6B86}
/* 社員番号を入力し直す, under ログイン. The sign-in column has no gap of
   its own — every other button in it carries its own margin — so without
   this the two sit edge to edge and read as one control. */
.login.mg-door .login-redo{margin-top:11px}

.login.mg-door .err{color:#B3261E;font-weight:800}
.login.mg-door .notice{
  background:var(--mg-sky);border:1px solid var(--mg-line-b);border-radius:12px;
  color:var(--mg-navy);font-weight:700;padding:9px 12px;
}
/* The card ends where its content ends. .login stretches its child to
   the full height of the viewport, which on the pedometer's edge-to-edge
   white is invisible and inside a bordered card is a hand's width of
   nothing above the footer. */
.login.mg-door{align-items:flex-start}
.login.mg-door .login-foot{color:#6B7A93;font-weight:600;margin-top:30px;padding-top:0}

/* ------------------------------ the header ------------------------------
   A quiet bar. The first version shouted: a 4px yellow rule under it and
   every control a thick outlined pill, which is a lot of border for three
   words and two links. Same colours, a third of the weight.
------------------------------------------------------------------------ */
.mg-hdr{
  position:relative;
  display:flex;align-items:center;gap:14px;justify-content:space-between;
  padding:0 18px;height:54px;background:var(--mg-navy);
  box-shadow:inset 0 -1px 0 rgba(255,198,47,.5);
}
.mg-back i{font-style:normal;line-height:1}
.mg-back{
  display:inline-flex;align-items:center;gap:6px;
  padding:5px 2px;border:0;background:none;color:rgba(255,255,255,.72);
  font:inherit;font-size:13px;font-weight:700;white-space:nowrap;
}
.mg-back:hover{color:var(--mg-sun)}
/* Centred on the bar itself rather than in the space the two sets of
   controls leave over — those are different widths, so an auto margin
   put the name slightly right of centre. Taken out of the flow and
   pinned to the middle, with the pointer passing through to whatever is
   behind it so it never sits on top of a control. */
.mg-brand{display:flex;align-items:center;gap:9px;
  position:absolute;left:50%;transform:translateX(-50%);
  pointer-events:none}
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
  .mg-brand{gap:7px;min-width:0}
  .mg-brand h1{font-size:15px;white-space:nowrap}
  .mg-seal{width:26px;height:26px}
  .mg-mini{padding:5px 8px;font-size:11px}
}

/* ----------------------------- 参加登録 ---------------------------------
   The gate. Wider than a form and narrower than the page: three steps
   that are each one decision, so the column is sized to the longest of
   them rather than to the screen.
------------------------------------------------------------------------ */
.mg .mg-reg{max-width:620px;margin:0 auto;padding:4px 0 28px}
.mg .mg-reg-top{text-align:center;margin-bottom:16px}
.mg .mg-reg-top h2{margin:0 0 6px;font-size:20px;font-weight:900;color:var(--mg-navy)}
.mg .mg-reg-top p{margin:0;font-size:13px;line-height:1.7;color:#4A5A74}
.mg .mg-reg-by{margin-top:7px!important;display:inline-block;font-size:12.5px;
  font-weight:900;color:var(--mg-navy);background:var(--mg-sun);
  border-radius:8px;padding:3px 12px}

/* 1 2 3, because a gate with no end in sight is the one people abandon. */
.mg .mg-steps3{list-style:none;display:flex;gap:7px;margin:0 0 14px;padding:0}
.mg .mg-steps3 li{flex:1;display:flex;align-items:center;gap:7px;
  padding:7px 10px;border:1px solid var(--mg-line-s);border-radius:999px;
  background:var(--mg-paper);font-size:12px;font-weight:700;color:#6B7A92}
.mg .mg-steps3 li b{display:inline-flex;align-items:center;justify-content:center;
  width:20px;height:20px;flex:none;border-radius:999px;
  background:#D7DEEA;color:var(--mg-navy);font-size:11.5px;font-weight:900}
.mg .mg-steps3 li.on{background:var(--mg-sun);color:var(--mg-navy)}
.mg .mg-steps3 li.on b{background:var(--mg-navy);color:#fff}
.mg .mg-steps3 li.did b{background:var(--mg-leaf);color:#fff}
.mg .mg-steps3 li.did{color:var(--mg-navy)}
@media(max-width:560px){
  .mg .mg-steps3 li span{display:none}
  .mg .mg-steps3 li{flex:0 0 auto;justify-content:center;padding:7px}
}

.mg .mg-reg-card{padding:15px 16px}
.mg .mg-reg-lead{margin:0 0 10px;font-size:12.5px;color:#4A5A74;line-height:1.7}
/* The terms are the one thing on this screen to actually read, so they
   are a list with room, not a paragraph of small print. */
.mg .mg-terms{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:7px}
.mg .mg-terms li{position:relative;padding:9px 12px 9px 30px;
  background:var(--mg-cream);border:1px solid var(--mg-line-s);border-radius:11px;
  font-size:12.5px;line-height:1.65;color:var(--mg-ink)}
.mg .mg-terms li::before{content:'✓';position:absolute;left:11px;top:9px;
  font-weight:900;color:var(--mg-green)}
/* 受取場所: one office per row, not a wrapped bag of pills. Each one
   carries a full postal address, so they are rows of very different
   widths — as chips they ragged down the card at seven different lengths,
   which is the scattered look. One column, every row the same width, the
   name over the address. */
.mg .eg-opts.mg-reg-offs{margin-bottom:12px;display:grid;gap:7px}
.mg .eg-opts.mg-reg-offs .eg-opt{
  flex-direction:column;align-items:flex-start;gap:0;
  border-radius:10px;padding:9px 13px 10px;text-align:left;
}
.mg .eg-opts.mg-reg-offs .eg-opt.on::before{position:absolute;right:13px;top:9px}
.mg .eg-opts.mg-reg-offs .eg-opt{position:relative;padding-right:34px}
.mg .mg-reg-offs .eg-opt small{display:block;margin-top:2px;font-size:11px;
  font-weight:600;color:#6B7A92}
/* メインのアドレス. The label is a sentence now —「メインのアドレス
   （基本的には会社のアドレスになります）」— so the row wraps instead of
   squeezing the address against the right edge, and the address keeps
   its own line on a phone. */
.mg .mg-reg-mail{margin:0 0 2px;flex-wrap:wrap;gap:2px 14px;
  align-items:baseline}
.mg .mg-reg-mail>span{flex:1 1 14em;min-width:0}
.mg .mg-reg-mail>strong{word-break:break-all}
.mg .mg-reg-go{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px;
  padding-top:13px;border-top:1px solid var(--mg-line)}
.mg .mg-reg-go .btn.primary{margin-left:auto}

/* ---- 社員番号の確認 — 佐野 2026/11/05 ------------------------------------
   The name that the typed employee number belongs to, shown before
   anything else on the sign-up can be used. It is the first card on the
   screen and it should read as the thing holding the rest up, so it has
   the sun border rather than the quiet one the other cards use. */
/* .card.mg-who and not .mg-who alone: the generic .mg .card rule is
   further down this same stylesheet, so at equal weight it would win and
   the colour would silently not apply.
   (No backticks in here — this stylesheet is a template literal, and one
   stray backtick ends the string and takes the whole page with it.) */
.mg .card.mg-who{border-color:var(--mg-navy);background:var(--mg-sun);margin-bottom:12px}
.mg .mg-who-rows{
  display:grid;grid-template-columns:auto 1fr;gap:4px 14px;
  margin:0 0 12px;padding:10px 13px;
  background:var(--mg-paper);border:1px solid var(--mg-line-s);border-radius:12px;
}
.mg .mg-who-rows dt{font-size:11.5px;font-weight:800;color:#5A6880;align-self:center}
.mg .mg-who-rows dd{margin:0;font-size:14px;font-weight:800;color:var(--mg-navy)}
/* The name is the one thing on this card a person is being asked to
   read, so it is the only thing set large. */
.mg .mg-who-rows dd.mg-who-name{font-size:19px;line-height:1.35}

.mg .mg-who-lead{margin:0 0 10px;font-size:13px;font-weight:800;
  color:var(--mg-navy);line-height:1.6}
.mg .mg-who-ok{min-width:118px}
/* 「名前が違う場合は…」 sits below the OK, divided from it, because it is
   the other answer to the same question and not a footnote to it. */
.mg .mg-who-ng{margin:13px 0 9px;padding-top:12px;border-top:1px solid var(--mg-line-y);
  font-size:12px;font-weight:700;color:#6B5A1E;line-height:1.65}
.mg .mg-who-redo{font-size:12.5px}
.mg .mg-who-done{margin:0;font-size:13px;font-weight:800;color:var(--mg-green)}
.mg .mg-who-done::before{content:'✓';margin-right:6px;font-weight:900}

/* The terms card while the name is still unconfirmed: legible, plainly
   not yet in use. Not display:none — somebody has to be able to read
   the terms before they agree to them, and somebody who cannot see what
   is coming next does not know the OK button leads anywhere. */
.mg .card.mg-reg-wait{opacity:.72}
.mg .mg-tick-off{background:#EEF1F6;border-color:#B9C4D4;color:#7A879B;cursor:default}
.mg .mg-tick-off input{cursor:default}
.mg .mg-who-why{margin:-5px 0 0;font-size:11.5px;font-weight:700;color:#7A879B}

.mg .mg-reg-done{text-align:center;padding-top:22px}
.mg .mg-reg-done img{width:120px;height:120px;margin-bottom:10px}
.mg .mg-reg-done h2{margin:0 0 8px;font-size:19px;font-weight:900;color:var(--mg-navy)}
.mg .mg-reg-done p{margin:0 auto 18px;max-width:420px;font-size:13px;
  line-height:1.8;color:#4A5A74}

/* The registered office, reported rather than asked for. */
.mg .eg-req-at{display:flex;align-items:baseline;gap:11px;flex-wrap:wrap;
  margin:0 0 14px;padding:9px 13px;background:var(--mg-sky);
  border:1px solid var(--mg-line-b);border-radius:11px}
.mg .eg-req-at b{font-size:16px;font-weight:900;color:var(--mg-navy)}
.mg .eg-hq{margin-top:12px}
/* 東京の特例: a request for help, so it reads as a sentence rather than
   as a warning about something going wrong. */
.mg .eg-tokyo-note{margin:11px 0 0;padding:10px 13px;font-size:12.5px;
  line-height:1.7;font-weight:600;color:var(--mg-navy);
  background:#FFF6DF;border:1px solid var(--mg-line-y);border-radius:11px}

/* ------------------------------ マイ設定 -------------------------------- */
.mg .mg-set{max-width:680px}
/* 受取場所の注意書き: three lines, no bullet. She wrote them with ＊ in
   front, which is how a line is marked in a message and one mark too
   many on a screen where they are already three short lines of their
   own. */
.mg .mg-set-notes{list-style:none;margin:0 0 9px;padding:0;display:grid;gap:3px}
.mg .mg-set-notes li{font-size:12px;font-weight:500;color:#5B6B86;
  line-height:1.55}

.mg .mg-set-by{display:inline-block;margin:0 0 9px;font-size:12px;font-weight:900;
  color:var(--mg-navy);background:var(--mg-sun);border-radius:8px;padding:3px 12px}
.mg .mg-set-agreed{margin:0 0 9px;font-size:13px;font-weight:900;color:var(--mg-green)}
.mg .mg-set-terms{margin-top:11px}
/* The save bar. It was a gradient from transparent to cream, which left
   whatever it was over half-visible through it — a heading reading
   through the button is worse than one hidden behind it. Solid cream with
   a hairline above, so it is a bar and the page clearly ends at it. */
.mg .mg-set-go{position:sticky;bottom:0;z-index:2;margin-top:4px;
  padding:12px 0;pointer-events:none}
.mg .mg-set-go>*{pointer-events:auto}
.mg .mg-set-go .btn{box-shadow:0 2px 10px rgba(11,41,106,.22)}

/* ------------------------------- the tabs ------------------------------- */
/* The tab strip and the reader's name share one line once there is room
   for both; on a phone the name goes above the tabs, because the tabs
   scroll sideways and anything parked at their right-hand end scrolls
   away with them. The row owns the page gutter now, not .eg-sub. */
.mg .mg-subbar{display:flex;flex-direction:column;gap:9px;padding:10px 16px 0}
/* On a phone the name reads first — header, who you are, then the tabs —
   rather than being left between the tabs and the first card. */
.mg .mg-subbar .mg-me{order:-1}
.mg .mg-me{
  margin:0;font-size:13.5px;font-weight:800;color:var(--mg-navy);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;
}
.mg .mg-me span{font-weight:600;color:#5B6B86}
@media(min-width:620px){
  .mg .mg-subbar{flex-direction:row;align-items:center;
    justify-content:space-between;gap:16px;padding-top:14px}
  .mg .mg-subbar .mg-me{order:0}
  .mg .mg-subbar .eg-sub{flex:1 1 auto;min-width:0}
  .mg .mg-me{flex:0 0 auto;font-size:14.5px}
}
.mg .eg-sub{
  display:flex;gap:8px;padding:0;background:none;border:0;
  overflow-x:auto;scrollbar-width:none;
}
.mg .eg-sub::-webkit-scrollbar{display:none}
/* No outline. A row of outlined capsules is a row of little racetracks,
   and at four or five of them the borders are most of what you see. The
   tab that is chosen is filled; the others are just their words. */
.mg .eg-sub button{
  padding:7px 14px 8px;border:0;border-radius:9px;
  background:transparent;color:#5B6B86;
  font:inherit;font-size:15.5px;font-weight:700;white-space:nowrap;
  box-shadow:none;transition:background .14s, color .14s;
}
.mg .eg-sub button:hover{background:rgba(11,41,106,.055);color:var(--mg-navy)}
/* The chosen tab used to carry a solid navy slab under it, which ran into
   the navy border and read as a squared-off bottom on a pill that is round
   everywhere else. A tab that is already chosen has nothing left to press,
   so it is recessed rather than raised: the lift comes off, the shadow goes
   inside, and the bottom edge is just the border again. */
.mg .eg-sub button.on{
  background:var(--mg-sun);color:var(--mg-navy);
  box-shadow:none;transform:none;font-weight:800;
}

.mg-body{padding:12px 14px 0;max-width:1240px}

/* ------------------------------- the cards ------------------------------ */
/* One shape for everything: white, a hairline, a soft lift. The spacing
   is a scale, not a guess — 14/16 inside, 12 between — so a column of
   cards reads as one list rather than a pile of unrelated boxes. */
.mg .card{
  background:var(--mg-paper);
  border:1px solid var(--mg-line-s);border-radius:var(--mg-round);
  box-shadow:var(--mg-pop);
  padding:12px 15px;margin-bottom:10px;
}
.mg .card.soft{background:var(--mg-sky)}

/* A heading is a label for what it names. It used to be struck through
   with a yellow marker-pen gradient, which on a page with a dozen of them
   reads as highlighter all the way down. The yellow stays, as a short
   upright tick at the left — an accent you notice once per section. */
.mg .sechead{
  display:flex;align-items:center;gap:10px;justify-content:space-between;
  background:none;border:0;padding:0;margin:13px 0 7px;
}
.mg .sechead:first-child{margin-top:2px}
.mg .sechead>span:first-child{
  position:relative;padding-left:11px;
  font-size:17px;font-weight:800;color:var(--mg-navy);letter-spacing:.005em;
}
.mg .sechead>span:first-child::before{
  content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);
  width:3px;height:1.05em;border-radius:2px;background:var(--mg-sun);
}
.mg .sechead>span+span{font-size:12.5px;font-weight:700;color:var(--mg-royal)}

/* ------------------------------ the buttons ----------------------------- */
.mg .btn{
  padding:7px 15px 8px;border:1px solid var(--mg-line-s);border-radius:999px;
  background:var(--mg-paper);color:var(--mg-navy);
  font:inherit;font-size:13px;font-weight:700;
  box-shadow:var(--mg-pop-s);transition:transform .07s,box-shadow .07s;
}
.mg .btn:hover{background:var(--mg-sky);border-color:var(--mg-line-b)}
/* A press moves the button a hair. It used to drop two pixels and lose
   its shadow, which is an arcade cabinet, not a web page. */
.mg .btn:active{transform:translateY(1px);box-shadow:none}
.mg .btn.primary{background:var(--mg-royal);color:#fff}
.mg .btn.primary:hover{background:#1A449E}
.mg .btn.ghost{background:var(--mg-paper)}
.mg .btn.big{width:auto;padding:10px 24px 11px;font-size:14.5px;font-weight:900}
.mg .btn.sm{padding:4px 11px 5px;font-size:11.5px;box-shadow:var(--mg-pop-s)}
.mg .btn.sm:active{transform:translateY(1px)}
.mg .btn:disabled{
  background:#E7E9EE;color:#9AA3B2;border-color:#C3C9D4;
  box-shadow:none;cursor:not-allowed;transform:none;
}
.mg .btn.danger{color:#B3261E;border-color:#B3261E;box-shadow:var(--mg-pop-s)}

/* ------------------------------- the fields ----------------------------- */
.mg .fld{margin-bottom:13px}
.mg .fld>span{font-size:12.5px;font-weight:700;color:var(--mg-navy);margin-bottom:5px}
.app.mg .fld input,.app.mg .fld select,.app.mg .fld textarea,
.app.mg .eg-offs-add input,.app.mg .eg-offs-a,.app.mg .eg-offs select{
  border:1px solid var(--mg-line-s);border-radius:10px;background:#FFFDF6;
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
  background:var(--mg-sky);border:1px solid var(--mg-line-b);border-radius:12px;
  padding:10px 13px;margin:0 0 11px;
}
.mg .eg-exp{
  font-style:normal;font-size:10.5px;font-weight:900;margin-left:7px;
  color:var(--mg-navy);background:var(--mg-sun);
  border:0;background:var(--mg-sun);border-radius:6px;padding:1px 7px 2px;
}

/* ------------------------------- the chips ------------------------------ */
/* Selected is yellow with a tick, so it is never colour on its own. */
.mg .eg-opts{display:flex;flex-wrap:wrap;gap:8px}
/* Same reasoning as the tabs: a filled chip for the one that is chosen,
   a tinted one for the rest, and no outline on either. */
.mg .eg-opt{
  display:inline-flex;align-items:center;gap:5px;
  padding:6px 13px 7px;border:0;border-radius:9px;
  background:var(--mg-sky);color:#3E4F6E;
  font:inherit;font-size:13px;font-weight:700;box-shadow:none;
}
.mg .eg-opt:hover{background:#DFE7F6;color:var(--mg-navy)}
.mg .eg-opt.on{background:var(--mg-sun);color:var(--mg-navy);font-weight:800}
/* The tick is the thing that is not colour, so a real choice keeps it:
   選んだ受取場所 on マイ設定 and 参加登録, 用途 on the request. A filter
   is not a choice of that kind — 事業所 and 週 on the 事業所 screen only
   say which slice is on screen, and the tick there was noise. */
.mg .eg-opt.on::before{content:"✓";font-weight:900;font-size:13px}
.mg .eg-off-bar .eg-opt.on::before,.mg .eg-wk-t .eg-opt.on::before{content:none}
.mg .eg-opt.none{color:#5B6B86;background:#EEF0F4}
.mg .eg-opt.none.on{background:#DDE1E8;color:var(--mg-navy)}
.mg .eg-opt small{display:block;font-size:10.5px;font-weight:500;opacity:.8}

/* --------------------------- the choice cards --------------------------- */
.mg .eg-rules{display:grid;gap:10px}
.mg .eg-rule{
  display:grid;gap:2px;text-align:left;padding:12px 14px;
  border:1px solid var(--mg-line-s);border-radius:14px;
  background:var(--mg-paper);box-shadow:none;
}
.mg .eg-rule:hover{background:var(--mg-sky);border-color:var(--mg-line-b)}
.mg .eg-rule.on{background:var(--mg-sun);border-color:var(--mg-line-y);box-shadow:none}
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
  background:var(--mg-sky);border:1px dashed var(--mg-line-b);
  border-radius:12px;padding:9px 13px;margin:0 0 14px;
}
.mg .eg-q{font-size:13.5px;font-weight:900;color:var(--mg-navy);margin:0 0 9px}
/* A line under a question that says what the answer is for. 問1 is
   reference only now, 問2 is the one that decides the rule, and a survey
   that does not say so reads as two equal questions. */
.mg .eg-qnote{margin:-5px 0 9px;font-size:12px;font-weight:600;color:#5B6B86}
.mg .eg-qnote.lead{color:var(--mg-green)}
/* A badge is a label, not a button: filled and borderless, the same
   corner as the chips. */
.mg .pill{
  border-radius:8px;font-size:11.5px;font-weight:800;padding:3px 10px 4px;
  border:0;background:var(--mg-sky);color:#3E4F6E;
}
.mg .pill.ok{background:var(--mg-leaf);color:#fff}
.mg .pill.warn{background:var(--mg-sun);color:var(--mg-navy)}
.mg .eg-warn{color:#B3261E;font-weight:700}

/* ------------------------------ the pictures ---------------------------- */
/* Shown whole, never cropped: each one carries its own words and its own
   background, and a crop would cut the speech bubble off. */
.mg-pic{display:block;width:100%;height:auto;border-radius:14px;
  border:1px solid var(--mg-line-s);box-shadow:var(--mg-pop)}
/* Capped by HEIGHT, not width: the artwork comes square (1400×1400) and
   wide (1600×977), and a width cap that suits one makes the other own the
   screen. Never cropped — the speech bubble is part of the picture. */
.mg-strip{margin-bottom:12px;max-height:150px;width:auto;max-width:100%}
/* Two full-width pictures stacked on a phone is half a screen of scrolling
   for decoration. The one at the top goes; the 鶏舎だより below stays,
   because it is the one carrying news. */
@media(max-width:899px){.mg-strip.mg-opt{display:none}}

/* ------------------------------ the verdict ----------------------------- */
/* 佐野:「最低パック数を超えたら『今週はこの事務所にタマゴが届きます！』、
   届かなかったら残念賞のメッセージ」 */
/* --------------------------- 今週のモラエッグ ---------------------------
   佐野's 初回の受付スタート card, as type in boxes rather than a drawing,
   so the dates in it are this week's. Her shapes: a sun panel with the
   dotted ground, the deadline in a white box with a navy keyline, the
   three steps as dated chips, her bubble and the robot.
------------------------------------------------------------------------- */
.mg .mg-weekcard{
  position:relative;background:var(--mg-sun);border-radius:16px;
  padding:10px 11px 11px;margin-bottom:12px;box-shadow:var(--mg-pop);
  background-image:radial-gradient(rgba(255,255,255,.45) 1.5px, transparent 1.6px);
  background-size:13px 13px;
}
.mg .mg-wc-h{display:flex;align-items:center;justify-content:center;gap:7px;
  margin:0 0 7px;font-size:18px;font-weight:900;color:var(--mg-navy);
  letter-spacing:.01em}
.mg .mg-wc-h img{width:34px;height:34px;flex:none}
.mg .mg-wc-due{background:var(--mg-paper);border:2px solid var(--mg-navy);
  border-radius:12px;padding:6px 10px 7px;text-align:center}
.mg .mg-wc-due em{display:block;font-style:normal;font-size:12px;font-weight:800;
  color:var(--mg-navy)}
.mg .mg-wc-due strong{display:block;font-size:23px;font-weight:900;
  color:var(--mg-royal);line-height:1.2;letter-spacing:-.01em}
.mg .mg-wc-due strong span{font-size:19px}
.mg .mg-wc-due i{display:block;font-style:normal;font-size:10.5px;font-weight:700;
  color:#3E4F6E;margin-top:1px;line-height:1.4}
.mg .mg-wc-rows{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:4px}
.mg .mg-wc-rows li{display:flex;align-items:center;gap:9px;
  background:var(--mg-paper);border:2px solid var(--mg-navy);border-radius:10px;
  padding:3px 9px 4px}
.mg .mg-wc-d{flex:none;min-width:5.4em;text-align:center;border-radius:7px;
  padding:2px 7px 3px;font-size:12px;font-weight:900;color:#fff;
  font-variant-numeric:tabular-nums}
.mg .mg-wc-d.ship{background:#1F7A33}
.mg .mg-wc-d.arrive{background:var(--mg-royal)}
.mg .mg-wc-d.pick{background:var(--mg-navy)}
.mg .mg-wc-rows em{font-style:normal;font-size:13px;font-weight:800;
  color:var(--mg-navy)}
.mg .mg-wc-note{margin:9px 0 0;padding:7px 10px 8px;border-radius:9px;
  background:rgba(255,255,255,.72);font-size:12px;font-weight:700;
  color:var(--mg-navy);line-height:1.5}

/* 「{d}お届け分のリクエストを受け付けています」 — the state of the site
   today, in one line above the reader's own week. */
.mg .eg-openfor{
  margin:0 0 10px;padding:7px 13px 8px;border-radius:10px;
  background:var(--mg-sun);color:var(--mg-navy);
  font-size:13px;font-weight:900;line-height:1.5;
}

/* 不具合の報告 — the same corner as the pedometer's button, in her
   colours. Sun on navy text so it reads as part of this site rather than
   the dark capsule the other one wears. */
.mg .fab{
  right:14px;bottom:16px;
  background:var(--mg-sun);color:var(--mg-navy);border-radius:999px;
  padding:9px 17px 10px;font-size:13px;font-weight:900;
  box-shadow:0 2px 3px rgba(11,41,106,.08), 0 10px 22px -10px rgba(11,41,106,.45);
}
.mg .fab:hover{background:#FFD45E;color:var(--mg-navy)}
/* The sheet it opens: the app's modal, wearing the egg card. Its header
   is the pedometer's brand blue by default, which is the one colour on
   this site that belongs to the other one. */
.mg .sheet{border-radius:16px;overflow:hidden}
.mg .sheet-h{background:var(--mg-navy);color:#fff}
.mg .sheet-h strong{font-weight:900}
.mg .sheet .x{color:rgba(255,255,255,.75)}
.mg .sheet .x:hover{color:var(--mg-sun)}
.mg .sheet .fld textarea{border-radius:11px;background:#FFFDF6;
  border-color:var(--mg-line-s);color:var(--mg-navy)}
.mg .sheet .fld textarea:focus{background:#fff;
  box-shadow:0 0 0 3px rgba(255,198,47,.5)}

/* ---------------------------- あなたの今週 ------------------------------
   One card for the reader's own week: the verdict across the top in its
   own tint, the facts under it as a row of labelled values, the buttons
   last. It replaced four cards with four headings, which is why nothing
   in here has a heading of its own — the labels do that work at 11px.
------------------------------------------------------------------------- */
.mg .eg-me2{
  background:var(--mg-paper);border:1px solid var(--mg-line-s);
  border-radius:var(--mg-round);box-shadow:var(--mg-pop);
  margin-bottom:12px;overflow:hidden;
}
.mg .eg-me2-top{
  position:relative;display:flex;align-items:center;gap:13px;
  padding:11px 15px 12px;border-bottom:1px solid var(--mg-line);
}
.mg .eg-me2.go .eg-me2-top{background:#E7F5E5;border-bottom-color:#BFE3BB}
.mg .eg-me2.wait .eg-me2-top{background:#FFF6DF;border-bottom-color:var(--mg-line-y)}
.mg .eg-me2.miss .eg-me2-top{background:var(--mg-sky);border-bottom-color:var(--mg-line-b)}
.mg .eg-me2-top>img{width:48px;height:48px;flex:none}
.mg .eg-me2-top b{display:block;font-size:17px;font-weight:900;line-height:1.3;
  color:var(--mg-navy)}
.mg .eg-me2.go .eg-me2-top b{color:#0C5E06}
.mg .eg-me2-top p{margin:2px 0 0;font-size:12.5px;font-weight:600;color:#3E4F6E}
/* 佐野's seal, on the corner of the card rather than in the row: the row
   is two lines of text and a picture already. */
.mg .eg-me2-stamp{width:46px;height:46px;margin-left:auto;flex:none;opacity:.95}

/* The facts: as many across as fit, each a small grey label over its
   value, so three of them read as one line of answer rather than three
   cards. */
/* The facts and the buttons on one line: a label over its value, as
   many as fit, and the buttons at the end of the row. */
.mg .eg-me2-body{display:flex;flex-wrap:wrap;align-items:flex-start;
  gap:11px 26px;padding:11px 15px 12px}
.mg .eg-me2-body>div{min-width:0}
.mg .eg-me2-body em{display:block;font-style:normal;font-size:11px;font-weight:700;
  color:#78849A;margin-bottom:2px}
.mg .eg-me2-body>div>b{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  font-size:14.5px;font-weight:900;color:var(--mg-navy);line-height:1.4}
.mg .eg-me2-at{flex:1 1 15em}
.mg .eg-me2-at span{display:block;font-size:11.5px;font-weight:500;color:#5B6B86;
  margin-top:1px}
.mg .eg-me2-note{margin:0 15px 11px;font-size:12.5px;font-weight:600;color:#3E4F6E}
.mg .eg-me2 .eg-acts{margin:0 0 0 auto;align-self:flex-end}

.mg-verdict{
  display:flex;align-items:center;gap:14px;
  border:1px solid var(--mg-line-s);border-radius:var(--mg-round);
  padding:10px 14px;margin-bottom:10px;box-shadow:var(--mg-pop);
}
.mg-verdict img{width:52px;height:52px;flex:none}
.mg-verdict b{display:block;font-size:16px;font-weight:900;line-height:1.3}
.mg-verdict p{margin:3px 0 0;font-size:12.5px;font-weight:500;color:#3E4F6E}
.mg-verdict.go{background:#E7F5E5;border-color:var(--mg-leaf)}
.mg-verdict.go b{color:#0C5E06}
.mg-verdict.wait{background:#FFF6DF}
.mg-verdict.miss{background:var(--mg-sky)}

/* ---------------------------- 事務所対決 --------------------------------
   One scale for every bar, a notch where the van starts coming, and the
   leader at the top. The colour says the same thing the words beside it
   do: green once an office is getting a delivery, royal while it is still
   collecting, grey when nobody there has asked.
------------------------------------------------------------------------ */
.mg .mg-vs-pic{margin-bottom:10px}
.mg .eg-vs-top{display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-bottom:11px}
.mg .eg-vs-top img{width:52px;height:52px;flex:none}
.mg .eg-vs-top>div{display:flex;align-items:baseline;gap:5px}
.mg .eg-vs-top em{font-style:normal;font-size:12px;font-weight:700;color:#5B6B86;
  margin-right:4px}
.mg .eg-vs-top b{font-size:30px;font-weight:900;line-height:1;color:var(--mg-navy)}
.mg .eg-vs-top>div span{font-size:13px;font-weight:700;color:#5B6B86}
.mg .eg-vs-top p{flex:1 0 100%;margin:0;font-size:12.5px;font-weight:900;
  color:var(--mg-royal);text-align:right}
.mg .eg-vs-top p.warn{color:#B3261E}

.mg .eg-vs-rows{list-style:none;margin:0;padding:0;display:grid;gap:0}
/* Name, dots, verdict, count — one line per office. It was two lines with
   a bar on the first and 佐野's sentence on the second, which ran the card
   to 530px for seven offices; this is 270. */
.mg .eg-vs-rows li{
  /* The dots take their natural width — a grid column is shared, so it is
     the widest row's dots and no more. A fixed 150px here gave four dots
     the room for eleven and clipped 「あと2パックでお届け」 to 「…でお…」,
     which is the half that says nothing. */
  display:grid;grid-template-columns:6.1em auto minmax(0,1fr) 1.8em;
  align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid var(--mg-line);
}
.mg .eg-vs-rows li:first-child{padding-top:1px}
.mg .eg-vs-rows li:last-child{border-bottom:0;padding-bottom:1px}
.mg .eg-vs-n{font-size:12px;font-weight:900;color:var(--mg-navy);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* One dot per pack. b is a dot, s is the お届けライン between two of them. */
/* Capped and wrapping, so one enormous week cannot push the sentence out. */
.mg .eg-vs-p{display:flex;flex-wrap:wrap;align-items:center;gap:3px;max-width:170px}
.mg .eg-vs-p b{display:block;width:10px;height:10px;border-radius:50%;
  background:#EDF1F8;box-shadow:inset 0 0 0 1px var(--mg-line-s)}
.mg .eg-vs-p b.on{background:var(--mg-royal);box-shadow:none}
.mg .eg-vs-rows li.go .eg-vs-p b.on{background:var(--mg-leaf)}
.mg .eg-vs-p s{display:block;width:2px;height:13px;margin:0 2px;border-radius:1px;
  background:var(--mg-navy);opacity:.4;text-decoration:none}
.mg .eg-vs-v{font-size:13px;font-weight:900;color:var(--mg-navy);
  font-variant-numeric:tabular-nums;text-align:right}
.mg .eg-vs-s{font-style:normal;font-size:11px;font-weight:700;color:#5B6B86;
  text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mg .eg-vs-rows li.go .eg-vs-s{color:var(--mg-leaf)}
.mg .eg-vs-rows li.miss .eg-vs-n,.mg .eg-vs-rows li.miss .eg-vs-v{color:#9AA5B5}
/* On a phone there is no room for 「あと2パックでお届け」 beside the dots,
   and a clipped 「あと2パックでお…」 is the half that says nothing. It drops
   under them, where it starts at the dots rather than at the card edge. */
@media(max-width:620px){
  .mg .eg-vs-rows li{grid-template-columns:5.4em minmax(0,1fr) 1.8em;
    grid-template-areas:'n p v' '. s s';gap:2px 8px;padding:7px 0}
  .mg .eg-vs-n{grid-area:n} .mg .eg-vs-p{grid-area:p} .mg .eg-vs-v{grid-area:v}
  .mg .eg-vs-s{grid-area:s;text-align:left}
}

/* --------------------------- モラエッグの1週間 --------------------------
   Four steps in the order they happen. Three loose dates told you when
   but never what happens between them, and 佐野 asked for the rule itself
   on the page — the week only makes sense as a sequence.
------------------------------------------------------------------------ */
/* Her schedule artwork above the live dates. Capped by height, because
   the square card and the wide strip are very different shapes and a
   width cap that suits one lets the other own the column. */
.mg .mg-sched-pic{display:block;margin-bottom:10px}
/* Big enough to read. Her 初回の受付スタート card has the dates printed
   inside it, so shrinking it to a thumbnail turns a card people are meant
   to read into decoration. */
.mg .mg-sched-sq{max-height:340px;width:auto;max-width:100%;margin:0 auto 10px;display:block}
@media(min-width:620px){.mg .mg-sched-sq{max-height:320px}}
/* The wide weekly strip is a band, not a card — it has room at a third of
   the height. */
.mg .mg-sched-pic .mg-sched-sq{max-height:340px}
@media(min-width:620px){.mg .mg-sched-pic .mg-sched-sq{max-height:140px;width:100%}}
/* 初回の受付スタート, in the right-hand column since 2026/11/08. That
   column is its own width (430px at a desk, the screen on a phone), so
   the square fills it exactly and there is no cream either side. */
/* 初回の受付スタート, at the head of the right-hand column. Capped
   rather than filling it: at the column's full 430px the picture was the
   loudest thing on the page, over a card that says the same dates in
   words. */
.mg .mg-first-pic{display:block;width:100%;max-width:330px;height:auto;
  margin:0 0 12px auto}
.mg .eg-sched{padding:12px 14px}
.mg .eg-steps{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.mg .eg-steps li{display:flex;align-items:baseline;gap:9px;
  padding:5px 10px;border:1px solid var(--mg-line-s);border-radius:9px;
  background:var(--mg-paper)}
.mg .eg-steps li.now{background:var(--mg-sun)}
.mg .eg-steps em{font-style:normal;font-size:12px;font-weight:900;
  color:var(--mg-navy);min-width:4.2em}
.mg .eg-steps b{font-size:13.5px;font-weight:900;color:var(--mg-navy)}
/* The same four dates as the picture above, in one line rather than four
   boxes: here to be authoritative, not to be read twice. */
.mg .eg-sched-one{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0}
.mg .eg-sched-one span{display:inline-flex;align-items:baseline;gap:5px}
.mg .eg-sched-one em{font-style:normal;font-size:11.5px;font-weight:700;color:#5B6B86}
.mg .eg-sched-one b{font-size:13px;font-weight:900;color:var(--mg-navy)}
.mg .eg-sched-r{margin:9px 0 0;font-size:12px;font-weight:700;color:#5B6B86}
.mg .eg-sched-h{margin:4px 0 0;font-size:12px;font-weight:900;color:var(--mg-royal)}
@media(min-width:620px){
  /* Across rather than down once there is room: the four steps are one
     line of a week, not a list of four things. */
  .mg .eg-steps{grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
  .mg .eg-steps li{flex-direction:column;align-items:flex-start;gap:1px}
}

/* ------------------------------- the race ------------------------------- */
.mg .eg-race-top{display:flex;align-items:center;gap:11px;margin-bottom:10px}
.mg .eg-race-top img{width:50px;height:50px;flex:none}
.mg .eg-race-n{font-size:26px;font-weight:900;line-height:1;color:var(--mg-navy)}
.mg .eg-race-u{font-size:13px;font-weight:700;color:#5B6B86;margin-left:6px}
.mg .eg-race-s{font-size:12.5px;font-weight:900;margin:3px 0 0;color:var(--mg-royal)}
.mg .eg-race-s.win{color:var(--mg-leaf)}

/* One plot area with one outline. Boxing each day separately turned a
   seven-day week into seven empty containers, and the day that actually
   had eggs in it read as the odd one out. */
.mg .eg-race-ch{
  position:relative;display:grid;grid-template-columns:repeat(7,1fr);
  gap:6px;height:96px;padding:6px 6px 22px;
  background:#FFFDF6;border:1px solid var(--mg-line-s);border-radius:14px;
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
  position:absolute;bottom:-19px;left:0;right:0;text-align:center;
  font-style:normal;font-size:11px;font-weight:700;color:#5B6B86;
}
.mg .eg-race-col.today em{color:var(--mg-navy);font-weight:900}
.mg .eg-race-line{
  position:absolute;left:7px;right:7px;height:0;
  border-top:2px dashed rgba(11,41,106,.45);pointer-events:none;
}
.mg .eg-race-line b{
  position:absolute;right:0;top:-12px;font-size:11px;font-weight:900;
  color:var(--mg-navy);background:var(--mg-sun);
  border:0;background:var(--mg-sky);border-radius:6px;padding:1px 9px 2px;
}
@media(prefers-reduced-motion:reduce){.mg .eg-race-seg{transition:none}}

/* ------------------------------- the lists ------------------------------ */
.mg .eg-hist li,.mg .eg-days li,.mg .eg-mini li,.mg .eg-hand li,.mg .eg-offs li{
  border-top:1px solid var(--mg-line);font-weight:700;color:var(--mg-navy);
}
.mg .eg-hist li:first-child,.mg .eg-days li:first-child,
.mg .eg-mini li:first-child,.mg .eg-hand li:first-child,
.mg .eg-offs li:first-child{border-top:0}
.mg .eg-mini li,.mg .eg-hist li,.mg .eg-days li{font-size:13px;padding:6px 0}
/* 目的の内訳 is two figures, not a list. As ruled rows across a wide
   column they were a label at one edge and a number at the other with
   400px of nothing between them, which is the scattered look this page
   was supposed to lose. Two chips instead, sized to their contents.
   .eg-mini.eg-mini2 and not .eg-mini2 alone: the plain .eg-mini rules
   set the rule-above and the space-between, and some of them come later
   in this stylesheet, so at equal weight they would win. */
.mg .eg-mini.eg-mini2{display:flex;flex-wrap:wrap;gap:8px}
.mg .eg-mini.eg-mini2 li{
  display:inline-flex;align-items:baseline;gap:8px;justify-content:flex-start;
  border-top:0;padding:5px 13px;border-radius:999px;background:var(--mg-sky);
  font-size:12.5px;
}
.mg .eg-mini.eg-mini2 li b{font-size:14px;font-weight:900}
.mg .eg-days li.on{color:var(--mg-royal)}
.mg .eg-hand li.done .eg-hand-n{color:#8C96A8}
.mg .eg-notes li{
  background:var(--mg-sky);border:1px solid var(--mg-line-b);border-radius:10px;
  padding:6px 11px;margin-bottom:6px;font-size:12.5px;font-weight:500;
  color:var(--mg-navy);list-style:none;
}
.mg .eg-notes li:last-child{margin-bottom:0}

/* ------------------------------- the bars ------------------------------- */
.mg .eg-ch{font-size:12.5px;font-weight:900;color:var(--mg-navy);margin:0 0 7px}
/* A label, a track and the count. The row IS the grid — without it the list
   falls back to bullets and every bar collapses to nothing, which is
   exactly what happened when this stylesheet was rewritten. */
.mg .eg-bars{list-style:none;margin:0;padding:0;display:grid;gap:4px}
/* The track is capped rather than elastic. A count of two says the same
   thing in 230px as it does in 1100, and at full width the chart was
   mostly the space between the label and the number. */
.mg .eg-bars li{display:grid;grid-template-columns:7em minmax(0,230px) 1.9em;
  align-items:center;gap:9px}
.mg .eg-bl{font-size:12px;font-weight:700;color:#3E4F6E;text-align:right;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mg .eg-bt{display:block;height:16px;background:#FFFDF6;
  border:1px solid var(--mg-line-s);border-radius:6px;overflow:hidden}
.mg .eg-bt i{display:block;height:100%;background:var(--mg-royal);
  border-radius:0 4px 4px 0;transition:width .4s cubic-bezier(.34,1.3,.64,1)}
.mg .eg-bars li.lead .eg-bt i{background:var(--mg-leaf)}
.mg .eg-bn{font-size:13px;font-weight:900;color:var(--mg-navy);
  font-variant-numeric:tabular-nums}
@media(prefers-reduced-motion:reduce){.mg .eg-bt i{transition:none}}
.mg .eg-nn{font-size:12px;font-weight:700;color:#3E4F6E;margin:6px 0 0}
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
/* No border of its own: every row inside is already a bordered tile, and
   a box around the three of them drew a second line that met the first at
   every corner. */
/* 印刷して使えます: one row — what is on the sheet, and the button. */
.mg .mg-printone{display:flex;align-items:center;gap:13px;flex-wrap:wrap;
  padding:10px 14px}
.mg .mg-printone-pics{display:flex;align-items:center;gap:7px;flex:none}
.mg .mg-printone-pics img{height:38px;width:auto;border-radius:5px}
.mg .mg-printone-t{min-width:0;margin-right:auto}
.mg .mg-printone-t b{display:block;font-size:13.5px;font-weight:900;
  color:var(--mg-navy)}
.mg .mg-printone-t span{font-size:11.5px;font-weight:500;color:#5B6B86}

.mg-print{display:grid;gap:11px}
.mg-print a span{min-width:0}
.mg-print a{
  display:flex;align-items:center;gap:11px;text-decoration:none;
  border:1px solid var(--mg-line-s);border-radius:14px;padding:9px 13px;
  background:var(--mg-paper);box-shadow:var(--mg-pop-s);color:var(--mg-navy);
}
.mg-print a:hover{background:var(--mg-sky)}
.mg-print img{width:74px;height:auto;border-radius:7px;flex:none}
.mg-print b{font-size:13.5px;font-weight:900;display:block}
.mg-print span{font-size:11.5px;font-weight:500;color:#5B6B86}

/* The same three on the employee page, three across instead of stacked:
   a column of three 95px rows there would add 300px to a column that is
   already the taller of the two. The artwork is a label, a round sticker
   and an egg — three different shapes — so each sits inside a fixed box
   on the cream rather than being cropped to a common one. */
@media(min-width:720px){
  .mg .eg-print3{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .mg .eg-print3 a{flex-direction:column;align-items:stretch;gap:9px;padding:11px}
  .mg .eg-print3 img{width:100%;height:82px;object-fit:contain;
    background:#FFFDF6;border-radius:9px}
  .mg .eg-print3 b{font-size:12.5px;line-height:1.35}
  .mg .eg-print3>a>span{font-size:11px}
}

@media(min-width:900px){
  .mg-body{margin:0 auto;padding:16px 22px 0}
  .mg .mg-subbar{padding:16px 22px 0;max-width:1240px;margin:0 auto}
  .mg .eg-rules.eg-r4{grid-template-columns:repeat(4,minmax(0,1fr))}
  .mg .eg-race-ch{height:112px}
}

/* ========================= layout ========================================
   The arrangement, kept apart from the look. Phones get one column of
   everything; from 900px up each screen is the two-pane shape the rest of
   the app settled on — what you do on the left, how the week is going on
   the right, and no scrolling between them.
------------------------------------------------------------------------- */

/* 配布 */
.mg .eg-p2{display:grid}
/* On a phone the dates come first. 佐野, 2026/11/11: the card with the
   week's four dates in it is the one thing on this page that is about
   when, and on a narrow screen it was below the request and the rules.
   The right-hand column dissolves into the grid so that its first card
   can be ordered to the top on its own, and これまでの申請 — the other
   thing in it — stays where it was, after the reader's own week. */
@media(max-width:899px){
  .mg .eg-p2-r{display:contents}
  .mg .eg-p2-r .mg-weekcard{order:-1}
}
/* On a phone the person's own column comes first, then the charts.
   The charts led until 2026/11/06, and on 配布状況 that was right —
   the chart was the page and the answer. Now that the request form
   lives here too, leading with them meant a full screen of other
   people's offices before you reached your own week or the thing you
   came to do. Desktop is unaffected: there they are side by side. */
.mg .eg-row2{display:grid;gap:13px}
/* Two cards of the same size, side by side. On a phone they stack, which
   is the only thing that fits; from 720px up they are a row. */
.mg .eg-pair{display:grid;gap:0 18px}
@media(min-width:720px){
  /* Stretch, not start: a pair reads as one answer only if the two cards
     are the same shape. Left to their contents they end 80px apart and
     the row looks like two things that happen to be near each other. */
  .mg .eg-pair{grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch}
  .mg .eg-pair>.card{height:calc(100% - 12px)}
}
/* The two cards that are the page: the full width of it, stacked. Their
   own block under both columns, so neither column's height can squeeze
   them. */
.mg .eg-wide{display:block;margin-top:13px}
.mg .eg-wide>.card{margin-bottom:11px}
/* 毎週のルール・これまでの申請・印刷して使えます: read once, then known.
   A band of their own under the week, two across from 760px and three
   from 900, so the page ends in one even row instead of three cards
   hanging off the bottom of whichever column had room. */
.mg .eg-ref{display:block;margin-top:4px}
.mg .eg-ref .sechead:first-child{margin-top:13px}
@media(min-width:760px){
  /* Two rules to a row, so four of them are a card two lines deep
     rather than a column of four. */
  .mg .eg-ref .eg-r2{grid-template-columns:repeat(2,minmax(0,1fr));
    column-gap:26px}
}
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
.mg .eg-hist li{display:grid;grid-template-columns:7em minmax(0,1fr) 4.2em 6.6em;
  align-items:center;gap:9px}
.mg .eg-hist li>span:first-child{white-space:nowrap}
.mg .eg-hist em{font-style:normal;text-align:right;color:#5B6B86}
.mg .eg-mini li,.mg .eg-days li{display:flex;justify-content:space-between;gap:11px}
.mg .eg-where{display:grid;gap:0;line-height:1.5}
.mg .eg-where b{font-size:14px}
.mg .eg-where span,.mg .eg-where em{font-size:12.5px}
.mg .eg-shut{display:flex;align-items:center;gap:13px}
.mg .eg-shut img{width:66px;height:66px;flex:none}
.mg .eg-shut p{margin:0}
/* 今週はお休みです, and whatever an administrator wrote about this week. */
.mg .eg-off{display:flex;align-items:center;gap:13px}
.mg .eg-off img{width:66px;height:66px;flex:none}
.mg .eg-off p{margin:3px 0 0}
.mg .eg-sched-n{margin:6px 0 0;font-size:12px;font-weight:700;color:var(--mg-navy)}

/* スケジュール設定: one row per week, and a week that has been touched is
   marked so the exceptions can be found without reading all eight. */
.mg .eg-wks{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:7px}
.mg .eg-wks li{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;
  padding:8px 10px;border-radius:10px;background:var(--mg-sky)}
.mg .eg-wks li.on{background:#FFF6DC;box-shadow:inset 0 0 0 1px var(--mg-sun)}
.mg .eg-wks b{font-size:12.5px;white-space:nowrap}
.mg .eg-wk-t{display:flex;gap:5px;flex-wrap:wrap}
.mg .eg-wk-t .eg-opt{padding:3px 9px;font-size:11.5px}
.mg .eg-wk-d,.mg .eg-wk-n{grid-column:1/-1;width:100%;box-sizing:border-box;
  padding:5px 8px;border:1px solid var(--mg-dot);border-radius:8px;font-size:12px}
/* The four dates of a changed week, in the order they happen. */
.mg .eg-wk-ds{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.mg .eg-wk-ds label{display:flex;flex-direction:column;gap:2px}
.mg .eg-wk-ds span{font-size:10.5px;color:#5B6B86}
.mg .eg-wk-ds input{width:100%;box-sizing:border-box;padding:4px 6px;
  border:1px solid var(--mg-dot);border-radius:7px;font-size:11.5px}
@media(max-width:700px){ .mg .eg-wk-ds{grid-template-columns:repeat(2,1fr)} }
.mg .eg-wk-a{grid-column:1/-1;font-size:11px;color:#5B6B86}

/* 需要調査 */
.mg .eg-sv-form .eg-fq{margin-bottom:15px}
.mg .eg-sv-form .eg-fq:last-child{margin-bottom:0}
.mg .eg-fq-row{display:grid;gap:15px}
.mg .eg-send{display:flex;flex-direction:column;align-items:flex-start}
.mg .eg-send .fld{width:100%}
.mg .eg-note-why{margin:-6px 0 0}
.mg .eg-sv-go{display:flex;align-items:center;gap:15px;flex-wrap:wrap;
  padding-top:14px;margin-top:4px;border-top:1px solid var(--mg-line)}
.mg .eg-sv-go p{margin:0;order:2}
.mg .eg-win{display:block;font-size:12.5px;font-weight:900;color:var(--mg-royal);margin-top:5px}
.mg .mg-win{display:flex;align-items:center;gap:11px;padding:8px 11px}
.mg .mg-win-pic{width:46px;height:46px;flex:none;border-radius:10px;
  border:1px solid var(--mg-line-s)}
.mg .mg-win b{font-size:14px;font-weight:900}
.mg .mg-win p{margin:0;display:inline}
/* Title, what it is for and the dates on one line apiece rather than a
   portrait and three stacked paragraphs. */
.mg .mg-win>div{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 9px}
.mg .mg-win .eg-win{margin-top:0}
.mg .eg-two{display:grid;gap:6px}

/* --------------------------- 需要調査, laid out -------------------------
   Everything used to run the full width in one column: a bar standing for
   a count of two, stretched across 1100px, under a heading of its own.
   The answers are the wide thing, so they take the width; what you said
   yourself and what everyone else wrote sit in a rail beside them. Placed
   explicitly, so the stack on a phone still reads in the order it should:
   your answer, then everyone's, then the comments.
------------------------------------------------------------------------ */
.mg .eg-svb{display:grid}
@media(min-width:980px){
  .mg .eg-svb{grid-template-columns:316px minmax(0,1fr);gap:0 18px;
    align-items:start;grid-template-rows:min-content auto}
  .mg .eg-svb .sv-side{grid-column:1}
  .mg .eg-svb .sv-res{grid-column:2;grid-row:1/-1}
}

/* 丹波 */
.mg .eg-farm{display:grid}
/* On a phone the day's entry comes first. The week and the shipping
   decision are the bigger things, and they sit first on a desk where
   both columns are visible at once — but six mornings out of seven the
   only thing anybody does on this screen is type today's count, and on
   a phone that was third, under two cards about a job done on Mondays.
   (The portal next door flipped the opposite way for the same reason:
   there the second column is reference, here it is the work.) */
.mg .eg-farm-c{display:grid;gap:9px}
.mg .eg-farm-c>p{margin:0}

/* 今日の取れ高: a figure to type, not a button to tap thirty times. */
.mg .eg-today{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.mg .eg-today em{font-style:normal;font-size:12.5px;font-weight:700;color:#5B6B86;
  flex:1 0 100%}
.mg .eg-today>span{font-size:13px;font-weight:700;color:#3E4F6E}

.mg .eg-n,.mg .eg-n-big{
  font-family:inherit;font-weight:900;color:var(--mg-navy);text-align:right;
  background:#FFFDF6;border:1px solid var(--mg-line-s);border-radius:11px;
}
.mg .eg-n{width:5.2em;padding:5px 9px;font-size:14px}
/* A button with nothing to save. The app's own disabled style landed on
   #B3BEC2 under #9AA3B2 text here, which is a muddy slab; this is plainly
   off without being a smudge. */
.app.mg .btn:disabled,.app.mg .btn.primary:disabled{
  background:#EDEFF4;color:#8C96A8;border-color:#DCE1EA;box-shadow:none}
/* No spinner. A pair of 8px arrows beside a figure somebody types once a
   day is a target nobody wants and a way to be one out. type=number
   stays, for the numeric keypad on a phone. */
.app.mg .eg-n::-webkit-outer-spin-button,.app.mg .eg-n::-webkit-inner-spin-button,
.app.mg .eg-n-big::-webkit-outer-spin-button,.app.mg .eg-n-big::-webkit-inner-spin-button{
  -webkit-appearance:none;margin:0}
.app.mg .eg-n,.app.mg .eg-n-big{-moz-appearance:textfield;appearance:textfield}
/* The one number this screen exists to take, so it is the size of the
   answer rather than the size of a form field. */
.mg .eg-n-big{width:3.4em;padding:4px 10px;font-size:34px;line-height:1.15}
.mg .eg-n:focus,.mg .eg-n-big:focus{
  background:#fff;outline:none;box-shadow:0 0 0 3px rgba(255,198,47,.55)}
.mg .eg-n:disabled,.mg .eg-n-big:disabled{
  background:#EEF1F6;border-color:#B9C4D4;color:#7A879B}

/* 丹波の取れ高 vs みんなのリクエスト — its own card on 配布状況.

   The two numbers are the same size and the same weight because the
   whole point is the comparison; making the harvest larger would answer
   the question before the reader has looked. */
.mg .eg-hvs{padding:12px 16px 13px}
.mg .eg-hvs-row{display:flex;align-items:center;justify-content:center;gap:clamp(10px,4vw,34px)}
.mg .eg-hvs-side{display:flex;flex-direction:column;align-items:center;gap:1px;
  flex:1 1 0;min-width:0}
.mg .eg-hvs-side em{font-style:normal;font-size:12px;font-weight:700;color:#5B6B86;
  text-align:center;line-height:1.3}
.mg .eg-hvs-side b{font-size:clamp(34px,9vw,46px);font-weight:900;color:var(--mg-navy);
  line-height:1.05}
.mg .eg-hvs-side span{font-size:12.5px;font-weight:700;color:#3E4F6E}
.mg .eg-hvs-vs{flex:none;width:50px;height:50px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  background:var(--mg-sun);border:1px solid var(--mg-line-s);
  color:var(--mg-navy);font-size:17px;font-weight:900;letter-spacing:.02em;
  box-shadow:var(--mg-pop-s)}
/* The sentence that says what the difference means, across the full
   width — it is a sentence, not a caption, and a shortfall says what
   happens next. */
/* The week as one track: requests fill it from the left, what is left
   over is the empty part. A dotted rule used to separate the sentence
   from the numbers; the bar does that job and carries information too. */
.mg .eg-hvs-bar{position:relative;height:9px;margin:11px 0 8px;border-radius:999px;
  background:#EDF1F8;border:1px solid var(--mg-line);overflow:hidden}
.mg .eg-hvs-bar i{display:block;height:100%;background:var(--mg-royal);
  border-radius:999px 0 0 999px;
  transition:width .45s cubic-bezier(.34,1.3,.64,1)}
.mg .eg-hvs-bar.warn i{background:#B3261E}
@media(prefers-reduced-motion:reduce){.mg .eg-hvs-bar i{transition:none}}
/* 残り45% at the left, her sentence at the right. Baseline-aligned, so
   the big number and the sentence sit on one line rather than two blocks
   of centred text stacked on each other. */
.mg .eg-hvs-foot{display:flex;align-items:baseline;justify-content:space-between;
  gap:12px;flex-wrap:wrap}
.mg .eg-hvs-foot b{font-size:17px;font-weight:900;color:var(--mg-navy);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.mg .eg-hvs-foot b.warn{color:#B3261E}
.mg .eg-hvs-foot p{margin:0;font-size:12.5px;font-weight:700;
  color:var(--mg-green);line-height:1.55;text-align:right;flex:1 1 11em}
.mg .eg-hvs-foot p.warn{color:#B3261E}

/* 日ごとの取れ高 — seven cells under the week's total, one per day. A
   staircase chart had a section of its own for this; the figures are the
   part people wanted and they fit on one line. */
.mg .eg-hvs-days{margin-top:10px;padding-top:9px;
  border-top:1px solid var(--mg-line)}
.mg .eg-hvs-days h4{
  margin:0 0 7px;font-size:11.5px;font-weight:800;color:#5B6B86}
.mg .eg-hvs-days ol{list-style:none;margin:0;padding:0;
  display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
/* justify-content:center because this row is where the card's slack
   ends up. The pair is stretched so the two cards end on one line, and
   whichever is the shorter grows — if its day cells grow with it, the
   figures have to sit in the middle of them or they hang from the top
   with an inch of nothing underneath. */
.mg .eg-hvs-days li{display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:2px;min-height:44px;
  padding:5px 0 6px;border-radius:9px;background:var(--mg-sky)}
.mg .eg-hvs-days em{font-style:normal;font-size:10.5px;font-weight:700;color:#5B6B86}
.mg .eg-hvs-days b{font-size:14px;font-weight:900;color:var(--mg-navy);
  font-variant-numeric:tabular-nums}
/* A day with nothing in it is still a day of the week, so it keeps its
   place and loses its weight rather than disappearing. */
.mg .eg-hvs-days li.nil{background:#F7F8FB}
.mg .eg-hvs-days li.nil b{color:#A8B2C2;font-weight:700}
.mg .eg-hvs-days li.today{background:var(--mg-sun)}
.mg .eg-hvs-days li.today em{color:var(--mg-navy)}

/* 丹波: the unit beside each day's figure. */
/* 丹波: the week as seven boxes across, the same seven cells the
   employees' page shows — except these can be typed in. */
.mg .eg-wkdays{list-style:none;margin:0;padding:0;
  display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.mg .eg-wkdays li{display:flex;flex-direction:column;align-items:center;gap:5px;
  padding:8px 4px 9px;border-radius:10px;background:var(--mg-sky)}
.mg .eg-wkdays li.on{background:var(--mg-sun)}
/* A day still to come: present, so the week is a week, and shut. */
.mg .eg-wkdays li.soon{background:#F5F7FB}
.mg .eg-wkdays li.soon em{color:#A8B2C2}
.mg .eg-wkdays em{font-style:normal;font-size:11px;font-weight:800;color:#5B6B86}
.mg .eg-wkdays li.on em{color:var(--mg-navy)}
.mg .eg-wkdays .eg-n{width:100%;padding:5px 2px;font-size:15px;text-align:center}
/* Today's cell is the figure from the box above, not a second box for it. */
.mg .eg-wkd-v{display:block;padding:5px 2px;font-size:16px;font-weight:900;
  color:var(--mg-navy);text-align:center;font-variant-numeric:tabular-nums}
.mg .eg-day-v{display:inline-flex;align-items:baseline;gap:6px}
.mg .eg-day-v i{font-style:normal;font-size:12px;font-weight:700;color:#5B6B86}

/* 今週の取れ高 — the main box, and the figure the shipping decision is
   made on, so the two sit in the same column.

   eg-hv and not eg-wk: .eg-wk and .eg-wk-n are the admin schedule
   editor's, further up this file, and borrowing the names gave this card
   that screen's sky background and its full-width grid row. Second time
   a new class has collided with an old one here — the file is long
   enough that a name has to be grepped before it is used. */
.mg .eg-hv{display:grid;gap:4px}
/* The week's two totals, between today's box and the seven cells. One
   baseline for both, so 今週の取れ高 21 パック and 今週のリクエスト合計 18
   read as one line rather than two stacked at different heights. */
.mg .eg-farm-c .eg-hv-top{margin-top:4px;padding-top:12px;
  border-top:1px solid var(--mg-line);align-items:baseline}
.mg .eg-farm-c .eg-hv-ask{flex-direction:row;align-items:baseline;gap:8px}
.mg .eg-farm-c .eg-hv-ask b{font-size:20px}
.mg .eg-hv-top{display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap;
  padding-bottom:11px;margin-bottom:4px;border-bottom:1px solid var(--mg-line)}
.mg .eg-hv-n{display:flex;align-items:baseline;gap:7px;margin-right:auto}
.mg .eg-hv-n em{font-style:normal;font-size:11.5px;font-weight:700;color:#5B6B86}
.mg .eg-hv-n b{font-size:30px;font-weight:900;color:var(--mg-navy);line-height:1}
.mg .eg-hv-n span{font-size:14px;font-weight:700;color:#3E4F6E}
/* Which shipment the seven days belong to, set small beside the total:
   a label, not a second figure competing with it. */
.mg .eg-hv-for{font-style:normal;font-size:11px;font-weight:700;color:#8894A8;
  padding-left:2px}
.mg .eg-hv-note{margin:6px 0 0}
.mg .eg-hv-ask{display:flex;flex-direction:column;align-items:flex-end}
.mg .eg-hv-ask em{font-style:normal;font-size:11.5px;color:#5B6B86}
.mg .eg-hv-ask b{font-size:20px;font-weight:800;color:var(--mg-navy)}
.mg .eg-hv .eg-days li{align-items:center}

/* 事務所 */
.mg .eg-off{display:grid}
.mg .eg-off-bar{display:flex;align-items:center;gap:13px;flex-wrap:wrap}
.mg .eg-off-bar>span{margin-left:auto;font-size:12.5px;font-weight:700}
.mg .eg-arr{display:flex;align-items:center;gap:13px}
.mg .eg-arr-n{margin-left:auto;font-size:17px;font-weight:900}
/* Each li is its own grid, so an auto-width button column made every row a
   different width: お渡し済み✓ is wider than お渡しした, which ate into
   the 1fr beside it and left the pack counts at four different x. The
   button column is fixed and the buttons fill it, so the three columns
   line up down the card. */
.mg .eg-hand li{display:grid;grid-template-columns:minmax(0,1fr) 5.4em 8.6em;
  align-items:center;gap:11px;padding:7px 0}
.mg .eg-hand-n{font-size:14px;font-weight:700}
.mg .eg-hand b{font-size:12.5px;font-weight:700;color:#3E4F6E;text-align:right;
  font-variant-numeric:tabular-nums}
.mg .eg-hand li>.btn{width:100%;justify-self:end;padding-left:6px;padding-right:6px}

/* 管理 */
.mg .eg-adm{display:grid}
.mg .eg-offs li{display:grid;
  grid-template-columns:6.4em minmax(0,1fr) 9.5em 4.6em auto auto;
  align-items:center;gap:8px;padding:7px 0}
.mg .eg-offs li>b{font-size:14px;font-weight:900}
.mg .eg-offs-on{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700}
.app.mg .eg-offs-m{text-align:center}
.mg .eg-offs-add{display:grid;grid-template-columns:6.4em minmax(0,1fr) auto;gap:9px;
  margin-top:11px;padding-top:11px;border-top:1px solid var(--mg-line)}
.mg .eg-draw{display:flex;align-items:center;gap:13px;flex-wrap:wrap}
.mg .eg-draw-r{margin:0;font-size:12.5px;font-weight:700}
.mg .eg-draw>p.muted{flex:1 1 100%;margin:0}
/* 今週の結果: one line per office, the number set apart so the column of
   them reads down without the eye hunting for it. */
.mg .eg-res-l{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:6px}
.mg .eg-res-l li{display:grid;grid-template-columns:1fr auto;align-items:baseline;
  gap:4px 10px;padding:7px 10px;border-radius:10px;background:var(--mg-sky)}
.mg .eg-res-l li.warn{background:#FDECEA;box-shadow:inset 0 0 0 1px rgba(179,38,30,.35)}
.mg .eg-res-l b{font-size:13px}
.mg .eg-res-n{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.mg .eg-res-l small{grid-column:1/-1;font-size:11.5px;color:#5B6B86}
.mg .eg-res>p.muted{margin:0 0 4px}
.mg .eg-vs-req{display:flex;align-items:baseline;gap:6px;margin-left:auto;
  font-size:12px;color:#5B6B86}
.mg .eg-vs-req b{font-size:14px;font-weight:800;color:var(--mg-navy)}
/* 所在地 under the office name: a second line, quieter, and it wraps
   rather than stretching the button it sits in. */
.mg .eg-opt-loc{display:block;margin-top:2px;font-size:10.5px;font-weight:600;
  line-height:1.35;color:#5B6B86;white-space:normal}
/* The address on the chosen office. It was white, which is what the chip
   looked like when the selected state was royal; the selected state is
   her sun yellow and white on #FFC62F is 1.8:1 — the address went blank
   the moment it was picked. */
.mg .eg-opt.on .eg-opt-loc{color:#4A5A74}
/* 確認中: a quiet badge beside the heading and a line under the lead, so
   the numbers below can be read while it is clear they are not yet an
   answer. Not a warning colour — nothing is wrong, it is just not done. */
/* 事業所の設定: a card per office, two fields across on a desk and one on
   a phone, so nothing has to be scrolled sideways to be set. */
.mg .eg-offc{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:10px}
.mg .eg-offc li{display:grid;grid-template-columns:minmax(0,1fr) 8.5em auto;gap:8px 12px;
  padding:11px 13px;border-radius:12px;background:var(--mg-sky)}
.mg .eg-offc li.off{opacity:.6}
.mg .eg-offc-h{grid-column:1/-1;display:flex;align-items:center;gap:12px}
.mg .eg-offc-h b{font-size:14px}
.mg .eg-offc-h .eg-offs-on{margin-left:auto;font-size:11.5px}
.mg .eg-offc .fld{margin:0}
.mg .eg-offc .fld span{font-size:11px;color:#5B6B86}
.mg .eg-offc input,.mg .eg-offc select{width:100%;box-sizing:border-box;
  padding:6px 8px;border:1px solid var(--mg-dot);border-radius:8px;font-size:12.5px}
.mg .eg-offc-m input{width:6em}
/* 削除 beside the two fields, not on a line of its own under them. The
   half-and-half columns gave the address box the same width as a
   two-digit number and then truncated 「兵庫県神戸市中央区京町75-1 京町栄
   ビル」 to 「…京町栄」 — the one field on this screen where the whole
   value matters, since it is what the result mail prints. */
.mg .eg-offc>li>button{align-self:end;margin-bottom:1px}
@media(max-width:620px){
  .mg .eg-offc li{grid-template-columns:minmax(0,1fr) 8.5em}
  .mg .eg-offc>li>button{grid-column:1/-1;justify-self:end}
}

/* 発送の確定: two steps, and the second is only reachable once the first
   has happened, so they read down rather than sitting side by side. */
.mg .eg-sub2{margin:0 0 12px}
.mg .eg-ship-1,.mg .eg-ship-2{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
.mg .eg-ship-1 .fld{margin:0}
.mg .eg-ship-1 input{width:7em}
.mg .eg-ship-2 p{flex:1 1 100%;margin:0;font-size:13px;font-weight:700}
.mg .eg-ship-ok{margin:0;font-size:12px;font-weight:800;color:var(--mg-leaf)}
/* 部長's warning, in red above the box it is about: the one way to get a
   week wrong is to confirm it before the deadline. */
.mg .eg-ship-warn{flex:1 1 100%;margin:0 0 2px;font-size:13px;font-weight:800;
  color:#B3261E;line-height:1.5}
/* A step that cannot be taken yet, and the forecast of a week nobody has
   confirmed: there, readable, and plainly not live. */
.mg .eg-dim{opacity:.62;filter:saturate(.55)}
.mg .eg-dim .btn,.mg .eg-dim a.btn{pointer-events:none}
.mg .eg-ship-fc{margin:13px 0 -4px;font-size:12.5px;font-weight:800;
  color:#5B6B86}
/* The question asked before the letters go: it takes the whole width of
   the card so the number in the box above stays readable beside it, and
   it is tinted so that a card waiting for an answer cannot be mistaken
   for one waiting for a press. */
.mg .eg-ship-ask{flex:1 1 100%;margin:2px 0 0;padding:11px 13px 12px;
  border-radius:10px;background:var(--mg-sky)}
.mg .eg-ship-ask p{margin:0;font-size:13px;font-weight:700;color:var(--mg-navy)}
.mg .eg-ship-ask p.muted{margin-top:3px;font-weight:600}
.mg .eg-ship-ask-b{display:flex;gap:8px;margin-top:10px}
/* The two export buttons. Named eg-dl and not eg-exp: that one is
   already the 期限切れ badge, and a second rule under the same name put a
   yellow pill behind both buttons. */
.mg .eg-dl{display:flex;gap:8px;margin-bottom:10px}
.mg .eg-chk{margin-left:auto;padding:2px 9px;border-radius:999px;
  background:var(--mg-sun);font-size:11px;font-weight:800;color:var(--mg-navy)}
.mg .eg-chk-msg{margin:0 0 8px;font-size:12px;font-weight:700;color:var(--mg-navy)}
.mg .eg-go{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:0 0 14px}
.mg .eg-go .btn{font-size:14px;padding:11px 20px}
.mg .eg-bub{position:relative;margin:0;padding:8px 12px;border-radius:12px;
  background:var(--mg-sun);font-size:12px;font-weight:700;color:var(--mg-navy)}
.mg .eg-bub::before{content:'';position:absolute;top:-5px;left:18px;width:10px;height:10px;
  background:var(--mg-sun);transform:rotate(45deg)}
.mg .eg-mine-res{display:flex;flex-direction:column;gap:1px;margin-bottom:10px;
  padding-top:10px;padding-bottom:10px}
.mg .eg-mine-res em{font-style:normal;font-size:11.5px;color:#5B6B86}
.mg .eg-mine-res strong{font-size:16px;color:var(--mg-navy)}

/* ほかの日を修正する: a row per day with the same two controls as today,
   small, because this is the rare case and ＋1パック is the common one. */
.mg .eg-fix{margin-top:12px;border-top:1px solid var(--mg-dot);padding-top:10px}
.mg .eg-fix>b{font-size:12.5px}
.mg .eg-fix>p{margin:3px 0 8px}
.mg .eg-fixl{list-style:none;margin:0;padding:0;display:grid;gap:5px}
.mg .eg-fixl li{display:grid;grid-template-columns:1fr auto auto auto;gap:8px;
  align-items:center;font-size:12.5px}
.mg .eg-fixl b{min-width:22px;text-align:center;font-variant-numeric:tabular-nums}
.mg .eg-farm-sum{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px}
.mg .eg-farm-sum>div{display:flex;flex-direction:column}
.mg .eg-farm-sum em{font-style:normal;font-size:11.5px;color:#5B6B86}
.mg .eg-farm-sum b{font-size:20px;font-weight:800;color:var(--mg-navy);
  font-variant-numeric:tabular-nums}
.mg .eg-farm-sum>p{flex:1 0 100%;margin:0}

/* 毎週のルール: four lines, read once and then recognised, so they are
   set quieter than the dates above them. */
.mg .eg-rules{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.mg .eg-rules li{position:relative;padding-left:18px;font-size:12.5px;line-height:1.55}
.mg .eg-rules li::before{content:'';position:absolute;left:3px;top:7px;width:7px;height:7px;
  border-radius:50%;background:var(--mg-sun)}
.mg .eg-res-l li.head,.mg .eg-res-l li.total{background:none;padding:4px 10px}
.mg .eg-res-l li.head{font-size:11.5px;color:#5B6B86}
.mg .eg-res-l li.total{border-top:1px solid var(--mg-dot);border-radius:0}
/* 受け取る人の一覧: the list an administrator checks against the boxes. */
.mg .eg-res-who{list-style:none;margin:0;padding:0;display:grid;gap:3px}
.mg .eg-res-who li{display:grid;grid-template-columns:1fr auto auto auto;gap:10px;
  align-items:baseline;padding:5px 8px;border-radius:8px;font-size:12.5px}
.mg .eg-res-who li:nth-child(odd){background:var(--mg-sky)}
.mg .eg-res-who li.head{background:none;font-size:11.5px;color:#5B6B86}
.mg .eg-res-who em{font-style:normal;font-weight:800;font-variant-numeric:tabular-nums}
.mg .ad-set,.mg .eg-admin{display:grid;gap:4px}
/* 保存する under the settings it saves, across whatever columns the card
   has split itself into. */
.mg .ad-set-save{grid-column:1/-1;margin-top:4px}
.mg .eg-admin{align-items:end}

@media(min-width:900px){
  .mg .eg-p2{grid-template-columns:minmax(0,1fr) minmax(0,430px);
    align-items:start;column-gap:22px}
  /* The harvest, the race and the day-by-day chart all live on the right
     now, which left that column half as long again as the other. The
     coop news moves under the request side, where there was room. */
  /* Two columns, one row. There used to be a second row for the 鶏舎
     だより and then for the day chart; a row-spanning right column has
     its height shared out across every intrinsic row it spans, so the
     second row opened a gap under the left column whenever the right one
     was the taller. Both have gone back into their own columns. */
  .mg .eg-p2-r{order:0;grid-column:2;grid-row:1}
  .mg .eg-p2-l{grid-column:1;grid-row:1}
  /* Under both of them, the width of the page. */
  .mg .eg-wide{grid-column:1/-1;grid-row:2}
  .mg .eg-ref{grid-column:1/-1;grid-row:3}
  /* 締切・発送・到着・受け取り in the 430px column: two by two. Four across
     is a column each of 95px, and 「11/16（月）9:00」 does not fit one. */
  .mg .eg-p2-r .eg-steps{grid-template-columns:repeat(2,minmax(0,1fr))}
  .mg .eg-row2{grid-template-columns:auto minmax(0,1fr);gap:24px}
  .mg .eg-fq-row{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);
    column-gap:24px;align-items:start}
  .mg .eg-two{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:26px;
    align-items:start}
  .mg .eg-two .eg-bars li{grid-template-columns:7em minmax(0,230px) 1.9em}
  .mg .eg-off{grid-template-columns:minmax(0,340px) minmax(0,1fr);
    align-items:start;column-gap:22px}
  /* The office/week pickers span both columns. */
  .mg .eg-off>.eg-off-bar{grid-column:1/-1}
  .mg .eg-adm{grid-template-columns:minmax(0,1fr) minmax(0,430px);
    align-items:start;column-gap:22px}
  /* 丹波: the week and the shipping decision on the left — that is the
     main column and the one number everything else serves — with today's
     entry and the printables beside it. */
  /* Two halves, not 1fr and 400px: the printables are three across now
     and three tiles in a 400px column are 120px wide. */
  .mg .eg-farm{grid-template-columns:repeat(2,minmax(0,1fr));
    align-items:start;column-gap:22px}
  .mg .ad-set,.mg .eg-admin{grid-template-columns:1fr 1fr;gap:4px 14px}
  .mg .ad-set .fld:last-child{grid-column:span 2}
  .mg .eg-admin>p{grid-column:span 2;margin:0}
  /* 保存 is a button, not a field: it takes the width of its own words
     rather than half the card. */
  .mg .eg-admin>.btn{justify-self:start}
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
