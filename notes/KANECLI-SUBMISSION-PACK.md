# KaneCLI submission pack

Internal working copy for the hackathon submission. Deadline: 26 Nov 2026,
11:59 PM IST (18:29 UTC).

## Positioning

**EnigmaGift — an AI gift product that refuses to deploy until KaneCLI signs off.**

EnigmaGift turns photographs of a meaningful place into a private digital gift
hunt. For the hackathon we narrowed the verified claim to the shipped
single-photo gift journey and wired deployment through a real KaneCLI gate:
Kane drives Chrome through creation, recipient hunt, wrong-link, closed-link,
broken-image and access-control paths, then the deploy script refuses to ship
unless the evidence stream is complete and green.

The point is not test count. The point is the closed loop: product change →
Kane browser evidence → machine-readable failure digest → agent repair →
Kane replay → deployment allowed.

## Draft submission description

EnigmaGift is a live AI-assisted gifting product. A giver uploads a photograph
of a meaningful place, hides a note inside it, and sends the recipient a private
link. The recipient hunts for the hidden spot and opens the note.

For the KaneCLI hackathon, we focused on the question product teams actually
care about: can an AI coding agent ship without lying to itself? EnigmaGift's
answer is a Kane-gated deployment path. The photo-gift surface cannot deploy
until KaneCLI replays an assurance-designed browser suite against the exact
production-shaped build.

The suite was designed from the requirements in `spec/photo-gift.md` and covers
creation, recipient reveal, clue hunting, wrong links, closed gifts,
broken-image resilience, creator/edit flows and access-control boundaries.
`npm run verify:room` serves the build locally, proxies the production API,
injects fixtures, validates the NDJSON evidence stream, and emits an
agent-readable failure digest. `npm run deploy:room` composes build → verify →
deploy, so a red Kane result physically blocks release.

This is a deliberately narrow, honest verification claim: the free photo-gift
journey is Kane-gated; the wider paid trail, Stripe checkout, generated 3D
worlds and painted keepsakes are live product features outside this submission's
verified scope.

## YouTube script (3–5 minutes)

Target 4 minutes. Show real terminal/browser output, no polish required. Do not record the whole suite in real time: start the gate, explain what it is doing, then cut to the final digest/pass and the public evidence links.

1. **0:00–0:20 — Product in one sentence.** Open
   `https://enigmagift-room.trustfall.workers.dev/?photo=1`. “EnigmaGift turns a meaningful photo
   into a private treasure hunt. I built a deploy pipeline that KaneCLI controls.”
2. **0:20–0:55 — Create a gift.** Upload JPEG, fill note/clue, tap the hiding
   spot, create link. Emphasize this is a real browser/product path.
3. **0:55–1:25 — Recipient experience.** Open recipient link in a fresh tab,
   click wrong area, then the hidden spot, reveal the note.
4. **1:25–1:55 — Verification design.** Open `spec/photo-gift.md`,
   `.testmuai/tests/`, and `scripts/verify-room.mjs`. Explain tests carry
   acceptance-criteria tags and are replayed in Chrome.
5. **1:55–2:35 — Run the gate.** Terminal: `npm run build:room && npm run verify:room`.
   Show grouped replay and explain that malformed/incomplete runs cannot count as green.
6. **2:35–3:30 — What Kane caught.** Open `notes/KANECLI-EVIDENCE.md`; show one green
   creation/marker/closed-link row and one red drift row. Explain the real deadline-day
   loop: Kane flagged format/storage/initial-control drift plus a bad stored-link
   assertion; the agent triaged product behaviour vs stale requirements, fixed the
   small product inconsistency and repaired the test instead of hiding red.
7. **3:35–4:10 — Public evidence.** Open one or two Test Manager share links
   from `notes/KANECLI-EVIDENCE.md`; show repo evidence index.
8. **4:10–4:30 — Scope/honesty close.** “This does not claim to verify the whole
   product. It proves one meaningful production surface end-to-end and makes it
   deploy-dependent on Kane evidence.”

