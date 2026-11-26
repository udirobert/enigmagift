# Vision located-observations spike — completed

**Status:** completed historical record — superseded · **Last reviewed:** 2026-11-26

This is the feasibility record from 2026-11-17. It is not the current provider
runbook; use [OPS.md](OPS.md) for the live SandBase → Cloudflare Workers AI →
Groq → Gemini fallback chain, production benchmarks, and operating limits.

## Verdict

**Feasible.** Vision models can return structured, bounding-box-localised
observations good enough for clue crops, hide-spot proposals, and the cross-photo
throughline. The original spike used Gemini 2.5 Flash and six public place
photos.

## Evidence from the spike

- **Latency:** 11–22s per image in the original single-model setup.
- **Observations:** typically 12–15 per image, often specific enough to clue
  (“black building facade with a prominent silver pixelated sign”, “four round
  cushions in blue, light grey, dark grey, and brown”).
- **Bounding boxes:** approximately 80%+ usable in spot checks; partial boxes
  were usually loose rather than unrelated, which was acceptable for clue crops.
- **JSON reliability:** only 3/6 initial responses parsed cleanly. This was the
  main implementation risk and led directly to the production repair/retry and
  multi-provider failover design.
- **Hide-spot signals:** plausible when treated as candidates rather than truth;
  the buyer/editor remains the hallucination gate.

## What shipped from it

- per-image located observations;
- cross-image synthesis into a throughline, place guess, clues, rounds, and
  hide-spot proposals;
- JSON repair, bounded retries, and provider failover;
- progressive photo-read status in the buyer flow;
- upload normalization before provider processing;
- production validation documented in [OPS-LOG.md](OPS-LOG.md).

## Historical artifacts

The original test images and scratch outputs lived under
`/tmp/enigmabox-spike/` and are ephemeral. Do not treat the spike's cost or
latency figures as current production measurements; later provider benchmarks
and live validation are in [OPS-LOG.md](OPS-LOG.md).
