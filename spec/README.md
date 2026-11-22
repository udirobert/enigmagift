# Verification suite (Kane CLI)

The photo-gift journey is verified by an assurance-designed Kane suite.
Tests are not hand-written: `photo-gift.md` is the requirements source the
suite was designed from, and every `_test.md` in `.testmuai/tests/` is tagged
with the acceptance criteria it verifies (`@verifies ac-…`).

## Layout

- `photo-gift.md` — requirements the suite was designed from
- `fixtures.json` — fixture constants the gate turns into run variables
- `fixtures/not-jpeg.png` — non-JPEG input fixture
- `../.testmuai/tests/` — the designed, runnable suite
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
its private controls. `broken_photo_gift_url` has no seedable fixture yet —
that test is skipped by the gate and tracked as a coverage gap.

## Coverage

Run `kane-cli cover gaps` to see which use-cases and criteria have passing
tests versus designed debt.
