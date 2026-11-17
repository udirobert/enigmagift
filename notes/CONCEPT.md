# EnigmaGift

> **A gift that only one person in the world can open.**
> The lock is made of your own photographs.

---

## The one-liner

Give it photos of the two of you. It looks closely, finds the details — and the
one pattern running through all of them that neither of you ever noticed. That
becomes a chain of clues only they can solve, and solving it *is* the gift.

One box. Drop in photos. That's the whole front door.

**The core trick:** the clues aren't *written about* the memories, they're
**cropped out of** them. Real material, real evidence, nothing generated. The
recipient isn't being tested on recall — they're *discovering* something true.

---

## Why this is the right shape

The research says three things, and this concept is the intersection of all three:

1. **Buyers are live now** — 1.92M plays/week on personalised gifts, stated £25
   price band, sentimental framing. (`RESEARCH.md` §1)
2. **Personalisation works because it signals effort** — the name-letter effect;
   recipients keep what proves they were seen. (§2) → So make the *effort itself*
   the visible mechanic, instead of hiding it behind a render.
3. **Freemium converts when the free tier delivers the real feeling** (§3) →
   Give away the moment. Charge to keep it and send it.

And the thing nobody else is doing: every personalised-gift product on the market
is **passive** — you buy a thing, they receive a thing. EnigmaGift makes the
recipient **participate**. That participation is the emotional payload *and* the
distribution engine, because the reveal is a reaction video waiting to happen.

---

## The experience

### Door (one box, Google-simple)

```
          EnigmaGift
   ┌────────────────────────────────┐
   │  drop in your photos ↑         │
   └────────────────────────────────┘
        for someone   ·   for me
```

Nothing else on the page. No pricing table, no feature grid, no hero carousel.

### 1 · Give it your photos (60 seconds)

Drop in 5–10 photos of the two of you. Optionally a line of context
("my mum Ada, we argue about the crossword"). Nothing else to fill in.

The photos are the raw material — and crucially they are **real**. Everything
the recipient sees is their own life, not a render. This is what stops the whole
product feeling generated.

### 2 · It reads them — and finds the throughline

The agent looks *closely*. Not "two people smiling" — the specific stuff:
the pub carpet, the hire-car number plate, who's on whose left, the same coat in
four different winters, the receipt on the table.

Then it does the thing that makes this a gift rather than a quiz: it
**cross-references across photos to find a pattern neither of you noticed.**

> *"In every photo from 2019 to 2026, she is standing on your left."*
> *"You have been to this same café in four different years, each time in October."*

Borrowed from `jejak`, the work **arrives unfinished** — step by step, with the
evidence attached, and with honest labels: *seen in the photo* vs *inferred*.

```
  ✓ I read 8 photos
  ✓ I found 3 details you can see, and 2 I'm guessing at
  ✓ I found one thing that runs through all of them
  ✓ I built the chain
```

### 3 · You are the editor

The agent proposes; **you approve**. Every clue is shown with the crop it came
from, and you can cut, reword, or re-pick it.

This is doing three jobs at once: it stops a hallucinated detail ever reaching
the recipient, it keeps the moment emotionally safe (you'd know if a photo was
painful), and it makes the buyer a **co-author** — which is more effort signal,
not less.

### 4 · The seal — a chain of deduction

A link. Send it however you like — WhatsApp, text, QR printed into a card.

When Ada opens it she doesn't get the gift. She gets a **tight crop** of
something from one of the photos, and a question. Three rounds, escalating:

| Round | What she sees | What she's doing |
|---|---|---|
| **1 · The detail** | One close crop — the number plate, the carpet, a mug | *Recognition*. Warm, easy, "oh my god I know this" |
| **2 · The connection** | Two crops, side by side, different years | *Deduction*. What do these two days share? |
| **3 · The throughline** | The pattern across all of them | Not a question — **this is the reveal** |

Round 3 is the payload: she doesn't answer it, she's *told* it. The app noticed
something true about the two of you that neither of you had ever noticed.

Wrong answers are gentle — it nudges, it opens anyway after three tries. The
lock is theatre, not security; it must never feel like a password reset.

### 5 · The reveal

