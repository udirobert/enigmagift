# EnigmaGift KaneCLI social posts — ready to publish

Replace `[VIDEO_URL]` with the public YouTube URL before posting. Recommended pair: X + LinkedIn.

## X post (under 280 effective characters)

EnigmaGift is Kane-gated: the photo-gift surface won’t deploy unless @kane_cli replays Chrome evidence green.

Requirements → browser proof → agent-readable red digest → build/verify/deploy.

Repo: github.com/udirobert/enigmagift
Demo: [VIDEO_URL]

#KaneCLIHackathon

## LinkedIn post

I built EnigmaGift as a live AI-assisted gifting product, then used the KaneCLI hackathon to answer a harder question: how does an AI coding agent earn the right to deploy?

The answer in this repo is simple: it does not deploy unless KaneCLI produces fresh browser evidence.

EnigmaGift turns a meaningful photograph into a private treasure hunt. A giver hides a note inside a photo and shares a link; the recipient hunts for the hidden spot and opens the letter.

For the hackathon, I narrowed the verified claim to that single-photo gift journey and wired deployment through `npm run deploy:room`:

build → verify → deploy

`verify-room.mjs` serves the exact built room bundle, proxies the production-shaped API, regenerates fixtures, replays committed Kane browser tests in Chrome, validates the NDJSON evidence stream, and writes a machine-readable report that blocks deployment on red.

The most interesting result was not a wall of green. Kane caught real drift between the requirements, generated tests, and shipped UX: image-format wording, persistent-storage wording, an ambiguous recipient-control assertion, and an editing test whose final assertion did not match what the browser had actually proven. Those red rows are publicly indexed instead of being hidden.

That is the closed loop I wanted to demonstrate:

requirements → Kane browser evidence → agent-readable failure digest → repair → replay → deployment authority

The verified scope is intentionally narrow — the free single-photo journey, not the whole paid product — but the loop is real end-to-end.

Repository: https://github.com/udirobert/enigmagift
Demo: [VIDEO_URL]

#KaneCLIHackathon #KaneCLI

## Optional Hacker News / Reddit post

Title: Show HN: EnigmaGift – an AI gift product gated by KaneCLI browser evidence

I built EnigmaGift, a small live product that turns a meaningful photograph into a private treasure hunt. A giver hides a note inside the photo and shares a link; the recipient hunts for the hidden spot and opens the letter.

For the KaneCLI hackathon, I wired one production surface so deployment is blocked unless KaneCLI replays a browser suite green. The gate serves the exact built app, proxies the production-shaped API, validates Kane's NDJSON evidence stream, and writes a machine-readable failure digest for the coding agent.

The interesting part is not just green tests. Kane exposed drift between written requirements, generated tests, and shipped UX. The repo openly indexes green and red evidence, and the submission scope is deliberately narrow: the free single-photo gift journey, not the entire paid product.

Repo: https://github.com/udirobert/enigmagift
Demo: [VIDEO_URL]

## Post-publish checklist

- [ ] YouTube video is public or unlisted-but-viewable and plays end-to-end.
- [ ] Replace `[VIDEO_URL]` everywhere.
- [ ] Publish X post; copy the resulting post URL.
- [ ] Publish LinkedIn post; copy the resulting post URL.
- [ ] Paste both post URLs into the hackathon form.
- [ ] Keep the repo public and push the final submission commits before 18:29 UTC.
