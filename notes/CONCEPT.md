# EnigmaGift — product concept

**Status:** canonical product concept · **Last updated:** 2026-11-26

**Scope:** the shipped trail-first product. The possible world-first future is
in [DIGITAL-HUNT.md](DIGITAL-HUNT.md); delivery sequencing is in
[PLAN.md](PLAN.md).

> **Let the photographs lead them to it.**

EnigmaGift turns photographs of a meaningful place into a short trail of
recognition, deduction, and personal memory. The giver photographs a place they
share with someone; the product finds details worth noticing, the giver approves
the trail, and the recipient follows it to a keepsake containing the giver's own
words and a navigable memory of the place.

The recipient never pays, signs up, or installs anything.

---

## The one-liner

Pick a place that matters. Photograph it. Let the photographs become a trail
only one person would fully understand — then let that person arrive at the
words and memory you left for them.

The input is deliberately **photos of a place**, not photos of a relationship.
Places are easier to photograph, less creepy to upload, and available to almost
every kind of relationship: partners, friends, family, collaborators, or even
future-you.

---

## Product principles

1. **The giver's meaning matters more than the AI's cleverness.** The agent can
   notice and draft, but the giver approves the facts and writes the final
   emotional truth.
2. **The recipient is a guest, not a user.** No account, no payment, no setup,
   no app install.
3. **The lock is theatre, never a paywall.** The trail should create attention
   and anticipation, but the gift must always be reachable.
4. **Digital is the default.** Distance, timing, and buyer labour should not
   prevent the gift from working. The physical Hide is an upgrade, not the base
   product.
5. **Specificity is the magic.** “The chipped blue door” is better than “a
   door”; “the seat where you both waited out the rain” is better than either.
6. **AI proposes; people decide.** The buyer/editor gate is a hallucination
   control and an emotional authorship control.
7. **The keepsake should feel kept.** The letter, photographs, generated world,
   and optional portrait are residue the recipient can return to after the
   trail is over.

---

## The shipped experience

| Step | What happens | Product purpose |
|---|---|---|
| Choose | Giver selects or takes 1–12 photos of a meaningful place | Low enough friction for a real gift |
| Read | Vision pipeline produces located observations from the photos | Create the feeling of “it noticed” |
| Approve | Giver accepts, edits, removes, or re-derives clues and chooses the world photo | Prevent hallucinated or emotionally wrong output |
| Write | Giver writes or edits a short letter, optionally using agent drafts | Make the artefact a gift rather than generated content |
| Seal | Stripe payment creates the recipient link; Hide adds a physical code ending | One payment, one published recipient link |
| Play | Recipient moves through deduction rounds with honest misses and progressive payout | Attention, recognition, anticipation |
| Reveal | Recipient reaches the giver's words, photographs, 3D world, and optional portrait | A durable emotional artifact |

For The Hide, the giver physically leaves something at the place and writes the
unlock code into it. That physical moment is valuable because it is real effort
and real presence — but it is not required for the default gift.

---

## Tiers

| Tier | Price | Shape |
|---|---:|---|
| **The Trail** | £4.99 | Fully digital; rounds open the keepsake directly. |
| **The Hide** | £9.99 | The digital trail plus a physical hidden thing and code entry. |
| **The Set** | £19 | Three hunts total: the purchase hunt plus two further credits. |

The read and preview are the free taste; the sealed recipient link and keepsake
are the paid object. The recipient is never charged.

---

## Why this is different

| Common personalised gift | EnigmaGift |
|---|---|
| Uses a photo as decoration | Uses photos as evidence in a place the recipient knows |
| Ends when the object/card is delivered | Creates a short experience before the keepsake |
| AI writes the sentiment | AI notices details; the giver owns the sentiment |
| Personal but static | Personal, interactive, and tied to a real place |
| Often requires shipping or coordination | Default gift works at any distance |

The physical Hide tier adds the most filmable beat — someone standing in the
real place holding something real — but The Trail is the scalable product.

---

## Named risks

- **Hallucinated detail.** Mitigate with buyer approval, visible uncertainty,
  and clue editing. Never treat model output as fact.
- **Generic output.** If clues could apply anywhere, the product becomes a
  greeting card with extra steps. Specificity is the quality bar.
- **Buyer effort.** One photo must be enough; advanced editing must remain
  optional.
- **Recipient impatience.** Rounds must pay out emotionally. If recipients do
  not read or care, simplify rather than adding more game.
- **Physical failure.** Weather, access, or another person can ruin a Hide.
  The digital keepsake must still arrive.
- **Privacy discomfort.** Photos are personal and places can be sensitive.
  Upload consent, metadata stripping, deletion, revocation, and clear provider
  disclosure are product features, not legal garnish.
- **World overreach.** The generated world can deepen the reveal, but the
  current product must not depend on perfect 3D reconstruction.

---

## Current boundary

The core trail-first product is live and instrumented, but still pre-launch.
The next product question is not “what feature can we add?” It is:

> Does an uncoached recipient understand, enjoy, and emotionally value the
> experience enough that a giver would buy it for them?

That evidence gate is in [PLAN.md](PLAN.md). Historical feasibility evidence
for located vision observations is in [SPIKE.md](SPIKE.md). Operational truth
is in [OPS.md](OPS.md); API behavior is in [API.md](API.md).
