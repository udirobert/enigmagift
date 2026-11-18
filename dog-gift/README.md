# dog-gift — isolated recipient build

This is the [canonical EnigmaGift example](../notes/CANONICAL-GIFT.md). The instructions below describe the current build, not the proposed redesign.

Standalone Vite root for one public gift page. Shares the parent repo's
`node_modules`; does not import or modify the main app.

## Build

```sh
./node_modules/.bin/vite build dog-gift --outDir /tmp/eg-dog-gift-1826
cp /tmp/eg-dog-reference-1826/room.jpg /tmp/eg-dog-gift-1826/room.jpg
```

The reference photo (`room.jpg`, EXIF stripped, 1800×1281) is copied into the
deploy output only — it is never committed to the repo.

## Runtime contract

The page fetches same-origin `world.json` at "Step inside" time:

```json
{ "rad": "<url-or-path>", "collider": "<url-or-path>" }
```

`rad` is a RAD Gaussian-splat world (Spark `SplatFileType.RAD`, `paged: true`),
`collider` a GLB loaded with `GLTFLoader`, kept invisible and raycast for the
walk guard. Both mount under the shared root transform
`(0, 1.5, 0)`, rotation `[π, π, 0]`, scale `2.5`.

If `world.json` is absent, fails, or WebGL is unavailable, the page falls back
to the photograph flow — clue, note and invitation all still work.

## Files

- `index.html` — shell
- `main.ts` — UI flow: cover, photo pins (normalised coords, 1800×1281 frame),
  dog clue/asides, Open the note, invitation, skip/replay, fallback
- `world.ts` — `enterWorld(node, {rad, collider})`: splat + collider load,
  first-person WASD/arrow/drag/step controls, wall-guard raycast, bounded walk,
  reset, dispose
- `style.css` — warm ink/cream cinematic styling

Pins (normalised): dog (0.74, 0.74), table (0.51, 0.35), plant (0.90, 0.43),
coats (0.22, 0.31). They anchor to the source image only — nothing in the
generated room is treated as calibrated to it.

## Not in scope

No payment, login, sending, publication, or extra images. The invitation copy
is a sample promise, not a paid voucher.
