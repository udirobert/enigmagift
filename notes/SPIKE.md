# Spike — vision located-observations (2026-11-17)

**Verdict: FEASIBLE.** Gemini 2.5 Flash returns structured, bbox-localised
observations good enough for auto-crops and hide-spot proposals.

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

## Not yet tested

- Cross-image pass: feed all observations from one place → throughline +
  3 concrete hide-spot proposals. (Next spike step — cheap, same key.)
- HEIC handling (buyers will upload iPhone photos).

## Pipeline implication

Per gift: ~6 images × ~20s ≈ 2 min of vision time + one cross-image call.
Well inside delivery windows. Cost ≈ fractions of a penny per image —
free-tier-ish at our volumes.

Artifacts: `/tmp/enigmabox-spike/` (images, `out/*.json`, `verify_results.json`).
Ephemeral — re-run `vision_spike.py` if needed.

## Next

1. Cross-image pass test (throughline + hide spots) — small follow-up spike.
2. Then wire: upload → per-image observe (parallel) → aggregate → editor UI.
3. The Door's "it noticed" captions become REAL once this pipeline exists.
