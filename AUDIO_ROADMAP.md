# Audio roadmap — enigmagift

Status 2026-11-26: ungenerated. The Sonilo Pro trial credits were exhausted by
six other projects before enigmagift's piece was attempted.

## The one artifact

A single photo-to-music piece for the canonical "Someone saved you a seat"
gift: warm, gentle, nostalgic, 60–90 seconds. This is the emotional payload of
the gift trail — music generated *from a shared photo* is the novel mechanic,
not decoration.

## How to execute later

- **Sonilo photo-to-music** (dashboard-only flow — the API has no photo endpoint;
  it must be driven through the web UI or browser automation). Prompt direction
  is in `sonilo-audio-pipeline/manifests/enigmagift.json`.
- **Alternatives**: any image-to-music or text-to-music provider with a
  nostalgia-leaning prompt (warm piano, tape texture, gentle swing). The photo
  input is a nice-to-have; a well-directed text prompt captures most of the
  value.
