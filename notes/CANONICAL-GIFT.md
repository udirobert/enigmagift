# Someone saved you a seat

[Open the public recipient gift](https://saved-you-a-seat--enigmagift.netlify.app/). This dog-and-dining-room gift is the reference for iterating EnigmaGift. The shelf and Marble studio remain experiments, not substitutes for this recipient journey.

## Two published builds

The [original gift](https://saved-you-a-seat--enigmagift.netlify.app/) is the baseline: original photograph, generated room, a dog clue in the controls, four targets on the photograph and a sample dinner invitation. The world beyond the camera is an interpretation, not a scan. Neither demo is a checkout.

The [silent preview](https://for-you-room--enigmagift.netlify.app/) is the comparison for the next experiment. An unmarked photo opens into the room. Taps on the dog, chairs, table, plant, coats, TV, shelves and door use hand-authored picking regions. Confirmed taps give local feedback; two consecutive misses before finding the dog prompt one nudge. Exploring does not cost guesses. The note currently opens via a panel, not a piece of paper on the table. A motion-free text route and direct open are available.

## Interaction research and decisions

**Make the room easy to touch; leave the gift interesting to deduce.** A recipient needs to know that the room understood *chair*, not whether the chair solves the puzzle. When two objects overlap and the target is uncertain, a neutral ripple is preferable to the wrong character answering.

| Precedent | What to borrow |
| --- | --- |
| [Gone Home: Fullbright on examining and putting back objects](https://fullbright.company/2012/09/28/a-non-violent-immersive-sim/) | Ordinary pencils and meaningful keepsakes share an interaction. A coat can tell a joke and the dog can give evidence without markers distinguishing them in advance. |
| [The Room: Fireproof on designing for fingers](https://www.pocketgamer.com/the-room/behind-the-touchscreen-the-room/) | Make one action tactile: find a folded note on the tabletop, then unfold its corner there. Provide an equivalent button. |
| [Outer Wilds: curiosity-driven exploration, GDC slides](https://ubm-twvideo01.s3.amazonaws.com/o1/vault/GDC+2021/beachum_gdc_2021%281%29.pdf) | Offer a question whose answer is visible from somewhere else. Let the player choose the dog's viewpoint rather than pulling the camera there. |
| [Unpacking: Witch Beam on object and surface sounds](https://witchbeam.com.au/2022/07/28/taking-a-deep-dive-into-unpackings-sound-design/) | A collar tag, coat or paper crease can acknowledge an action without another caption. Work silently first; sound is optional. |

### Where a tap landed versus what was touched

- **Now:** keep calibrated, forgiving targets tied to the generated world revision; test when chairs overlap the table and from a second viewpoint. A [simplified collider](https://docs.worldlabs.ai/marble/export/mesh) is useful for walking and occlusion, but does not label a paw as part of the dog.
- **Authoring experiment:** render a short camera sweep of the generated room. Let the giver select an object; try [SAM 2](https://ai.meta.com/research/sam2/) to track its mask and let them correct it from another angle. Store the approved object ID, response and camera pose, borrowing [SuperSplat's annotation workflow](https://developer.playcanvas.com/user-manual/supersplat/studio/annotations/) without showing recipient pins. Image/video masks can support guided views; they are not 3D hit regions for arbitrary free walking. No model call per recipient tap.
- **Research only:** [Gaussian Grouping](https://github.com/lkeab/gaussian-grouping) and [SAGA](https://jumpat.github.io/SAGA/) investigate object identity within Gaussian scenes, with scene-specific preparation. Neither is established as a drop-in solution for the streamed world. Do not make them a prerequisite for the pilot.

## Sound and prices (experiments)

Start silent and make sound opt-in; the gift must work completely with captions alone. Try a single collar jingle from the dog’s position before testing a score. Use one approved, pre-generated fictional character voice with replay and captions. Quiet room tone, ducked under speech; reserve a short musical phrase for the note opening. No autoplay speech, overlapping lines or fabricated family voices. If using ElevenLabs, generate server-side once per approved gift, cache licensed assets, keep the key out of clients, and never send the room photo to generate a line of audio. Budget revisions and confirm commercial usage before charging.

Test £4.99 for the complete silent hunt, £9.99 for a richer Story with a voiced witness and optional soundtrack, £19 for the already-proposed set of three Story gifts. Never charge the recipient. Do not gate hints, direct interaction, captions or the reveal on a premium tier. Test willingness to pay and cost per fulfilled gift before making audio entitlements promises.

## Tabletop cut (experiment preview)

The [silent preview](https://for-you-room--enigmagift.netlify.app/) remains the control. The local tabletop preview (not published) in `dog-gift-tabletop/` began with the three interactions below. The current family-room pilot also adds a still-atlas photo route, help ladder, keepsake recap and recipient-preview editor. The published control is unchanged; the current pilot is no longer a controlled comparison of only three interactions.

1. **Accent what was touched.** A chair tap outlines the specific chair back or leg patch for a moment, rather than answering for the whole object class.
2. **The dog's viewpoint is optional.** After meeting the dog, 'Look from here' drops to a low camera beside it where a paper edge shows under the table lip; 'Back to my spot' restores the previous pose.
3. **The note lives on the table.** A folded paper sits on the table lip. A first touch offers Unfold; a second unfolds in place and the invitation reads beside the table, not in a modal.

Run card: give a first-time recipient ONE build with the neutral instruction 'Someone sent you this. Open it as you normally would.' Assign different people to different cuts so nobody learns the solution. Observe intended versus registered taps, why they chose the table, and whether they keep exploring after opening. No analytics ship with these builds; these are proposed observations, not results.

## What to test first

The run card above describes the next experiment. No further builds are needed to run it; these are proposed tests, not observed outcomes.

## From recipient to giver (local pilot)

The same tabletop cut is served locally on demand — port numbers are conventions, not a promise something is running: `:4296` serves the latest family-room pilot (still atlas, keepsake recap, help ladder, recipient-preview remix) and `:4297` the root frontend. See [README](../README.md#development) for the run commands and [dog-gift-tabletop/README.md](../dog-gift-tabletop/README.md#verification-so-far-manual-one-session) for the verified UI checks. The giver shortcut `?make=1` opens a clean editor without playing the demo; 'Preview this gift' opens the draft inside an isolated same-origin iframe (`?recipientPreview=1`) where the recipient cover is signed with the giver's names — the preview stays in the tab. 'Create recipient link' saves a snapshot as described below. Human first-time-recipient research has not been run yet — the run card above is still the next experiment, not an observed outcome.

The editor also implements saved links: "Create recipient link" saves an immutable edition snapshot to `/api/room-gifts`; the client constructs a recipient `#gift=` link and a private `#manage=` link that can close it. Demo, in-tab preview and saved-link flows have local browser evidence. The pilot is published on Cloudflare Worker `enigmagift-room` (`https://enigmagift-room.trustfall.workers.dev`) backed by the persistent Fly API; a disposable fixture verified the real create → open → refresh → close path end to end on 2026-11-21. Human first-time-recipient research has still not been run.

A room revision owns the licensed world, calibrated objects and permitted template. A gift edition references that revision but owns its private recipient, words and reward. A play session belongs to one recipient; it is never copied. Only a room owner can opt a private world into reuse; a playable link is not a licence to republish a home. In production enforce that on the server, offer revocation and never fork gift links, codes, voice recordings or run history. The link pilot does enforce a server-side room/revision allowlist for saved links; real licensing still requires per-owner consent, not just a flag.

Play and remix previews stay free. Test £4.99 for sending a new personal edition of an approved room; test £9.99 for a richer authored Story and £19 for three Story sends. A new world build is a separate cost experiment, not included by assumption. The current link pilot shares links free — no checkout, no email delivery — and charging is a separate future experiment, not a commitment made here.

Manually author the first rooms and log minutes for object placement, writing and corrections. Reuse approved anchors, fallback descriptions and revision once, not private stories. Count recipient → started a draft → previewed → paid and sent to a different person → next recipient opened. Measure contribution per reused send after fees, VAT where due, serving, moderation/support and amortised world cost; compare to fresh rooms. Invite people to opt in to measuring this during a pilot; no events leave this version.
