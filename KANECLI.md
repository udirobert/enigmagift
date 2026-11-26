# KaneCLI hackathon judge guide

EnigmaGift is submitted as **an application that refuses to deploy until KaneCLI
signs off**. The verified scope is deliberately narrow and honest: the shipped
single-photo gift creator and recipient journey (`/?photo=1`). The wider paid
trail, Stripe checkout, AI world generation and painted keepsake flows are live
product surface, but they are **not** part of the Kane verification claim.

## Quick links

- Live product: https://enigmagift-room.trustfall.workers.dev/?photo=1
- Demo video: https://youtu.be/2qW3gHiNt2Q (unlisted, 1:53)
- Public repository: https://github.com/udirobert/enigmagift
- Verification requirements: [`spec/photo-gift.md`](spec/photo-gift.md)
- Runnable Kane suite: [`.testmuai/tests/`](.testmuai/tests/)
- Deploy gate: [`scripts/verify-room.mjs`](scripts/verify-room.mjs)
- Fresh evidence index: [`notes/KANECLI-EVIDENCE.md`](notes/KANECLI-EVIDENCE.md)

## What Kane verifies

The suite covers the free photo-gift loop end to end:

1. create a JPEG photo gift through the real browser UI;
2. receive a recipient link;
3. open the recipient view as a separate visitor;
4. hunt for the hidden photograph spot;
5. read the revealed note;
6. exercise wrong-link, closed-link, broken-image, creator, edit and access-control paths.

The tests are assurance-designed rather than hand-written. `spec/photo-gift.md`
is the requirements source; each runnable `_test.md` carries `@verifies` tags
back to acceptance criteria. The suite is replayed by KaneCLI in a real Chrome
browser, and passing runs produce public Test Manager evidence links listed in
[`notes/KANECLI-EVIDENCE.md`](notes/KANECLI-EVIDENCE.md).

Deadline-day Kane failures exposed stale designs. Those superseded tests are
kept in `.testmuai/tests/superseded/` for audit, while corrected recipient
tests are in the release-blocking suite. Replacement creator-side tests for
multi-format upload normalization, blocked persistent storage and saved-recipient preview are explicit
coverage debt; they are documented rather than silently omitted.

## How to reproduce

Prerequisites: Node 22+, dependencies installed, and `kane-cli` signed in with
credits.

```bash
npm install
npm run build:room
npm run verify:room
```

`verify:room` performs the deploy gate locally:

- serves the exact `dog-gift-tabletop/dist` build on a loopback port;
- proxies `/api` calls to the production API, matching the deployed worker
  topology;
- copies the committed tests into an isolated staging folder so no stale
  sidecar metadata contaminates the run;
- injects fixture variables from `spec/fixtures.json`;
- replays the Kane suite against the fresh local build;
- rejects unresolved fixture variables and malformed/incomplete NDJSON run
  output instead of treating them as success;
- writes an agent-readable digest to `.testmuai/verify-report.json`;
- exits non-zero if any selected member fails, breaks, is interrupted, is
  missing a final result, or emits unresolved-variable warnings.

Deploy is wired through the same gate:

```bash
npm run deploy:room   # build → verify → deploy
```

`EG_SKIP_VERIFY=1` exists only as an emergency operator bypass.

## The agent ↔ Kane closed loop

The gate is designed for agent operation, not just human CI:

1. the agent changes code or configuration;
2. `npm run verify:room` runs the browser evidence suite;
3. on failure the digest identifies the failing test, output log and evidence;
4. the agent reads the digest, fixes the cause, and reruns the gate;
5. only a structurally valid all-green run permits deployment.

This closes the loop between coding agent and verification agent: Kane is not
just generating tests — it is the release authority for this surface.

## Fixture note

The broken-image test uses a synthetic local proxy fixture. Metadata is proxied
from a real seeded gift while `/image` deliberately returns 404. This recreates
the precise production failure state (metadata present, image bytes missing)
without mutating production data. It is declared openly rather than hidden as a
mock of the whole product.

## Judge fallback

No judge credentials, payment details or third-party AI keys are needed for the
verified scope. If the public Test Manager links are inaccessible, the committed
evidence index records the local evidence-pack file names and the exact command
to reproduce the run. The narrow verified journey does not require Stripe,
SandBase/Gemini, Recraft or fal.ai access.
