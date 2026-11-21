# dog-gift-tabletop — tabletop experiment (isolated cut)

Experiment cut of `dog-gift-next/` with the three interactions called out in
`notes/CANONICAL-GIFT.md` ("What to test first") plus the fuller family-room
pilot layer (still atlas, help ladder, keepsake recap, recipient-preview
remix). Control build stays at `dog-gift-next/`; nothing here feeds back
into it.

## The three changes

1. **Touched-part accent.** Picking now returns the actual traced patch, not
   just the target type. A confirmed chair tap outlines/fills only that
   world-space polygon (back vs leg, left vs right) for ~450 ms — warm paper
   edge + translucent fill, tracked per frame, `pointer-events:none`. Static
   outline under reduced motion; never fires on occluded or rear-plane taps.
2. **The dog's viewpoint.** After inspecting the dog, a "Look from here" chip
   appears. Choosing it cuts (eyelid blink, instant under reduced motion) to a
   low camera beside the dog aimed at the table lip — "Back to my spot"
   restores the exact previous pose. No auto-open, walking is parked while
   crouched, and tabletop taps keep working without visiting.
3. **The note lives on the table.** A folded cream paper mesh sits on the
   table lip (hinged flap overhanging the edge, visible from the dog's low
   angle). First table/paper inspect shows an anchored "Unfold" chip; a second
   deliberate touch on the paper — or the chip — unfolds the flap in place and
   opens a small reading card that keeps the room visible. Help/direct-open
   and the no-WebGL text path still use the accessible dialog.

The control's missed-tap nudge, direct-open route and ability to keep
exploring remain available; the photo route and reveal actions have evolved
in the pilot below.

## Family-room pilot additions

The same cut also carries the fuller local hunt layer:

- **The reverse side.** Behind the start view (negative z) a cream illustrated
  postcard on a small easel and a ribbon bookmark on a peg are real meshes —
  placed by raycasting the collider backward from the start pose (max ~3.5 m
  or just before the first wall). Both are pickable like any other target,
  give their own clue/keepsake lines, and appear in the textpath. A one-time
  early line on a familiar item mentions "a card behind you".
- **A quiet run.** `run.ts` records one attempt in memory: route
  (found/guided/direct), active time (paused when the tab hides), exploratory
  taps, distinct discoveries, explicit help requests. No storage, no network.
  After opening, "How the hunt went" shows the frozen recap in place.
- **Success, not just a slip.** The first time the table's envelope is
  discovered the status reads "You found it. I kept it safe for you." before
  the slip line — a direct open never claims a find.
- **Help ladder.** "A little more help" gives one state-aware nudge at a time
  (watcher near the floor → opt-in dog pose → paper edge with a paper flash);
  "Walk me through it" spells out dog → sightline → table → Unfold and marks
  the run guided; "Just open my gift" is always present.
- **Remix → recipient preview.** `ROOM.allowRemix` gates a post-reveal "Make a
  gift in this room" editor — To, From and the invitation first, then the
  dog/postcard/ribbon clues inside an optional `details` (cleared clue fields
  fall back to the draft defaults; to/from/invitation stay required,
  trimmed, maxlength); `?make=1` opens a clean editor without playing the
  demo. The intro asks for the message they will find and a footer is
  explicit: preview only, nothing is sent, the draft clears on reload —
  backing out preserves the unsaved draft in memory. There is no backend,
  no payment and no persistence. Submitting opens the draft inside a
  full-window same-origin iframe (`./?recipientPreview=1`) — the parent's
  room, run and keepsakes are never replaced. The draft travels by
  `postMessage` in memory only (no URL, no storage); the child validates
  source/origin/room revision/field lengths, signs its cover
  `For {to}, from {from}` via `textContent`, runs a fresh independent run,
  and offers no remix CTA. "Back to editing"/"Back to my draft" removes the
  frame and restores the form and the original session. A short paper-fold
  marks the transition (skipped under reduced motion).
- **Still atlas — "Explore in photos".** The flat text fallback is named
  *Explore in photos* (entry link, help button and panel title all read it),
  is available before or without loading 3D, and a failed room open recovers
  into the same photo route without blaming the device. Inside it is a
  two-place atlas — "Around the table" / "On the other side" — backed by ten
  local captures
  (`public/stills/*.webp`, cropped from the rendered world, revision
  44124720). Each artefact shows its actual still, one spatial sentence and
  the edition-aware clue; selecting never moves the camera. "Take me there"
  (3D only) jumps to a saved look with "Back to my spot" restoring the exact
  pose; "Return to the room" simply leaves. Ask-the-dog, the low observation,
  the table slip and Unfold are preserved. Back works one level at a time
  (still → artefact list → places), each labelled where it leads. Back from
  a still restores focus to its item; leaving a place focuses the first
  place control.
- **Keepsake recap.** A `keepsakes` set records intentional inspections of
  the three authored memories (dog/postcard/ribbon) in either mode, past the
  reveal; a new attempt clears it. The recap panel reads "You found your
  gift." or "Your gift is open.", suggests one still-unseen keepsake
  (ribbon → postcard → dog, no spoilers), and keeps the frozen route/time/
  discoveries/hints behind a collapsed "See my trail". "My trail" stays
  reachable after the reveal; all seen reads "You found everything that was
  left for you."
- **Quiet endings.** Both the unfolded paper note and the gift note end on
  one primary "Keep exploring"; recap, remix and replay sit behind a
  collapsed "More options" disclosure. The pre-reveal slip offers only
  "Unfold the note" and a dedicated "Not yet" — secondary actions can't
  leak in before the gift is open.

## Build

Run from the repo root (it reuses the root's vite + node_modules):

```sh
# local dev server
./node_modules/.bin/vite dog-gift-tabletop --host 127.0.0.1 --port 4296 --strictPort

# static build
out=$(mktemp -d) && ./node_modules/.bin/vite build dog-gift-tabletop --outDir "$out" \
  && cp -R "$out"/. /tmp/eg-family-room-pilot/
```

`room.jpg`, `world.json` and `stills/` ship alongside; `?recipientPreview=1`
is only ever used by the in-page iframe, `?make=1` is a local author
shortcut.

Runtime contract is identical to the control: same-origin `world.json`
`{rad, collider}` remote URLs, shared root transform, `ANCHOR_REVISION` must
match the streamed world (44124720).

## Verification so far (manual, one session)

Checked in Ego Browser (desktop 1450x736, emulated 390x844 and 320x568):
the root door layout shows no overlap at 390 and no horizontal overflow at
320; photos accumulate and deduplicate to five, with consent gating Build;
the selector caps its stored selection at 12. On this cut the editor headings stay inside the panel at both widths,
a preview shows the personalized invitation and a backed-out draft is
retained, and optional empty clues preview fine. The 3D path worked end to
end (dog → "Look from here" → paper at the low pose → Unfold), and a forced
world.json failure recovered into the photo route. Not exercised: real
phones, full checkout/generation/sends, and the earlier 3D load failure's
root cause is not established.

## Experiment run card

Give each first-time recipient ONE build (control or this cut) with the neutral
instruction "Someone sent you this. Open it as you normally would." Assign
different people to different cuts so nobody learns the solution. Observe:
intended vs registered taps, what led them to the table, whether they explore
after opening. No analytics are collected; these are proposed observations,
not results.
