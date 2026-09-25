/* ============================================================================
   モラボット — the mascot, as animated vector art.

   Drawn from 佐野's artwork rather than shipped as images: the arms, feet,
   eyes and antenna are separate shapes, so he can wave, walk, cheer and fall
   over without a single PNG. The whole character is about 4 KB of markup and
   scales to any size.

   Her later poses settled the anatomy the logo left ambiguous — the orange
   bars are ARMS, and the feet are the navy ovals directly under the body.
   The light-blue ovals from the original logo are gone; she dropped them.

   Poses
     idle    standing, breathing, blinking
     hello   the logo's standing drawing, waving — the sign-in screen
     wave    waving, in the action drawing
     walk    a full walk cycle                — today's progress bar
     cheer   arms up with stars               — today reached 5,000
     flag    holding the pennant              — 完歩賞 earned
     tumble  tripped, sweating, still smiling — the period closed short

   cheer / flag / tumble wear her closed smiling eyes; the rest keep the
   open ones from the logo.
========================================================================== */
import React from 'react';

const CLOSED_EYES = new Set(['hello', 'cheer', 'flag', 'tumble']);
/* 'hello' is the standing drawing from the logo — closed eyes, the pale
   blue ovals, the small squared feet. Her action poses drop all three, so
   they are drawn only here, where he is standing still and sits next to
   people's memory of the mark itself. */
const STANDING = new Set(['hello']);

export default function MoraBot({ pose = 'idle', title, style }) {
  const closed = CLOSED_EYES.has(pose);
  const standing = STANDING.has(pose);
  return (
    <svg
      className={`mbot mbot-${pose}`}
      viewBox={pose === 'flag' ? "300 60 1200 1160" : "300 90 1000 1120"}
      style={style}
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
    >
      {pose === 'tumble' && (
        <g className="mb-speed">
          <rect x="330" y="694" width="230" height="42" rx="21" fill="#B0C3EE" />
          <rect x="378" y="784" width="200" height="42" rx="21" fill="#B0C3EE" />
          <rect x="426" y="874" width="170" height="42" rx="21" fill="#B0C3EE" />
          <rect x="474" y="960" width="140" height="42" rx="21" fill="#B0C3EE" />
        </g>
      )}

      <ellipse className="mb-shadow" cx="800" cy="1142" rx="239" ry="45" fill="#DFE2E9" />

      <g className="mb-lean">
        {standing ? (
          <>
            <rect className="mb-foot-l" x="672" y="1055" width="90" height="44" rx="22" fill="#0B2A6B" />
            <rect className="mb-foot-r" x="838" y="1055" width="90" height="44" rx="22" fill="#0B2A6B" />
          </>
        ) : (
          <>
            <ellipse className="mb-foot-l" cx="708" cy="1085" rx="90" ry="51" fill="#0B2A6B" />
            <ellipse className="mb-foot-r" cx="892" cy="1085" rx="90" ry="51" fill="#0B2A6B" />
          </>
        )}

        <g className="mb-body">
          <rect className="mb-arm-l" x="406" y="606" width="78" height="136" rx="39" fill="#FF9934" />
          <g className="mb-arm-r">
            <rect x="1116" y="606" width="78" height="136" rx="39" fill="#FF9934" />
            {pose === 'flag' && (
              <g className="mb-hand">
                <rect x="1147" y="700" width="16" height="360" fill="#0B2A6B" />
                <path className="mb-pennant" d="M1163 918 L1163 1036 L1316 977 Z" fill="#FF9934" />
                <circle cx="1155" cy="764" r="56" fill="#FF9934" />
              </g>
            )}
          </g>

          <rect x="630" y="869" width="340" height="194" rx="70" fill="#138708" />
          <circle cx="800" cy="966" r="50" fill="none" stroke="#FFFFFF" strokeWidth="8" />

          <g className="mb-head">
            <g className="mb-antenna">
              <rect x="790" y="291" width="20" height="70" fill="#0B2A6B" />
              <circle cx="800" cy="251" r="40" fill="#FF9934" />
            </g>
            <rect x="486" y="330" width="628" height="527" rx="150" fill="#1F50B9" />
            <rect x="552" y="435" width="496" height="284" rx="80" fill="#FFFFFF" />

            {closed ? (
              <g fill="none" stroke="#1F50B9" strokeWidth="28" strokeLinecap="round">
                <path d="M630 574 Q686 504 742 574" />
                <path d="M858 574 Q914 504 970 574" />
              </g>
            ) : (
              <g className="mb-eyes">
                <circle cx="686" cy="556" r="70" fill="#1F50B9" />
                <circle cx="686" cy="556" r="40" fill="#FFFFFF" />
                <circle cx="914" cy="556" r="70" fill="#1F50B9" />
                <circle cx="914" cy="556" r="40" fill="#FFFFFF" />
                <g className="mb-pupils">
                  <circle cx="686" cy="556" r="15" fill="#0B2A6B" />
                  <circle cx="914" cy="556" r="15" fill="#0B2A6B" />
                </g>
              </g>
            )}

            <circle cx="600" cy="678" r="34" fill="#FF9934" />
            <circle cx="1000" cy="678" r="34" fill="#FF9934" />
            <path d="M700 640 Q800 730 898 640" fill="none" stroke="#1F50B9" strokeWidth="20" strokeLinecap="round" />

            {pose === 'tumble' && (
              <path className="mb-sweat" d="M1042 404 Q1092 474 1092 500 a50 50 0 0 1-100 0 Q992 474 1042 404 Z" fill="#8ED3F4" />
            )}
          </g>

          {standing && (
            <>
              <ellipse className="mb-oval-l" cx="556" cy="958" rx="44" ry="78" fill="#4A78D6" />
              <ellipse className="mb-oval-r" cx="1044" cy="958" rx="44" ry="78" fill="#4A78D6" />
            </>
          )}
        </g>

        {pose === 'cheer' && (
          <g className="mb-stars" fill="#FF9934">
            <path className="mb-star-a" d="M651 168 L668 214 L717 216 L679 246 L692 293 L651 265 L610 293 L623 246 L585 216 L634 214 Z" />
            <path className="mb-star-b" d="M971 198 L988 244 L1037 246 L999 276 L1012 323 L971 295 L930 323 L943 276 L905 246 L954 244 Z" />
          </g>
        )}
      </g>
    </svg>
  );
}

