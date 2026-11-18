# dog-gift-next — silent canonical recipient v2 (preview)

Standalone Vite root for the next iteration of the canonical gift. Shares the
parent repo's `node_modules`. The shipped `dog-gift/` build is untouched.
Deploy target after review: `https://for-you-room--enigmagift.netlify.app/`.

## Build

```sh
./node_modules/.bin/vite build dog-gift-next --outDir /tmp/eg-dog-silent-v2
cp /tmp/eg-dog-gift-1826/room.jpg /tmp/eg-dog-gift-1826/world.json /tmp/eg-dog-silent-v2/
```

`calibrate.html`/`calibrate.ts`/`vite.calib.config.mjs` are dev-only tooling —
the normal build emits `index.html` + `assets/` only. `calibrate.html` renders
the world at the fixed 900×640 pose and prints collider XYZ + NDC per click;
it is never linked or shipped publicly.

## Flow

Unmarked photo + folded paper corner ("For you") → "I hid a gift in this
room." → Step inside. The world loads *behind* the paper and only resolves
when the collider is loaded AND `spark.activeSplats > 0` across real frames
(30 s timeout → honest text fallback). Paper lifts + wipes (~0.8 s; instant
cut under reduced motion). Opening pose is the calibrated yaw π view matching
the photograph; portrait viewports widen vertical FOV (55→≤100°) so the floor
and dog are never cropped out.

- Tap (<7 px travel) vs drag look is distinguished in the renderer; drags and
  overlay-open states never fire a pick.
- ANCHORS centres (measured from the rendered room, revision-tied to the RAD
  byteSize) still position captions; picking itself uses the patches below,
  denied when nearer wall/furniture geometry blocks the ray (> ~0.8 units).
- Eight named object types — dog, table, chair, plant, coats, tv, shelves,
  door — are hand-traced 3D polygon patches on this world revision
  (`ANCHOR_REVISION = 44124720`); picking is ray ∩ patch plane + even-odd,
  nearest positive hit, ~0.8-unit wall tolerance, ~5 CSS px edge grace. No AI
  or network call happens per tap — all captions are authored text. Blank
  taps give a plain ink ring and two consecutive misses before the dog is
  found surface a one-shot collar tag; nothing idles.
- dog → "I nap under it. You sit around it." (anchored caption);
  plant/coats → asides; table → folded slip → deliberate "Unfold the note" →
  "Someone saved you a seat." + invitation. Keep exploring / Start again
  (real reset). No counters, no forfeiting.
- Two deliberate blank taps before the dog is found → a one-shot paper
  collar tag at the dog anchor (or a short status line when off-screen).
  No automatic idle hints; the manual nudge stays in Help.
- HUD is deliberately minimal: Help + walk steps; a transient "Drag to look.\n  Tap to explore." hint fades after ~4 s. Help holds Reset, a nudge,\n  "Explore without motion" and direct "Open the note".
- No `world.json`/WebGL → text path with the same clue and object choices
  (never labelled by solution) plus direct open.

## Controls

Drag/swipe look · WASD/arrow keys walk + strafe · ‹ › step buttons ·
Reset view · Escape releases the canvas. Keyboard nav is ignored while any
overlay is open or a field is focused. Walk is bounded (5 m radius, eye
height locked) with a collider raycast wall guard.

## Tested (named session, headless Chrome)

- Desktop 1280×577: cover → enter → rendered room → dog tap (caption),
  table tap (slip → Unfold → title + invitation), plant/coats asides,
  step-forward then dog tap from new perspective, drag = no pick,
  ceiling/blank tap = no reveal, help → direct open, replay reset.
- 390×844 touch emulation (labelled — not a physical device): letterboxed
  cover, dog visible in-world after portrait FOV fix, dog/table/note chain.
- Reduced motion: simple cut, no paper animation, collar tag static.
- Fallback: world.json removed → text path fully playable to the invitation.
- Collar tag appeared once ~7 s after world-ready, auto-dismissed.

Screenshots: `/tmp/eg-v2-cover.png`, `/tmp/eg-v2-inside.png`,
`/tmp/eg-v2-note.png`, `/tmp/eg-v2-mobile-cover.png`,
`/tmp/eg-v2-mobile-inside2.png`, `/tmp/eg-v2-mobile-dogclue.png`,
`/tmp/eg-v2-mobile-slip.png`, `/tmp/eg-calib-yaw314.png` (calibration).

## Limits

- Patch depth is approximated with a constant world z per object, so very
  oblique angles can feel loose — patches are calibrated for the opening
  pose and nearby steps, not free-roam precision.
- Anchors are tied to this RAD revision (`ANCHOR_REVISION = 44124720`);
  regenerating the world requires recalibrating via `calibrate.html`.
- Single bundle (~3.3 MB) loads three+spark up front — no code-split yet.
- No audio, no payment, no sending. Invitation copy is a sample promise.
