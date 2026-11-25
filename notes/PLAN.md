# Next steps — make it a gift before it's a world

Written 2026-11-24, from a code-and-docs review of the shipped trail-first
product. This plan runs **alongside** [the world-first roadmap](DIGITAL-HUNT.md),
it does not replace it. The roadmap answers "what should this become"; this plan
answers "what must be true before that bet is worth making".

Effort figures are guesses, not commitments. Every claim below is tagged
`[evidence]` (read in code or docs) or `[assumption]` (unverified).

---

## The thesis

> The product's value is one recipient moment. That moment has never been
> observed with a human, and the artefact it delivers does not yet contain the
> one thing a gift must contain: the giver's own words.

Two consequences for sequencing:

1. **Observation outranks building.** `[evidence]` Both pilots record that
   uncoached recipient research has never been run
   ([CANONICAL-GIFT](CANONICAL-GIFT.md), [ONBOARDING](ONBOARDING.md)). Until
   someone who didn't build it opens a link, every other decision is taste.
2. **The world-first hunt is the correct long-term bet and the wrong next
   build.** `[assumption]` It makes the search the product — which fixes the
   theatre problem below — but it multiplies cost and failure modes before the
   current funnel has proved anyone completes it.

### Decision rules for the next quarter

- **No new surface** (studio, pilot, scene) until a stranger has completed the
  shipped trail uncoached.
- **Every fix must be measurable** from the `events` table `[evidence]`
  (`server/db.js:78`) — no feature ships without the event that judges it.
- **The recipient never pays, never signs up, never installs.** Non-negotiable
  and already true. `[evidence]`
- **One canonical gift, revised.** `[evidence]` The repo now has four recipient
  experiences (trail, room, photo hunt, prototypes). Freeze all but the trail.
- **Never add a step to the giver's path to pay for a step elsewhere.** The
  giver already carries photo selection, review and payment for £4.99.[^effort]

[^effort]: `[evidence]` Before the Phase 3 floor work, `Door.tsx` blocked under
5 photos and `Editor.tsx` required keep/cut/edit of every clue plus a
world-source choice. Those specific costs are reduced now; the rule remains
that new recipient-side magic must not be paid for with new giver-side labour.

---

## Phase 0 · Observe before building (3–5 days, mostly not code)

**Do this first. It is the cheapest thing in the document and the only thing
that can invalidate the rest.**

Write one run card and run it. `[evidence]` The equivalent already exists for
the room pilot (`CANONICAL-GIFT.md`, "Run card") — it has never been used.

- **Recipients: 5.** Their own phone, own time, one instruction: *"Someone sent
  you this. Open it as you normally would."* No coaching, no watching over the
  shoulder, screen recording on.
- **Record, per person:** time to first tap; whether they read the photo crops
  or skipped to the buttons; what they said out loud when a clue was right or
  wrong; the face at the reveal; whether they copied the note back; whether they
  revisited anything; whether they mentioned the 3D world unprompted.
- **Givers: 2.** Watch them choose photos and use the editor. Time to first
  photo, where they stall, whether they ever open "something's not quite right".
- **Instrumentation, minimal:** add `reveal_complete`, `world_loaded` /
  `world_failed`, per-round dwell ms, `letter_read` (scroll to signature), and a
  client error event. **Status: built 2026-11-25**; ops-report now summarizes
  these counts. Older note: none of these existed; `round_N_picked`,
  `unlocked`, `shared_back` did.

**Exit criteria:** transcript-level notes on 5 recipients, and a ranked list of
the three things that broke. If the list doesn't match this plan, the plan is
wrong and should be edited, not defended.

---

## Phase 1 · Make it a gift you can actually give (4–6 days)

### 1a. The giver's words (1–2 days) — highest value per hour in the repo

> **Status: built (before this plan was written).** `message`/`signature`
> columns, the letter endpoint with drafts, and the reveal rendering the
> giver's words all exist in the code today.

`[evidence]` There is no field for the giver's own message. `gifts` has
`throughline`, `place_guess`, `rounds`, `clues` (`server/db.js:18-36`). The
reveal's "letter" is template prose with `placeGuess` interpolated
(`src/scenes/Reveal.tsx:220-245`); the unlock response returns a hardcoded
sentence (`server/index.js:851`). The product currently cannot deliver a gift,
only a generated essay about the recipient's photographs.

- Add `message` (TEXT, ~1200 chars) and `signature` to `gifts`; one column
  migration via the existing `addColumnIfMissing`.
- One calm writing moment in the giver flow, after the clues, not before — by
  then they know what the reveal feels like. `[assumption]` Placed before the
  read, it's a form; after the preview, it's a letter.
