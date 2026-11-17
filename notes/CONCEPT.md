# EnigmaGift

> **A gift that only one person in the world can open.**
> The lock is made of your shared memories.

---

## The one-liner

You make a gift for someone. Before they can see it, they have to answer a few
things only *they* would know. The lock *is* the gift: it proves somebody paid
attention. Then it opens into a keepsake made about them.

One box. Type a name. That's the whole front door.

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
   │  Who is this for?              │
   └────────────────────────────────┘
        for someone   ·   for me
```

Nothing else on the page. No pricing table, no feature grid, no hero carousel.

### 1 · Tell it about them (60 seconds)

Free text, voice, or a photo. "My mum Ada. We argue about the crossword. She
taught me to drive in a Nissan Micra she called The Beast."

The agent asks **three** follow-ups, max. Each one should feel like a person who
is actually listening, not a form.

### 2 · It builds the enigma — visibly

Borrowed from `jejak`: the work **arrives unfinished**, step by step, with the
real material attached.

```
  ✓ I kept three things you said
  ✓ I turned the Micra into a question only she can answer
  ✓ I wrote the letter that sits behind the lock
  ✓ I sealed it
```

Showing the work *is* the proof of effort. This is the single most important
screen in the product.

### 3 · The seal

A link. Send it however you like — WhatsApp, text, print the QR into a card.

When Ada opens it, she doesn't get the gift. She gets a question:

> *"What did I call the car you learned to drive in?"*

Three questions, all drawn from the memories you gave it. Wrong answers are
gentle — it nudges, it never locks her out. (The lock is theatre, not security.
It must never feel like a password reset.)

### 4 · The reveal

It opens into the keepsake: an illustrated portrait, a short letter in your
voice, and a 15-second film. Her name is in it. The Micra is in it.

**This is the shareable frame.** The gift records nothing — but the *moment* is
exactly the reaction-video format that already works on TikTok.

---

## Freemium line

| | Free | Paid — **£14** (sweet spot under the £25 ceiling) |
|---|---|---|
| Build an enigma | ✅ | ✅ |
| See the reveal yourself | ✅ | ✅ |
| **Send it to them** | watermarked, 1 question | ✅ full 3-question seal, no watermark |
| The keepsake | screen only | high-res + **print-ready PDF** (card / A4 / framed) |
| Voice | — | the letter read aloud |
| Chapters | 1 | up to 5 (one per memory) |

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

1. One box, one page. Name → 3 questions → sealed link. **No accounts.**
2. Reveal page: letter + portrait. (Film is v2 — don't block launch on render time.)
3. Stripe link for £14. Wire the same account to `/stripe connect` *and* TrustMRR.
4. Ship it, then make 10 enigmas for 10 strangers and post the reveals.

Everything else — voice, chapters, print PDF, film — is a *paid upgrade we can
add while it's already selling*.

## Named risks

- **AI-slop perception.** Mitigation: keep real material real (the `wowowify`
  lesson — never let the model redraw a supplied face), and show the work.
- **The lock must never frustrate.** Gentle nudges, unlimited attempts, a
  "just open it" escape hatch after three tries.
- **Creepiness line.** Only use what the buyer typed in. No scraping the
  recipient, ever.
- **Both comps ban friends/family purchases** — every sale must be a stranger.