It opens into the keepsake, built from the real photos: the throughline laid out
across them, the letter in your voice, and a short film that moves through the
crops to the whole picture.

**This is the shareable frame.** Deduction makes it *much* more watchable than a
passive unwrap — the reaction video has a middle, not just an end.

---

## The spectacle layer — you walk *into* the photograph

This is the differentiator, and it's available to us today because of credits we
already hold. **World Labs Atlas / Marble** turns a flat photo into a real 3D
space you can move through. **LTX-2.5** is the film and motion layer on top.

### What Atlas actually gives us

| Capability | What it means for the gift |
|---|---|
| Single image → explorable 3D world | **Step inside a memory.** The defining feature |
| Multi-image reconstruction (2–25+ imgs) | More photos of one place = a faithful reconstruction, not a guess |
| **Spatial context interpolation** | Place two unrelated photos in 3D and it *imagines the corridor between them* — doorways, hallways, transitions |
| **Compose** (Studio) | Connect separate worlds into one seamless environment |
| **Record** (Studio) | Cinematic camera animation → flythrough video = the shareable artefact |
| Export | **Browser share link**, VR link, Gaussian splats (render on-device, high FPS) |

The gift stops being an image. It becomes **a place you can walk around in, in a
browser, on a phone, or in VR.**

### How it rebuilds each round

- **Round 1 · the detail** — not a static crop. The camera *flies into* the
  photograph, pushing past the foreground until the detail fills the frame.
  A crop tells you where to look; a push-in makes you *lean in*.
- **Round 2 · the connection** — this is the showpiece. Atlas puts two memories
  from different years into one spatial context and **generates the corridor
  between them**. You physically walk out of 2019 and into 2026. Nothing else on
  the market can do this, and it's a native feature, not a hack.
- **Round 3 · the throughline** — `Compose` stitches every memory into one
  connected world, and `Record` flies a single unbroken camera path through all
  of them, landing on the pattern. One continuous shot through someone's life.

### Why this wins on virality specifically

The shareable isn't a screenshot of a nice picture — it's **a camera moving
through a real person's real memories**. That is inherently watchable, has a
beginning/middle/end, and the recipient's reaction has something to react *to*
at every beat. It also hands us a second shareable for free: the recipient can
send the explorable world link onward, and everyone who opens it is inside our
product.

### Feasibility — the honest timing math

Measured generation times (World Labs docs):

| Operation | Time |
|---|---|
| Pano from single image | **~30 s** |
| Draft world (any input) | ~20 s |
| Full world | ~5 min |
| Pano from multi-image / video | ~2 min |
| High-quality mesh | ~1 hr |

Eight photos × 5 min full worlds = ~40 min. **Too slow for an impulse purchase**,
so v1 must be built on the fast path:

- **Free tier** = one photo → pano/draft (~30 s). You step inside one memory.
  That is a complete, astonishing core experience — exactly what the freemium
  research says the free tier must be.
- **Paid tier** = the composed multi-memory world + the recorded flythrough,
  generated **after** payment, delivered by link in a few minutes. The wait is
  not a flaw here: "your gift is being built" is *correct* theatre for a gift,
  and it mirrors the `jejak` arrives-unfinished pattern we already like.

**LTX** then does what Atlas doesn't: image-to-video motion on individual stills,
HDR polish, and alpha-channel elements for titles/overlays composited over the
flythrough. Open weights + API, so it's cheap at volume — and **neither comp
deducts AI/API cost** (MMM excludes it from the £100; SoD doesn't subtract it
from profit), so we can spend freely on production quality.

### Risk this introduces

Atlas *imagines* what it can't see. For a gift built on "this is really your
life," invented detail is the cardinal sin. Mitigations: feed multiple photos of
the same place (docs: "the more it sees, the less it imagines"), keep camera
paths **close to the real photo** rather than flying off into generated space,
and keep the buyer-as-editor gate — they approve the flythrough before it sends.

---

## Freemium line

