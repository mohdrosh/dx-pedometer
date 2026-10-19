# モラエッグの画像 / Moraegg artwork

佐野:「これらは暫定です。スケジュールが変わったら画像を差し替えて対応したいので、
差し替えやすい作りにしてください。」

Every picture on the モラエッグ page is loaded **by file name from this
folder**. Nothing about them is in the code: no text is overlaid, no size is
assumed, nothing is cropped. To change one, replace the file with another of
the same name and redeploy. That is the whole job — no code change, no build
step beyond the usual one, and nobody needs to ask an engineer.

If the schedule changes (say 「申請締切は木曜、金曜に調整、月曜発送」) and the
wording in a picture goes stale, that is a file swap.

## Where each one appears

| File | Where it shows | Note |
|---|---|---|
| `harvest-today.webp` | 丹波 — above the day's count | The speech bubble says 9個; the live count is printed by the page beside it, not in the picture |
| `week-packs.webp` | 配布 — beside the week's shipment | |
| `about-to-lay.webp` | 丹波 — when nothing has been registered yet today | |
| `hens-well.webp` | 配布 — the banner across the top | Wide (1200×733) |
| `hello-tamba.webp` | 需要調査 — beside the questions | Titled モラたま, which is **not** the site name the president chose |
| `coop-news.webp` | 配布 — 丹波の鶏舎だより block | Wide |
| `seal-round.webp` | Used small, as a stamp on a confirmed request | Transparent background |
| `thankyou-egg.webp` | Shown once a pack has been collected | Transparent background |
| `label-asadore.webp` | 丹波 — offered as a printable carton label | Has a handwritten 採卵日 blank |
| `basket` `cross` `empty` `hatch` `hug` | Moraegg's expressions, used by the chart and the empty states | |

## If you add a new one

Put it here and reference it by name. Keep the long edge at 1200px or less
and save as WebP at about quality 80 — the nine here come to 1.1MB in total,
which is already most of what the page weighs on a phone.

The two with transparent backgrounds (`seal-round`, `thankyou-egg`) sit on
any colour. The rest carry their own background and want to be shown whole,
so the page never crops them.
