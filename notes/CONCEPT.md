# EnigmaGift v2 — the hunt

**Roadmap (not shipped):** [World-first memory hunt and proposed gift tiers](DIGITAL-HUNT.md). The flow below describes the existing £19 physical hunt.

> **Hide something real. Let the photographs lead them to it.**

A gift isn't a thing you send. It's a place you leave something, and a trail of
photographs that only one person can follow.

---

## The one-liner

Pick a place that matters. Photograph it. Hide something there. The agent reads
your photos, finds the details only you would know, and builds a chain of clues
that leads the person you love to what you left behind — then a code in the
hidden thing unlocks the keepsake waiting for them.

One box. Drop in photos of the place. That's the whole front door.

**What changed from v1:** the prerequisite is no longer "photos of the two of
you" — which quietly excluded most relationships — it's **photos of a place**,
which everyone can take in five minutes on a visit. The physical hunt is the
gift; the digital keepsake is the prize inside it.

---

## The full experience

### 1 · The place (buyer, ~5 min)

The buyer picks a place that matters — where you got engaged, your gran's
house, the pub, a street in another city — and photographs it. 5–10 shots:
the door, the window, the menu board, the view from the bench. The visit itself
is the ritual; the effort is the meaning.

Photos of people in frame are welcome bonus material, never required.

### 2 · The agent reads the place

The vision pass returns structured, *located* observations — what is in each
frame and where. Then it does two things:

- **Finds the clues**: the blue door, the chalkboard, the seat by the window,
  the same lamp in every shot. Details a stranger couldn't use but the recipient
  would recognise instantly.
- **Proposes hiding spots**: "behind the third stair", "inside the menu stand",
  "taped under the bench slat" — read off the photos themselves. The agent
  doesn't just write clues, it scouts the territory.

Work arrives unfinished (`jejak` pattern), labelled honestly: *seen in the
photo* vs *inferred*.

### 3 · You are the editor — and the hider

The agent proposes clues **and** a hide spot. The buyer approves or adjusts
everything, then physically hides the thing — a note, a small object, the ring
box — and photographs the hide spot so the trail is accurate.

### 4 · The seal

A link. Sent however they like. The recipient doesn't get the gift — they get a
**tight crop** of something from the photos and a question. Three rounds,
escalating:

| Round | Sees | Doing |
|---|---|---|
| 1 · The detail | one close crop — the blue door, the chalkboard | recognition |
| 2 · The connection | two crops, different years or angles | deduction |
| 3 · The place | the throughline — where this all points | **the reveal** |

Wrong answers nudge gently; it opens anyway. The lock is theatre.

### 5 · The hunt

The throughline resolves to the place itself — possibly with the Atlas 3D
reconstruction of the actual location as a "hunt map" they can explore
digitally first. They go. They look. They find it.

### 6 · The code → the keepsake

The hidden thing contains a code. Entering it unlocks the digital layer:
the letter in the buyer's voice, the composed world of the place, the
flythrough film. The hunt was the gift; this is the residue it leaves.

**Why the code matters:** it proves they actually went — the emotional payoff
is earned, and it gives us a second reveal beat for the reaction video.

---

## Why the hunt beats the photo-enigma

| | v1 (photo enigma) | v2 (the hunt) |
|---|---|---|
| Input needed | 5–10 photos *of two people* | 5–10 photos *of a place* — universal |
| Relationships covered | those with photo archives | **any** — friends, family, partners, yourself |
| Emotional cost | uploading someone's likeness | photographing a place you already know |
| Reveal | a link, a screen | **a physical moment in the real world** |
| Virality | shareable clip | **people film "I found it"** — inherently viral |
| Novelty | personalised card, crowded market | **a category nobody occupies** |
| Atlas/World Labs | decorative | **the actual location as explorable map** |

The contact who reviewed v1 was right: people-photos were the fragile
prerequisite. Place-photos are not.

---

## Freemium line

| | Free | Paid — **£19** |
|---|---|---|
| Read the place, propose clues | ✅ | ✅ |
| One deduction round (sealed, watermarked) | ✅ | ✅ |
| Full 3-round trail | — | ✅ |
| Hiding-spot scouting from photos | — | ✅ |
| **Atlas world of the actual place** (hunt map) | — | ✅ |
| Flythrough film of the trail | — | ✅ |
| Digital keepsake unlock (letter, world, film) | — | ✅ |
| Print-ready trail card (QR to the link) | — | ✅ |

Free tier still delivers the *feeling* — you see what the agent noticed about
your place — but the trail, the map, and the keepsake are the paid object.

**"For me" mode** survives unchanged: hide something for future-you — a letter
at a meaningful spot, opened on a date you choose.

---

## The loop

```
   buyer photographs a place  →  hides something  →  sends a sealed link
          ↑                                              ↓
   recipient finds it, films it  ←  enters the code  ←  follows the trail
          ↓
   posts the "I found it"  →  next buyer
```

Every paid hunt ends with the recipient standing in a real place holding
something real — the most filmable, talkable moment a £19 product can buy.

---

## Competition fit

- **MMM (freeze 18 Nov 18:00):** digital product, instant delivery of the
  *experience design*; the buyer does the physical hiding (like sealing a
  letter — our delivery is the clue chain + link, not the object). Agent does
  find/sell/deliver → near-zero touches → **Iron Mode** remains the realistic
  prize. ~27 sales at £19 clears £500.
- **Ship or Die (16 Dec):** brand-new digital product, Stripe → TrustMRR,
  peaks across gifting season. The hunt is more gift-shaped than the enigma
  ever was — Christmas, birthdays, proposals, memorials.
- Fallback for long-distance / can't-hide buyers: **digital-only mode** —
  the v1 enigma as it exists today. Same engine, no IRL step.

---

## Build order

**Core is live (2026-11-17).** The Atlas map, flythrough film, and print card are
the remaining spectacle layer (v2+).

1. ✅ Door → photos of the *place*.
2. ✅ Vision pass → located observations → clue chain + **hide-spot proposals**
   (SandBase primary, Gemini fallback; running in production).
3. ✅ Buyer editor → approve/edit clues + pick hide spot → "hide it" (photo
   verification of the hide is the natural next polish).
4. ✅ Seal → recipient 3-round trail → throughline resolves to the place
   (Atlas map still to add).
5. ✅ Code entry → keepsake unlock (letter now; world + film are v2+).
6. ✅ Stripe £19 Payment Link at the seal (live; success URL → `?paid=1`).

~~The riskiest technical piece~~ **Resolved (17 Nov):** the vision spike
(`notes/SPIKE.md`) proved located observations are feasible, and the live
pipeline now produces throughlines, hide-spot proposals, and three quiz
rounds end-to-end on production.

## Named risks

- **Hallucinated detail** — label *seen* vs *inferred*, never clue on
  inference, buyer-as-editor gate on everything.
- **Real-world failure** — weather, bin day, someone else finding it.
  Mitigate: hide-spot scouting favours durable/concealed spots; the code-locked
  digital layer means even a failed hunt still delivers the keepsake.
- **Buyer effort** — the hide step is theirs; frame it as the ritual, give a
  checklist, allow "I'll hide it later" (link activates on a date).
- **Creepiness/safety** — only use uploaded photos; hide spots stay in public
  or semi-public places (never homes entered, never anything requiring
  breaking in); moderation hook for the editor review.
- **Both comps ban friends/family purchases** — every sale a stranger.
