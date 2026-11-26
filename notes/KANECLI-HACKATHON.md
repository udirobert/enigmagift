# KaneCLI Online Hackathon — eligibility and evidence snapshot

> Status snapshot checked **2026-11-26**. This is a time-boxed event note, not
> durable product status. If a future Kane/TestMu event has different rules,
> re-read those rules rather than treating this file as current.

Source: [KaneCLI Online Hackathon](https://www.kaneclihack.sh/) —
**12–26 November 2026**, submission deadline **26 November 2026, 11:59 PM IST**
(**10:29 AM PT**), extended from 19 November.

## Bottom line

EnigmaGift **did satisfy the repo-age eligibility rule** for this iteration:
the repository began inside the build window, with the first commit recording
research and concept work rather than an imported old codebase.

EnigmaGift also had unusually strong Kane material for a late entry: a
committed assurance-designed browser suite and a deploy gate that refuses to
ship when Kane fails. The main submission gaps were the event deliverables
around the code — a fresh public evidence pack, YouTube demo, two public posts,
and a submitted form — plus tighter proof that Kane verdicts feed back into an
agent repair loop.

The event allows **one submission per team**.

## Official rules that mattered

| Rule | Requirement |
| --- | --- |
| Build window | Building started **12 November 2026**; no pushes after **26 November 2026, 11:59 PM IST**. |
| Repo age | “Your repo must be initialized on or after 12 November. We check commit history. An old idea is fine; an old codebase is not.” |
| Entrants | Anyone 18 or older, solo or teams up to four. |
| Agent/stack | Any coding agent, framework or stack was allowed. Kane CLI was the only required tool. |
| Kane account | Entrants had to be signed up on `testmuai.com` and have run Kane CLI. |
| Public artifacts | Public GitHub repo, public YouTube demo, and at least two different public posts on Hacker News, X, Reddit or LinkedIn. |
| Judge access | Working credentials for any login or paid service, plus a fallback such as a recorded run or backup deploy for third-party services. |
| Demo format | Recorded YouTube video, about **3–5 minutes**; live demos were not required. |
| Submission lock | Submissions could be edited until the deadline, then locked. One submission per team. |

Judging first required three bars:

1. the project works end to end;
2. Kane CLI caught or proved something meaningful;
3. the agent and Kane CLI talked to each other.

The scored dimensions were equally weighted: **Ships**, **Verified**,
**Closed loop**, and **Craft**.

## Why EnigmaGift passed the repo-age gate

| Evidence | Detail |
| --- | --- |
| First commit | `26049a1` — **2026-11-17** — “EnigmaGift: research log and concept” |
| First-commit contents | Only `notes/CONCEPT.md` and `notes/RESEARCH.md`; no imported application code |
| Early product evolution | Later commits on 2026-11-17 reworked the mechanic, added the README, initial UI, vision spike and backend pipeline in small increments |
| First UI commit | `fee83b6` — **2026-11-17** — “Initial UI: six-scene EnigmaGift flow” |
| Public repo | `https://github.com/udirobert/enigmagift` — public; GitHub creation time observed as **2026-11-17T14:27:17Z** |
| Commit shape | Incremental multi-commit history when checked on 2026-11-26, consistent with work built during the event rather than a squashed import. The public judges' view is `origin/main`; local-only commits do not count unless pushed before the deadline |

This is the important distinction: an **old idea** would have been acceptable,
but an old codebase would not. EnigmaGift's history starts with concept notes
inside the window and then shows the implementation being built commit by
commit.

## Kane material already in this repo

The Kane integration is not just a one-off command. It is committed project
infrastructure:

- `spec/photo-gift.md` — requirements source for the photo-gift journey.
- `spec/fixtures.json` — fixture constants for live, revoked and unknown gift
  links on the production API, plus image fixtures and a synthetic broken-image
  fixture implemented by the local verification proxy.
- `.testmuai/tests/` — **13 active committed `_test.md` browser tests**,
  designed through the assurance workflow rather than hand-written, each tagged
  with the acceptance criteria it verifies; seven superseded tests are retained
  in `.testmuai/tests/superseded/` for audit.
- `scripts/verify-room.mjs` — the deploy gate runner.
- `spec/README.md` — operator documentation for the suite.
- Commit `d869622` — **2026-11-22** — “Add Kane-gated deploy for the photo
  gift room”, which added the suite, fixtures, requirements and deploy gate.

The suite covers the photo-gift journey: creating a gift, previewing the exact
recipient experience, recipient discovery and reading, wrong taps and wrong
areas, edit versioning, revoked/unknown links, broken-image resilience, clue
length, and reduced/resilient use. Multi-format input normalization, blocked
persistent storage and saved-recipient preview are explicit coverage debt after
deadline-day reconciliation, not silently claimed coverage.

It deliberately does **not** cover the whole product: the 3D sample-room demo,
paid React-app flows, Stripe checkout/payments and private management
revocation are out of scope for this suite. A hackathon submission needed to
either scope the story to the verified photo-gift journey or extend coverage
before claiming whole-product verification.

## How the gate works

```bash
npm run verify:room   # serve dist + replay the Kane suite, block on failure
npm run deploy:room   # build → verify → deploy; refuses to deploy on failure
```

`verify-room.mjs` serves `dog-gift-tabletop/dist` locally and proxies `/api`
to the production API, matching the deployed worker shape. It groups tests by
the URL their first step opens and replays each group with
`--override-start-url`, so the same tests can run against a local port.

On failure it exits nonzero and writes an agent-readable digest to
`.testmuai/verify-report.json`; that digest is the loop surface an agent can
read before editing. `EG_SKIP_VERIFY=1 npm run deploy:room` is the emergency
bypass, not the normal path.

Kane must be signed in locally:

```bash
kane-cli login --oauth
```

## Evidence status on 2026-11-26

A local `.testmuai/verify-report.json` recorded:

- `ran_at`: **2026-11-22T21:59:45.499Z**
- `exit_code`: **0**
- `failures`: none
- skipped: `failed-recipient-photo-leaves-direct-access-to-letter_test.md`,
  because `broken_photo_gift_url` had no seedable fixture

Important limitation: `.testmuai/verify*.json` is gitignored. That report is
operator-local evidence, not public judge evidence. A submission would need a
fresh recorded run, shareable Test Manager links or another public evidence
pack committed/published in a judge-accessible form.

There is also a useful negative/ambiguous Kane result in
[`MOTION.md`](MOTION.md): an independent Kane run reached the correct opened
note but failed its generated assertion that the clue also had to appear inside
the letter. The clue intentionally belongs to the hunt screen, so this was a
test/assertion mismatch rather than an end-to-end product pass. That distinction
is valuable hackathon evidence: it shows why Kane verdicts need to be read
rather than blindly trusted, but it is not a substitute for a clean passing run.

## Fit against the judging bars

| Bar / dimension | Assessment |
| --- | --- |
| Works end to end | Strong for the photo-gift journey; the verified photo-gift surface exists at `https://enigmagift-room.trustfall.workers.dev/?photo=1`. Whole-product proof is broader than the committed Kane suite. |
| Kane caught or proved something | Strong on proof: the suite verifies real browser behaviour and the deploy gate blocks failed builds. Weaker on “caught a real product bug”; the documented Kane failure was primarily an assertion mismatch. |
| Agent ↔ Kane closed loop | Stronger after deadline-day repair: the gate writes an agent-readable failure digest, the agent used it to separate product behaviour from test-authoring drift, repaired the suite, and replayed it. This is agent-in-the-loop repair rather than a fully automated self-healing system. |
| Ships | Strong if scoped to the photo-gift journey. |
| Verified | Strong committed foundation, but needed fresh public/shareable run evidence and the skipped fixture resolved. |
| Closed loop | Agent-in-the-loop repair is real and documented; not a fully automated self-healing system. |
| Craft | Strong product craft, but hackathon craft also required the video, posts and judge narrative. |

## What would have been required to submit EnigmaGift

1. Resolve team eligibility: the rules allow one submission per team.
2. Confirm the operator was signed up on `testmuai.com` and had run Kane CLI
   under the submitting account.
3. Seed or replace the missing `broken_photo_gift_url` fixture so the skipped
   resilience test either runs or is consciously removed from the claimed
   coverage.
4. Run the full gate fresh and capture public evidence: Test Manager share
   links, recordings, screenshots or committed run artifacts that judges can
   open without local credentials.
5. Record a 3–5 minute YouTube demo. The strongest story would have been:
   create/edit a photo gift → Kane verifies the exact recipient experience →
   introduce or reveal a failure → the deploy gate blocks it → agent reads the
   digest → fix → Kane passes → deploy proceeds.
6. Publish at least two distinct public posts on HN, X, Reddit or LinkedIn.
7. Provide judge access instructions and fallbacks for paid/third-party
   services: SandBase/Gemini vision, Recraft, Stripe and the production API.
8. Push every submission commit to the public repo before the deadline,
   submit the form, and keep the repo public.

## 26 November fresh-run triage

A fresh verification run was started on deadline day after hardening the gate.
It immediately did the thing the hackathon cares about: Kane did not simply
"pass tests"; it exposed places where the requirements, tests and shipped
product had drifted apart.

| Kane result | Triage | Action |
| --- | --- | --- |
| `device-picker-excludes-non-jpeg-photos` failed | Requirement drift, not an application defect. The product intentionally accepts JPEG, PNG and WebP locally, then normalizes the image to a clean JPEG before upload. The requirements still said JPEG-only; the accept list also advertised HEIC/HEIF even though browser normalization could not reliably decode them. | `spec/photo-gift.md` corrected and the HEIC/HEIF accept entries removed; suite reconciliation started through the assurance workflow. |
| `blocked-local-storage-keeps-the-gift-draft-in-this-tab` failed | Requirement/test imprecision. The implementation uses IndexedDB-backed persistent storage, not localStorage. Blocking only localStorage does not create the condition the requirement meant. | Requirement corrected to “persistent storage”; test redesign required rather than weakening the product. |
| `saved-recipient-preview-returns-to-unchanged-gift-editor` failed | Requirement ambiguity. `Open the note` is intentionally hidden until the note is found; it is not an initial hunt control. | Requirement corrected to say the control appears once the note is found. |
| `editing-creates-a-new-link-without-changing-the-earlier-gift` failed | Automation/test-authoring issue, not a product failure. Chrome’s browser chrome is outside the page automation surface, so pasting a copied link into the address bar did not reliably navigate; the replay then checked the edited in-page preview. | Step wording repaired to use the product’s intended history path: browser Back returns to the original saved-gift page, then the recipient preview is opened and checked. |

At the same time, fresh passing evidence was produced for the core creation,
marker-placement, clue-limit and closed-link behaviours. Those public links are
indexed in [`KANECLI-EVIDENCE.md`](KANECLI-EVIDENCE.md).

The deadline-day implementation choice is deliberately conservative: **do not
claim whole-suite verification while reconciliation is incomplete**. The public
submission story should separate three things clearly:

1. green behaviour Kane proved;
2. mismatches Kane caught;
3. suite debt still being reconciled.

That is stronger evidence of an agent ↔ Kane loop than hiding red rows or
overclaiming a green suite.

## Lessons for a future Kane event

- Start the event note on day one, not near the deadline.
- Keep a committed, judge-readable evidence index separate from ignored local
  run reports.
- Prefer one canonical failing-then-fixed Kane story over a list of green
  tests; the judges explicitly reward Kane catching or proving something
  meaningful.
- If the product is broad, either narrow the submission story to the verified
  journey or extend the suite before making whole-product claims.
- Do not treat a Kane failure as automatically either an app bug or a test bug;
  preserve the recording, the assertion and the intended product behaviour so
  the distinction is auditable.