| | Free | Paid — **£19** |
|---|---|---|
| Build an enigma | ✅ | ✅ |
| **Step inside one photo** (pano, ~30s) | ✅ | ✅ |
| See the reveal yourself | ✅ | ✅ |
| **Send it to them** | watermarked, 1 round | ✅ full 3-round seal, no watermark |
| **The corridor between two memories** | — | ✅ the showpiece |
| **Composed world + flythrough film** | — | ✅ the shareable artefact |
| Explorable world link (+ VR) | — | ✅ theirs to keep and pass on |
| Print-ready keepsake PDF | — | ✅ |
| Voice — the letter read aloud | — | ✅ |

Price moved **£14 → £19**: the free tier now gives away something genuinely
astonishing (you step inside your own photograph), so the paid tier has to be,
and is, a categorically bigger thing — a composed world and a film, not a
nicer image. £19 still sits under the £25 ceiling the market stated.

The free tier is deliberately *complete as an experience* — you feel the whole
thing — and deliberately *incomplete as an object*. You pay to make it real and
to put it in someone's hands. That matches the research exactly: emotional
commitment first, then the ask.

**Do-it-for-yourself mode** is the same engine pointed inward ("for me") — a
sealed letter to yourself, opened at a date you choose. Costs nothing extra to
build, doubles the top of the funnel, and gives the Wrapped-season crowd
something to make when Wrapped lands.

---

## Why it spreads (the loop)

```
   buyer makes a gift  →  sends a link  →  recipient participates
          ↑                                        ↓
     recipient buys one  ←  "who do I make one for?"
```

Every single paid gift delivers the product to a **new stranger**, inside the
most emotionally receptive moment that person will have all week. There is no
other acquisition channel this good, and it costs £0.

Three supporting channels, all zero-spend:
- **Reveal/reaction clips** — the proven TikTok format, our output is built for it.
- **Comment-gating** — "comment WRAP and I'll send you one" (the mechanic Oriane
  shows working on every top AI-tool account).
- **Wrapped slipstream** — when Wrapped drops, "wrap a person, not a playlist."

---

## Why it wins on both scoreboards

**Make Me Money (freeze 18 Nov 18:00):** digital, instant delivery, impulse price.
Needs ~36 sales at £14. The agent does all three legs of every sale — finds
(posts the clips), sells (the link), delivers (the keepsake) — so **touches stay
near zero**, which is the Iron Mode prize (profit ÷ (touches+1)), and plausibly
the most winnable prize on the board.

**Ship or Die ($100K, ends 16 Dec):** brand-new digital product, built from zero
after rules acceptance, Stripe → TrustMRR. Peaks across the entire gifting
season and ends *exactly* on the deadline. The self-mode gives it a January life
after Christmas, so it isn't a seasonal one-shot.

---

## Build order (today)

1. One box. Upload photos → vision pass → **Atlas pano on one photo (~30s)** →
   clue chain → **buyer edits** →
   sealed link. **No accounts.**
2. Reveal page: crops → throughline → letter, laid over the real photos.
   (Film is v2 — don't block launch on render time.)
3. Stripe link for £14. Wire the same account to `/stripe connect` *and* TrustMRR.
4. Ship it, then make 10 enigmas for 10 strangers and post the reveals.

The hard part is only step 1's middle: a vision pass that returns **structured,
located observations** (what, and where in the frame) so crops are generated
rather than hand-picked. Everything else — voice, chapters, print PDF, film —
is a *paid upgrade we can add while it's already selling*.

## Named risks

- **Hallucinated detail.** The whole product dies if it asserts something that
  isn't in the photo. Mitigations: label *seen* vs *inferred* (`jejak`
  discipline), never build a clue on an inferred detail, and the **buyer-as-editor
  gate** means nothing unreviewed reaches the recipient.
- **AI-slop perception.** Largely solved by the photo mechanic — the material is
  real. Keep it that way: never let a model redraw a supplied face (`wowowify`
  lesson). Generated imagery is garnish, never the substance.
- **Photos are sensitive.** Private by default, no training on uploads, delete on
  request, and say so plainly on the one page. Trust is the whole product here.
- **The lock must never frustrate.** Gentle nudges, unlimited attempts, opens
  anyway after three tries.
- **Creepiness line.** Only ever use what the buyer uploaded. No scraping the
  recipient, no face matching against anything external, ever.
- **Both comps ban friends/family purchases** — every sale must be a stranger.
