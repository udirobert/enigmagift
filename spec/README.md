# Verification suite (Kane CLI)

The photo-gift journey is verified by an assurance-designed Kane suite.
Tests are not hand-written: `photo-gift.md` is the requirements source the
suite was designed from, and every `_test.md` in `.testmuai/tests/` is tagged
with the acceptance criteria it verifies (`@verifies ac-…`).

For the 2026 KaneCLI Online Hackathon eligibility rules, repo-age evidence,
submission gaps and judging fit, see
[`../notes/KANECLI-HACKATHON.md`](../notes/KANECLI-HACKATHON.md). That file is
a time-boxed event snapshot; this file remains the operator guide for the
suite itself.

## Layout

- `photo-gift.md` — requirements the suite was designed from
- `fixtures.json` — fixture constants the gate turns into run variables
- `fixtures/not-jpeg.png` — non-JPEG input fixture
- `../.testmuai/tests/` — the designed, runnable release-blocking suite
- `../.testmuai/tests/superseded/` — superseded or invalidated designs kept for audit, not run by the gate
- `../scripts/verify-room.mjs` — the deploy gate

## Running the gate

```bash
npm run verify:room   # serve dist + replay the suite, block on failure
npm run deploy:room   # build → verify → deploy (refuses to deploy on failure)
```

`verify:room` serves `dog-gift-tabletop/dist` locally and proxies `/api` to
the production API — the same shape the deployed worker serves. It groups
suite members by the URL their Step 1 opens and replays each group with
`--override-start-url`, so the same tests work against any local port.
On failure it writes an agent-readable digest to
`.testmuai/verify-report.json` and exits 1, blocking the deploy.
Emergency bypass: `EG_SKIP_VERIFY=1 npm run deploy:room`.

Requires `kane-cli` signed in (`kane-cli login --oauth`) with credits for
replay.

## Fixtures

`fixtures.json` holds recipient tokens for three gifts on the production
API: a live one, a revoked one, and an unknown token (404s). To reseed,
create a gift through the creator, record its recipient token, and update
the token fields; for the revoked fixture, create then close the gift via
its private controls. The broken-photo fixture is synthetic but explicit:
the local verification proxy serves metadata from the live seeded gift while
making its image endpoint return 404, reproducing the damaged-image state
without mutating production data.

## Superseded designs

Deadline-day Kane failures exposed three stale requirements/designs: JPEG-only
input language after the product learned PNG/WebP normalization, “local
storage” when the implementation uses IndexedDB-backed persistent storage, and
an ambiguous assertion that `Open the note` was an initial recipient control
when the shipped design reveals it only after the note is found. The affected
`_test.md` files are kept in `.testmuai/tests/superseded/` for audit rather
than silently deleted. Corrected recipient tests were regenerated through the
assurance workflow; replacement creator-side storage/format tests and the saved-recipient preview design remain
explicit coverage debt until they are redesigned and authored.

## Coverage

Run `kane-cli cover gaps` to see which use-cases and criteria have passing
tests versus designed debt.
