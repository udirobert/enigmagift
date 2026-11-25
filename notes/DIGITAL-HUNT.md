# Immersive memory hunt — proposed, not shipped

Turn one or more photos of a place they know into a small 3D world. The recipient explores meaningful objects, talks to a character who belongs there, and solves a mystery to find a digital or physical gift. The world is the hunt, not the prize after it. No physical visit or new capture is required for a digital gift if the source photos are usable. The flat memory room is an accessibility and delivery fallback, not the base commercial promise. See [World providers and redundancy](WORLD-PROVIDERS.md) for the technical plan.

## Explore freely; guess deliberately

Giver flow: add photos → pick or place things that matter → share a real memory → hide the gift → preview as the recipient. Start with guided viewpoints, confirmed 3D anchors, one placed prop or pet, and two approved lines. The pet can supply evidence or simply bring back a memory. Difficulty progresses from a direct hint, to combining clues that rule out alternatives, to inferring a pattern from several memories. For physical endings, show any code to the giver before they hide the gift.

The giver marks the object hiding the gift, adds a message, recording, invitation or their own gift-card link, and answers: ‘What happened here that the photo cannot tell us?’ AI identifies visible objects and proposes a short set of connected clues. The giver approves the facts, tone, tap regions and final answer in a playable preview. Never invent a shared memory. If there aren’t enough distinct objects, ask for another photo or offer a shorter trail.

Exploring is free and unordered. Each marked object gives a small reward of its own (a caption, a joke, a voice clip) and can narrow the answer without naming it. In a childhood living room, tapping the controller plays your brother’s victory yell and reveals ‘within reach of player two’; tapping the lamp shows a photo of your reading corner and adds ‘somewhere soft’. Together the clues point to the armchair, not the games shelf or the sofa across the room. Let the player inspect the chair before choosing ‘I think it’s here’. No pixel hunting: offer labelled, keyboard-accessible objects as well as tap targets.

Only an explicit guess uses one of three chances. Misses progressively narrow the choices. The last miss offers a guided reveal, and ‘open my gift’ is always available. A paid reward is never lost. Let people revisit the other memories after finding it. Prepare hints once at creation, not via a paid model call on each tap. Keep redemption links out of previews, analytics and NPC context; explain who can open the shared link and how the giver can delete it. No gift-card issuance, custody or redemption guarantee in the pilot.

## Three one-time offers (agreed naming, 2026-11-19 — aligned to the shipped trail-first architecture)

| Offer | Price | What the giver buys |
|---|---|---|
| **The Trail** (default) | £4.99 | One complete digital hunt for one person: photos → 3 deduction rounds → keepsake (letter, photos, 3D world, portrait). No physical step, no code. |
| **The Hide** | £9.99 | One hunt with a physical ending: everything in The Trail, plus the giver hides a thing at the place and the code inside it unlocks the keepsake. |
| **The Set** | £19 | A pack of three hunts, usable separately for different people or occasions. Each hunt is a Trail or a Hide with its own clues, message, reward and recipient link. No subscription. |

One send means publishing one new recipient's hunt. Previews, revisits and resending the same link do not consume another send. The same rounds, hints and guaranteed reveal apply at every price — the recipient is never charged. The set saves £10.97 against three Hides; recommend the cheaper choice when that is all someone needs. Track pack usage as well as purchases; model costs as if all three are sent.

> The earlier Room/Story/Gift-Set naming (immersive world-first hunts) is
> superseded: the world-first hunt remains the roadmap (below), but the
> commercial tiers follow the shipped trail-first flow.

## Local prototype

A playable recipient-room prototype lives at `/studio/room` in the dev server (`npm run dev -- --port 4183`, then open `http://localhost:4183/studio/room`). It is static, curated content only — no checkout, publication or live AI.