- The agent offers three drafts from the observations ("what only you could
  say about this place"), the giver edits or ignores. Keep the AI's hand off
  the final voice.
- Reveal renders the giver's words, never the current template. Signature is
  theirs.
- Acceptance: a recipient reads something only their giver could have written.

### 1b. Delivery and recovery (3–4 days) — the business blocker

> **Status: built 2026-11-24.** Email capture at seal, Resend mailer with a
> dev-log fallback (`server/mailer.js`), scheduled-send delivery sweep every
> 10 min, `GET /api/lookup` + `/find.html` recovery page, checkout-intent
> event, webhook-side delivery. Env: `RESEND_API_KEY`, `MAIL_FROM`,
> `APP_ORIGIN`. Remaining: production domain verification in Resend, and a
> nudge email for scheduled gifts.

`[evidence]` No email anywhere in `src/` or `index.html`. "Send" is
`navigator.clipboard.writeText` (`Seal.tsx:198`). Gift context lives in
`localStorage` (`App.tsx:18`), pack credits too (`stashPack`). The API supports
`{sendAt}`; the client never forwards it.

- Capture **one email** at seal, framed as "where should we send the link?".
  Transactional only; store hash-free, factor into `/privacy`, delete with the
  gift.
- Send on seal: link + price + what's stored + how to delete. Provider TBD
  (Resend/Postmark), one template, no marketing consent bundled in.
- **`GET /api/lookup`**: enter email → mail back every gift link owned by that
  address. No accounts, no passwords, no session. This is the recovery path for
  "I paid and lost the tab" and for Set credits.
- Move pack credits server-side, keyed to the purchase, resolvable by email.
- Persist checkout intent server-side (`checkout_pending`), so the `?paid=1` +
  `localStorage` + "i've paid" dance (`Seal.tsx:64-145`) is a convenience, not
  the only path from payment to gift.
- Schedule: forward `sendAt` and show a date field. "Arrives on the morning of"
  is the #1 unmet need in a gift product.
- Acceptance: pay in a fresh private window with storage cleared → the link
  still arrives by email, and lookup finds it.

**Why before everything else:** `[assumption]` every later measurement needs a
delivered recipient, and every refund conversation currently starts with "we
can't find your gift".

---

## Phase 2 · Make the trail pay out (4–6 days)

> **Status: built 2026-11-24.** Correct look now releases one paragraph of
> the giver's letter (rounds 1–2; round 3 releases the rest) with a "keep
> going" beat instead of an auto-jump; with no letter, the payout is the
> reveal of the photo itself. Misses label the actual crop ("this is what's
> there — look again") instead of a nudge string. After three misses there is
> no auto-advance: an "open it anyway" button puts the choice with the
> recipient. Demo mode keeps its scripted autoplay. New events:
> `round_N_payout`.

`[evidence]` `Round.tsx` says the lock "is theatre, never a password": three
misses and it advances in 1.6s (l.204). Round 3 auto-advances on a 5.6s timer
(l.173). The recipient's own picks are already stored and replayed as stats in
`Reveal.tsx:61-84` but never used as the payoff.

- **Progressive payout:** correct look releases one line of the giver's letter
  or one photograph; the third releases the world and the portrait. The reveal
  becomes an accumulation, not a page.
- **Honest misses:** on a miss, show *their pick* against *the actual crop*,
  labelled, then let them look again. Share the truth — that's the mechanic the
  portfolio's best work uses ("guess first, then reveal"). `[evidence]`
  `RESEARCH.md §5`.
- **Remove the auto-advance after three misses.** Keep the guaranteed opening,
  but make it a button the recipient presses ("open it anyway"). Owning the
  choice is the difference between a gift and a paywall.
- Keep the recap, and promote it: "here's what you saw" is the shareable object,
  and it's currently a footnote.

**Kill criterion:** if Phase 0 shows recipients clicking through without
reading (median round dwell under ~4s, `[assumption]`), don't build this —
delete the rounds and ship the letter and the photos. A gift doesn't need a quiz.

---

## Phase 3 · Lower the floor (3–5 days)

> **Status: built 2026-11-24.** Shipped: 1-photo minimum (server
> gate, door copy, status line), short-trail degradation (1–2 observed photos
> can carry a trail; round counter and flow skip missing rounds), browser
> Back via `history.pushState` + popstate (scenes live in history; a swipe
> returns to the previous scene), guided-capture shot list in the dock
> (door / sign / seat / view / detail). This pass finished the two UI
> surgeries: **the agent-decides editor** — the clue set renders as one review
> card (`.clue-review`), "looks right — continue" is the single affirmative in
> the footer, and the reclue box and the authoring workbench sit behind the two
> quiet exception links ("something's not quite right?", "look closer") with
> the world-source picker inside the workbench; and **tier selection at the
> till** — the door ships one default (`the trail · £4.99`) with the others
> behind "other ways to give →", and the tier selector lives in the Seal's order
> summary (at that point trail ↔ hide only — a set was a pack minted at creation,
> and the server's `/tier` PATCH accepted just those two, so offering the set at
> the till would have taken £19 for one hunt; Phase 4 later added the Set row
> properly, and the 2026-11-25 hardening made the pack two credits after the
> purchase gift).
> Verified with a new scene smoke test (`npm run smoke:scenes`): the editor
> opens on the review card with exactly one primary control, the door shows one
> active tier, the live Seal carries the selector, a set is never switchable at
> the till, demo keeps the theatre.

`[evidence]` Before this phase, the trail demanded 5 photos minimum (`Door.tsx:122`)
to serve the pipeline, and the editor asked the buyer to hand-author an artefact
they had never seen the output of. The current floor is one photo.

- **One photo → two rounds.** Short trails degrade honestly: fewer rounds,
  throughline as the only puzzle. Pipeline must accept 1–4 photos.
- **Agent decides everything by default.** The editor becomes a review card:
  the clue set as one composition, "looks right" / "something's off" (the
  re-clue box already exists and is the right interaction). The world-source
  picker moves behind "advanced".
- **Tier selection moves to the Seal**, after the preview, when the buyer knows
  what they're buying. The door ships one default and one line of copy.
  `[evidence]` today it's in the dock (`Door.tsx:398`), before any value is felt.
- **Guided capture:** "the five shots" — door, sign, bench, view, a detail —
  with `capture` on the file input and a shot counter. The buyer is usually
  standing in the place with the phone in their hand; meet them there.
- **Browser Back:** persist the scene in `history.pushState` (or the query), so
  a swipe doesn't destroy a 12-photo session. `[assumption]` Biggest silent
  loss in the funnel on iOS.

---

## Phase 4 · Money shape (decisions first, then 2–4 days)

> **Status: partially built 2026-11-24.** Shipped: referral wiring end-to-end
> (`?ref=<token>` captured and stripped client-side, forwarded to gift
> create, server validation already existed; the note-back CTA now carries
> the ref), the Hide fallback ("if I don't hide it, open anyway on <date>" —
> `trails.fallback_at`, seal field, unlock honours it and logs
> `viaFallback`), and the print-at-home keepsake (print button + print
> stylesheet in the reveal: letter + photographs on paper). **The Set can now
> be bought at the till**, not just at the door: `PATCH /tier` accepts `set`
> (mode forced digital, refused for a gift that already came out of a pack, so
> the same pack is never sold twice), the Seal's tier row offers all three and
> hides the set for pack-owned hunts, and the old "+£5 physical ending"
> upsell link was removed since the row now does that job. The pack itself is
> minted by one idempotent `ensureSetPack()` on **both** payment paths — the
> webhook (where it lived alone) and the verified `mark-paid` return, which
> used to mark the gift paid and silently never mint the pack, so a £19 buyer
> whose webhook was lost owned nothing but one trail. The buyer now picks the
> pack up straight after sealing instead of on a later reload.
>
> **Decisions still open for the owner:** retire/resize The Set, paid printed
> artefact, price test after 25 paid gifts.
>
> **Money questions resolved 2026-11-25:**
> 1. The Set now means three hunts total: the purchase gift plus a 2-credit
>    pack, matching the till copy. Existing already-minted packs were not
>    retroactively reduced.
> 2. `POST /api/gifts/:id/seal` now fails closed with `402` unless the gift is
>    Stripe-paid, consumed a Set-pack credit, or the explicit demo-only
>    `ALLOW_UNPAID_SEAL=true` escape hatch is set. The same entitlement gates
>    recipient access, email delivery, world generation and portrait
>    generation; the regression suite covers both unpaid denial and pack-child
>    allowance.

`[evidence]` Costs are honestly modelled at 88–90% contribution
(`DIGITAL-HUNT.md` "Price test"), including the pre-payment read cost. The risk
isn't margin, it's that there is no acquisition or retention infrastructure at
all — no email capture (Phase 1 fixes that), no repeat-purchase surface, and
`ref` exists in the API but the client never forwards it.

- **Retire or resize The Set.** `[assumption]` Three hunts sold to a
  one-occasion buyer, with credits in a browser, is a liability that looks like
  a bundle. Options: (a) retire, (b) "two trails" for a couple at £8.99, (c) keep
  only with server-side credits and a receipt email. Decide before promoting it.
- **Wire the referral:** the reveal's copy-back CTA already prints the origin;
  make the recipient's link carry `ref=<token>` so a new gift created from it is
  attributed and eligible for the £1-off already implemented server-side.
- **A printable artefact.** `[evidence]` `RESEARCH.md §5` records the posterly
  pattern (HTML → print-ready PDF); `RESEARCH.md §1` says the market band is
  £25 and that buyers pay for *keepsake objects*. Ship **print-at-home PDF**
  (letter + photographs + a still of the world) as a free inclusion at £4.99 and
  a paid extra later. It raises perceived value at near-zero marginal cost, and
  it's the honest bridge to a physical product.
- **Hide-tier fallback.** `[evidence]` If the giver pays £9.99 and never hides
  the thing, the recipient hits a permanently locked keepsake. Add a
  giver-set fallback ("if I don't hide it, open it on <date>") and a nudge email.
  The most expensive tier must not have the worst failure mode.
- **Price test, later:** one variable at a time, after 25 paid gifts. Do not
  touch prices in the same window as the Phase 1–3 changes.

---

## Phase 5 · Hand the roadmap its evidence (gate, not work)

Start the world-first hunt (`DIGITAL-HUNT.md`) only when **all** of these hold:

| Gate | Threshold | Why |
|---|---|---|
| Paid gifts | ≥ 25 across ≥ 3 weeks | puts a floor under conversion claims |
| Recipient completion | ≥ 60% reach the reveal | the hunt is finishable uncoached |
| Recipient engagement | median ≥ 2 rounds read (not clicked) | the search is being experienced |
| Note-back or reply | ≥ 25% | someone felt something |
| Delivered without support | ≥ 95% via email path | the funnel is boring |
| Cost per fulfilled gift | ≤ 25% of price, measured | model meets invoice |

**If the gates fail, the honest read is that the trail is a letter with a game
around it.** Then build *that* — better letter, printed artefact, memory archive
— and leave the 3D world as a keepsake flourish, not the product. That is a
legitimate outcome and a cheaper business; write it down before the data arrives
so it can't be rationalised away afterwards.

**Kill criteria for the whole thesis:** if across 25 paid gifts recipients
consistently skip the rounds, don't enjoy the reveal, and never mention it to
the giver, stop investing in the search mechanic and re-price as a novelty
greeting card.

---

## Sequence at a glance

| Phase | Ships | Effort | Blocks | Can slip |
|---|---|---|---|---|
| 0 · Observe | notes, 5 events | 3–5d | everything | no |
| 1a · Giver's words | letter is real | 1–2d | delivery email copy | no |
| 1b · Email + lookup + schedule | delivery, recovery | 3–4d | monetisation, measurement | no |
| 2 · Payout + honest misses | the trail earns the gift | 4–6d | world-first gate | yes, if 0 says rounds are dead |
| 3 · One photo, agent decides, Back | conversion | 3–5d | volume | yes |
| 4 · Set decision, PDF, referral, Hide fallback | margin + repeat | 2–4d | — | yes |
| 5 · World-first | the next product | — | gates above | — |

Total to a defensible position: **~3 weeks of work, 5 observed recipients, 25
paid gifts.** Not more code than that.

---

## Explicit non-goals (for this quarter)

- No new studio, pilot, prototype or scene. `[evidence]` Four recipient
  experiences already exist; more is dilution, not exploration.
- No accounts, no subscription, no recipient payment.
- No new 3D provider, world quality work or object anchoring — that's Phase 5's
  prerequisite, and it's the roadmap's job.
- No ad spend before the email list exists and the funnel is measured.
- No visual redesign. The craft is already the strongest part of the product.

---

## Decisions needed from the owner (answer before Phase 1 starts)

1. **Are the giver's words core, or is the AI the author?** This changes the
   editor, the tone of the product and the claim on the landing page. I'd argue
   core — a gift with no words from the giver isn't a gift.
2. **Does The Set survive?** Needs an answer before any promotion or pricing
   work touches it.
3. **Is a printed artefact in scope this quarter?** It's the cheapest route to
   the £25 band the research describes.
4. **What counts as "the gift worked"?** I've proposed recipient completion ≥
   60% and note-back ≥ 25%; these numbers are invented and should be chosen by
   the person who will feel the disappointment.

---

## What this plan deliberately does not do

It doesn't redesign anything, doesn't add a scene, doesn't touch the 3D world
and doesn't argue about taste. Every phase ends in a number from `events`, a
line in a recipient's transcript, or an email in someone's inbox. The strongest
sentence in the existing docs is *"these are proposed observations, not
results"* — the job now is to stop proposing.