/* The stylesheet is injected once by App.jsx alongside its own. Keeping it
   here means the character's drawing and its movement stay in one file. */
export const MORABOT_CSS = `
.mbot{display:block;width:100%;height:100%;overflow:visible}
.mbot .mb-lean,.mbot .mb-body,.mbot .mb-head,.mbot .mb-antenna,.mbot .mb-eyes,
.mbot .mb-pupils,.mbot .mb-arm-l,.mbot .mb-arm-r,.mbot .mb-foot-l,.mbot .mb-foot-r,
.mbot .mb-shadow,.mbot .mb-speed,.mbot .mb-sweat,.mbot .mb-star-a,.mbot .mb-star-b,
.mbot .mb-pennant{transform-box:view-box}
.mbot .mb-lean{transform-origin:800px 1100px}
.mbot .mb-body{transform-origin:800px 1000px}
.mbot .mb-head{transform-origin:800px 860px}
.mbot .mb-antenna{transform-origin:800px 361px}
.mbot .mb-eyes{transform-origin:800px 556px}
.mbot .mb-pupils{transform-origin:800px 556px}
.mbot .mb-arm-l{transform-origin:445px 645px}
.mbot .mb-arm-r{transform-origin:1155px 645px}
.mbot .mb-foot-l{transform-origin:708px 1085px}
.mbot .mb-foot-r{transform-origin:892px 1085px}
.mbot .mb-shadow{transform-origin:800px 1142px}
.mbot .mb-pennant{transform-origin:1163px 977px}
.mbot .mb-oval-l,.mbot .mb-oval-r{transform-box:view-box}
.mbot .mb-oval-r{transform-origin:1044px 1030px}

/* A face that never blinks reads as a picture; one that does reads as
   somebody being there. Every pose keeps it. */
@keyframes mbBlink{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
.mbot .mb-eyes{animation:mbBlink 5.2s infinite}

@keyframes mbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-16px)}}
@keyframes mbTilt{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}
@keyframes mbAnt{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}

.mbot-idle .mb-body{animation:mbFloat 3.4s ease-in-out infinite}
.mbot-idle .mb-head{animation:mbTilt 5s ease-in-out infinite}
.mbot-idle .mb-antenna{animation:mbAnt 2.8s ease-in-out infinite}

@keyframes mbWave{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(-46deg)}}
.mbot-wave .mb-body,.mbot-hello .mb-body{animation:mbFloat 2.6s ease-in-out infinite}
.mbot-wave .mb-head,.mbot-hello .mb-head{animation:mbTilt 2.6s ease-in-out infinite}
.mbot-wave .mb-antenna,.mbot-hello .mb-antenna{animation:mbAnt 2.6s ease-in-out infinite}
.mbot-wave .mb-arm-r{animation:mbWave .62s ease-in-out infinite}
@keyframes mbHelloWave{
  0%,100%{transform:translate(70px,-88px) rotate(-11deg)}
  50%{transform:translate(78px,-100px) rotate(-33deg)}
}
.mbot-hello .mb-oval-r{animation:mbHelloWave .62s ease-in-out infinite}

/* --- the walk ------------------------------------------------------------
   Each foot is planted for half the stride, sliding backwards at an even
   rate — that is what stops a walk reading as skating — then swings forward
   through an arc. The body bobs twice per stride, lowest just after each
   landing. The arms oppose the feet, and the antenna is phase-lagged so it
   whips a beat behind the head instead of moving in lockstep with it. */
@keyframes mbBob{0%{transform:translateY(4px) scaleY(.99)}45%{transform:translateY(-18px) scaleY(1.01)}100%{transform:translateY(4px) scaleY(.99)}}
@keyframes mbLilt{0%{transform:rotate(3deg)}50%{transform:rotate(-3deg)}100%{transform:rotate(3deg)}}
@keyframes mbAntW{0%{transform:rotate(-15deg)}50%{transform:rotate(15deg)}100%{transform:rotate(-15deg)}}
@keyframes mbLook{0%,100%{transform:translateX(4px)}50%{transform:translateX(-4px)}}
@keyframes mbArmWL{0%{transform:rotate(26deg)}50%{transform:rotate(-26deg)}100%{transform:rotate(26deg)}}
@keyframes mbArmWR{0%{transform:rotate(-26deg)}50%{transform:rotate(26deg)}100%{transform:rotate(-26deg)}}
@keyframes mbStepL{
  0%{transform:translate(52px,0) rotate(-7deg) scale(1,.9)}
  10%{transform:translate(34px,0) rotate(-4deg) scale(1,1)}
  25%{transform:translate(4px,0) rotate(0) scale(1,1)}
  40%{transform:translate(-26px,0) rotate(4deg) scale(1,1)}
  50%{transform:translate(-44px,0) rotate(7deg) scale(1,1)}
  62%{transform:translate(-30px,-46px) rotate(4deg) scale(1.04)}
  74%{transform:translate(8px,-62px) rotate(-4deg) scale(1.07)}
  87%{transform:translate(42px,-40px) rotate(-8deg) scale(1.04)}
  95%{transform:translate(53px,-12px) rotate(-8deg) scale(1.01)}
  100%{transform:translate(52px,0) rotate(-7deg) scale(1,.9)}
}
@keyframes mbStepR{
  0%{transform:translate(-44px,0) rotate(7deg) scale(1,1)}
  12%{transform:translate(-30px,-46px) rotate(4deg) scale(1.04)}
  24%{transform:translate(8px,-62px) rotate(-4deg) scale(1.07)}
  37%{transform:translate(42px,-40px) rotate(-8deg) scale(1.04)}
  45%{transform:translate(53px,-12px) rotate(-8deg) scale(1.01)}
  50%{transform:translate(52px,0) rotate(-7deg) scale(1,.9)}
  60%{transform:translate(34px,0) rotate(-4deg) scale(1,1)}
  75%{transform:translate(4px,0) rotate(0) scale(1,1)}
  90%{transform:translate(-26px,0) rotate(4deg) scale(1,1)}
  100%{transform:translate(-44px,0) rotate(7deg) scale(1,1)}
}
@keyframes mbShadW{0%,100%{transform:scaleX(1.04);opacity:1}45%{transform:scaleX(.9);opacity:.72}}
.mbot-walk .mb-body{animation:mbBob .4s ease-in-out infinite}
.mbot-walk .mb-head{animation:mbLilt .8s ease-in-out infinite}
.mbot-walk .mb-antenna{animation:mbAntW .8s ease-in-out infinite -.13s}
.mbot-walk .mb-pupils{animation:mbLook .8s ease-in-out infinite}
.mbot-walk .mb-arm-l{animation:mbArmWL .8s ease-in-out infinite}
.mbot-walk .mb-arm-r{animation:mbArmWR .8s ease-in-out infinite}
.mbot-walk .mb-foot-l{animation:mbStepL .8s linear infinite}
.mbot-walk .mb-foot-r{animation:mbStepR .8s linear infinite}
.mbot-walk .mb-shadow{animation:mbShadW .4s ease-in-out infinite}

/* --- reached 5,000 -------------------------------------------------------- */
@keyframes mbHop{0%,100%{transform:translateY(0) scaleY(1)}16%{transform:translateY(10px) scaleY(.9)}48%{transform:translateY(-86px) scaleY(1.05)}78%{transform:translateY(6px) scaleY(.95)}}
@keyframes mbUpL{0%,100%{transform:rotate(150deg) scaleY(1.32)}50%{transform:rotate(166deg) scaleY(1.32)}}
@keyframes mbUpR{0%,100%{transform:rotate(-150deg) scaleY(1.32)}50%{transform:rotate(-166deg) scaleY(1.32)}}
@keyframes mbTwinkleA{0%,100%{transform:scale(1) rotate(0);opacity:1}50%{transform:scale(1.28) rotate(16deg);opacity:.75}}
@keyframes mbTwinkleB{0%,100%{transform:scale(1.22) rotate(10deg);opacity:.75}50%{transform:scale(.94) rotate(-8deg);opacity:1}}
@keyframes mbShadHop{0%,100%{transform:scale(1);opacity:1}48%{transform:scale(.7);opacity:.55}}
.mbot-cheer .mb-body{animation:mbHop 1.15s ease-in-out infinite}
.mbot-cheer .mb-foot-l,.mbot-cheer .mb-foot-r{animation:mbHop 1.15s ease-in-out infinite}
.mbot-cheer .mb-shadow{animation:mbShadHop 1.15s ease-in-out infinite}
.mbot-cheer .mb-antenna{animation:mbAnt 1.15s ease-in-out infinite}
.mbot-cheer .mb-arm-l{transform:rotate(150deg) scaleY(1.32);animation:mbUpL .58s ease-in-out infinite}
.mbot-cheer .mb-arm-r{transform:rotate(-150deg) scaleY(1.32);animation:mbUpR .58s ease-in-out infinite}
.mbot-cheer .mb-star-a{transform-origin:651px 230px;animation:mbTwinkleA 1.5s ease-in-out infinite}
.mbot-cheer .mb-star-b{transform-origin:971px 260px;animation:mbTwinkleB 1.5s ease-in-out infinite}

/* --- 完歩賞 --------------------------------------------------------------- */
@keyframes mbFlagArm{0%,100%{transform:rotate(-140deg)}50%{transform:rotate(-149deg)}}
@keyframes mbFurl{0%,100%{transform:skewY(0) scaleX(1)}50%{transform:skewY(-7deg) scaleX(.9)}}
.mbot-flag .mb-body{animation:mbFloat 2.4s ease-in-out infinite}
.mbot-flag .mb-head{animation:mbTilt 2.4s ease-in-out infinite}
.mbot-flag .mb-antenna{animation:mbAnt 2.4s ease-in-out infinite}
.mbot-flag .mb-arm-r{transform:rotate(-140deg);animation:mbFlagArm 1.9s ease-in-out infinite}
.mbot-flag .mb-pennant{animation:mbFurl .85s ease-in-out infinite}

/* --- the period closed short ---------------------------------------------
   Still smiling. Nobody gets scolded by a cartoon for a quiet month. */
@keyframes mbTrip{0%,100%{transform:rotate(-15deg) translateY(0)}50%{transform:rotate(-19deg) translateY(-10px)}}
@keyframes mbWobbleL{0%,100%{transform:rotate(38deg)}50%{transform:rotate(52deg)}}
@keyframes mbWobbleR{0%,100%{transform:rotate(-58deg)}50%{transform:rotate(-44deg)}}
@keyframes mbDrip{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(14px) scale(1.06)}}
@keyframes mbWhoosh{0%,100%{transform:translateX(0);opacity:.85}50%{transform:translateX(-26px);opacity:.4}}
.mbot-tumble .mb-lean{transform:rotate(-15deg);animation:mbTrip 2.1s ease-in-out infinite}
.mbot-tumble .mb-antenna{animation:mbAnt 1.1s ease-in-out infinite}
.mbot-tumble .mb-arm-l{transform:rotate(38deg);animation:mbWobbleL 1.05s ease-in-out infinite}
.mbot-tumble .mb-arm-r{transform:rotate(-58deg);animation:mbWobbleR 1.05s ease-in-out infinite}
.mbot-tumble .mb-sweat{transform-origin:1042px 460px;animation:mbDrip 1.6s ease-in-out infinite}
.mbot-tumble .mb-speed{transform-origin:450px 850px;animation:mbWhoosh 1.05s ease-in-out infinite}
.mbot-tumble .mb-foot-l{transform:rotate(-26deg) translate(-10px,6px)}
.mbot-tumble .mb-foot-r{transform:rotate(16deg) translate(14px,-8px)}
.mbot-tumble .mb-shadow{opacity:.6}

@media (prefers-reduced-motion:reduce){.mbot *{animation:none!important}}
`;