The current playable slice lives at `/studio/world` (same dev server, `http://localhost:4183/studio/world`). It is a **limited spatial capture, not a whole room**: the Middlebury 2003 "Teddy" stereo pair (photos + measured disparities, `public/stereo-teddy/`, credited per its permission terms) is rebuilt as two textured meshes, and the recipient slides continuously between the two captured viewpoints — drag, arrow keys or labelled buttons — while authored pins stay anchored to real objects. The pink bear is the witness ('Come round my side…'); from the right-hand sightline a small painted heart appears on the edge of the object hiding the gift. Guessing needs an explicit second confirm; every object yields its memory either way; wrong opens cost nothing and 'Open anyway' is always there. 'Make one' edits names, per-object memories, the bear's line, the reward and the hiding place in the same scene, with See-it-as preview and a proposed £4.99 review step — sending is not available. Everything (entry, bear cue, detour, reveal, post-gift exploring, edit→preview) works without WebGL via the two endpoint photos and on-demand labelled descriptions.

Also still mounted: `/studio/model` (earlier photo→keepsake-GLB explorer slice) and `/studio/marble` (import-your-own world authoring tool). Not yet built: real personal-photo ingest, world generation or object anchoring from a single photo, payment, publication or any provider integration.

Pilot check when a real build exists: 1 person, their own phone, no coaching — record their first object tap, what they think the clue meant, and whether they voluntarily revisit.

## Later, only if the hunt works

Test an optional original Birthday Caper skin: one witness with two prepared answers based on approved clues. Preserve the real room and clue geometry. No GTA/Rockstar branding, copied assets, open-world promise or live NPC chat in the base offer. Defer free roaming, custom rigged characters, and live NPC dialogue; the small authored 3D world remains core.

## Price test, not an observed margin

The table below is a non-world baseline, not an immersive margin or a launch price commitment. See [world costs](WORLD-PROVIDERS.md#cost-and-privacy).

Illustrative GBP per paid gift. Assume standard UK domestic card pricing of 1.5% + 20p (confirm against [Stripe UK](https://stripe.com/gb/pricing) and actual payouts); round fees to pennies. Allow **20p** per photo scene for non-world generation and delivery as a planning scenario, not an invoice or measured average. [Spike](SPIKE.md) describes one vision pass per image plus synthesis, retries and fallback; its early estimate is not a production tariff. [Ops](OPS.md) estimates **US$0.30 per TRELLIS run**; at an assumed £0.80/$ this adds 24p for one successful run, not an interactive NPC world. Conversion rate, retry spend and fixed hosting are unmeasured.

| Offer | Card fee | Illustrative delivery allowance | Contribution per order, no VAT |
|---|---:|---:|---:|
| £4.99 Trail | £0.27 | £0.20 | £4.52 (90.6%) |
| £9.99 Hide | £0.35 | £0.60 | £9.04 (90.5%) |
| £19 Set (×3) | £0.49 | £1.80 | £16.71 (87.9%) |

Budget scenarios only: allow 20p per digital hunt, assume all three hunts in the set are sent. One card payment per order. No 3D included; richer cross-scene synthesis may cost more than this simple allowance.

Contribution = revenue excluding VAT minus card fee on amount charged minus variable delivery cost. Table assumes no VAT due. If £4.99 includes 20% VAT, revenue is £4.16 rounded, photo-only contribution £3.69 (88.7% of ex-VAT revenue), or £3.45 (82.9%) with one legacy TRELLIS keepsake. Neither scenario is net profit: fixed Fly/volume bills, support, refunds, disputes and customer acquisition still need covering. Giver-funded gift-card face value is not our revenue or cost.

The current flow reads uploads before payment, so abandoned drafts count. For example, if each draft actually costs 10p to read and one in four pays, reads alone cost 40p per sale, **replacing**, not adding to, the 20p planning allowance before other delivery costs. Mitigations now shipped: client-side downscale before upload, per-IP and global daily draft limits on `POST /api/gifts`, a 7-day purge of unsealed drafts, and payment-gated sealing/delivery/world generation. For a pilot, reconcile actual AI and delivery charges across all drafts, retries and paid gifts against settled Stripe sales over the same period; separate fixed hosting, VAT, refunds, support and acquisition. Test all three offers with real occasions, and record paid sends, opens, optional objects explored, solves vs guided/direct reveals, and which side memory recipients remember. Judge whether people buy and enjoy the search, not merely whether they redeem a gift.