## Form-fill cheat sheet

- **Project name:** EnigmaGift
- **Tagline:** An AI gift product that refuses to deploy until KaneCLI signs off.
- **Repository:** https://github.com/udirobert/enigmagift
- **Live demo:** https://enigmagift-room.trustfall.workers.dev/?photo=1
- **Video:** [YOUTUBE]
- **Post 1:** [X/LINKEDIN URL]
- **Post 2:** [X/LINKEDIN/REDDIT/HN URL]
- **Judge access:** No credentials needed for the verified scope. Open the live photo-gift link or run `npm run verify:room` with a signed-in KaneCLI. Paid/AI-provider features are outside the verification claim.
- **Evidence:** `KANECLI.md` and `notes/KANECLI-EVIDENCE.md` in the repo.

Short description if the form has a small field:

> EnigmaGift turns a meaningful photograph into a private treasure-hunt gift. For KaneCLI, we wired its photo-gift surface so deployment is blocked unless Kane replays an assurance-designed browser suite green. Kane also caught real requirement/product drift on deadline day; the repo openly indexes green and red evidence and shows the agent triage loop.

## Public post copy

### X post

EnigmaGift is now Kane-gated: the photo-gift surface refuses to deploy unless
@KaneCLI replays a real browser suite green.

Not “tests exist” — release authority:
- assurance-designed requirements → Chrome evidence
- red rows exposed requirement/product drift instead of being hidden
- agent-readable failure digest and suite reconciliation loop
- build → verify → deploy in one command
- public evidence links in the repo

Repo: https://github.com/udirobert/enigmagift
Demo: [YOUTUBE]

#KaneCLIHackathon

### LinkedIn post

I built EnigmaGift as a live AI-assisted gifting product, then used the
KaneCLI hackathon to answer a harder question: how do AI agents earn the right
to deploy?

The answer in this repo is deliberately simple: they do not deploy unless
KaneCLI produces fresh browser evidence.

`npm run deploy:room` now means build → verify → deploy. Kane replays an
assurance-designed suite through real Chrome against the production-shaped
photo-gift journey. The gate validates the evidence stream, rejects unresolved
fixtures and incomplete runs, and writes a machine-readable failure digest for
the coding agent to repair.

The most interesting deadline-day result was not a wall of green. Kane caught
real drift between the written requirements, generated tests and shipped UX:
JPEG-only language versus modern client-side PNG/WebP normalization, a
HEIC/HEIF accept list the browser could not reliably decode, localStorage versus
IndexedDB, an ambiguous initial recipient-control assertion, and one test that
meant “open the stored original link” but actually clicked the in-page preview.
The loop was to triage those red rows openly, correct the requirements and test
extraction wording, remove the unsupported accept entries, reconcile the suite,
and keep the green rows public.

The verified scope is intentionally narrow: the free single-photo gift journey,
not the entire paid product. But that narrow loop is real end-to-end:
requirements → Kane browser evidence → agent repair loop → deployment authority.

Repository: https://github.com/udirobert/enigmagift
Demo: [YOUTUBE]

### Optional Reddit/HN variant

Title: Show HN: EnigmaGift – a live AI gift product that KaneCLI gates before deploy

I built EnigmaGift, a small live product that turns a meaningful photograph
into a private treasure hunt. For the KaneCLI hackathon I wired one production
surface so deployment is impossible unless KaneCLI replays a browser suite
green.

The interesting part is the closed loop: requirements are assurance-designed,
Kane drives real Chrome, failures are emitted as machine-readable digests for a
coding agent, and deploy composes build → verify → deploy. Evidence links are
public in the repo. The verified scope is intentionally narrow (the free
photo-gift journey), but it is real and reproducible.

Repo: https://github.com/udirobert/enigmagift

## Judge access note

No credentials are required for the verified scope. Judges can open the live
photo-gift journey, inspect the committed Kane suite and evidence index, or run
`npm run verify:room` with their own KaneCLI login. Payment and AI-provider
features are outside the verification claim and need no judge access.
