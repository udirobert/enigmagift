# Spike — vision located-observations (2026-11-17)

**Verdict: FEASIBLE.** Gemini 2.5 Flash returns structured, bbox-localised
observations good enough for auto-crops and hide-spot proposals.

> **Status (same day, end):** shipped. The pipeline is live in production and the
> "Not yet tested" / "Next" items below are all done. Vision now runs through
> **SandBase** (OpenAI-compatible) with Gemini as fallback — see `OPS.md`. The
> cross-image pass works, HEIC is handled (multer + `image-size`), and live gifts
> produce grounded throughlines / placeGuess / hide spots in ~80–110s.

## Setup

- Model: `gemini-2.5-flash` via existing key (found in Dev .env files; never printed)
- Test set: 6 real place photos (Korean cafes, park bench, blue door, hanok
  street, bookstore — Wikimedia Commons)
- Prompt: JSON-only, 8–15 observations `{description, category, bbox[x,y,w,h]
  normalised, confidence, hideSpotPotential}`, temp 0.2
- Verification: drew each bbox as a red rectangle (ImageMagick), sent annotated
  image back to the model, asked YES/PARTIAL/NO

## Results

- **Latency:** 11–22s per image
- **Observations:** 12–15 per image, descriptions specific and clue-worthy
  ("black building facade with a prominent silver pixelated sign",
  "four round cushions in blue, light grey, dark grey, and brown")
- **JSON reliability:** 3/6 clean parses; 3 failed on malformed output → needs
  a repair pass (retry, json-repair, or fenced-strip). Not a blocker.
- **Bbox accuracy (verified):** YES ×3, PARTIAL ×2 on first 5 checks —
  crops land on the described detail; PARTIALs are slightly loose, fine for
  clue crops. Full run hit a rate limit mid-way; spot-check rate ~80%+ usable.
- **hideSpotPotential:** flags present and plausible (steps, cushions, planters
  flagged; signs/facades not). Needs the cross-image pass to turn flags into
  actual hide-spot *proposals*.

## Now done (was "not yet tested")

- **Cross-image pass** — works live. Feeds all per-photo observations into one
  call → throughline, placeGuess, hide-spot proposals, and round material. On
  real gifts it produces concrete, photo-grounded output (e.g. "Fort Point
  National Historic Site under the Golden Gate Bridge"). A guard
  (`isGenericPlaceGuess` in `pipeline.js`) rejects generic scene categories and
  falls back to the throughline's phrasing.
- **HEIC handling** — superseded 2026-11-25. The production server now
  normalizes every accepted upload through sharp and rejects bytes it cannot
  decode, so undecodable HEIC never becomes a metadata-bearing stored original.
  Safari 17+/iOS can decode HEIC in the browser and re-encodes it before
  upload; other browsers may reject HEIC instead of offering the gift. Widening
  that coverage would require a measured WASM decoder decision, not the spike's
  original pass-through behavior.
- **JSON reliability** — the spike's 3/6 clean-parse concern is handled by
  `repairJson` (fence-strip + trailing-comma + balanced-brace slice), a nudge
  retry on malformed output, and cross-model failover.

## Pipeline implication

Per gift: ~6 images × ~20s ≈ 2 min of vision time + one cross-image call.
Well inside delivery windows. Cost ≈ fractions of a penny per image —
free-tier-ish at our volumes.

Artifacts: `/tmp/enigmabox-spike/` (images, `out/*.json`, `verify_results.json`).
Ephemeral — re-run `vision_spike.py` if needed.

## Next (all shipped)

1. Cross-image pass test (throughline + hide spots) — done, live.
2. Wiring: upload → per-image observe (parallel) → aggregate → editor UI — done.
3. The Door's "it noticed" captions are real now that this pipeline exists.
4. Deploy + Stripe £19 gate — done (see `OPS.md`).
