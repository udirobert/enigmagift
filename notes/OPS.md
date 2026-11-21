# EnigmaGift — ops runbook

Last verified live: 2026-11-21. This is the "how to operate it" doc: deploys,
secrets, the gotchas that actually bit us, and how to verify the live flow.

---

## Topology

| Piece | Where | Notes |
|---|---|---|
| Frontend | Cloudflare Pages — `enigmagift.pages.dev` (project `enigmagift`) | `npm run build` → `wrangler pages deploy dist --project-name=enigmagift --branch=main`. `/api/*` proxied to Fly by `functions/api/[[path]].js`; `/*` → `index.html` via `_redirects`. Netlify (`enigmagift.netlify.app`) still live as legacy mirror. |
| Backend | Fly.io — `enigmagift-api.fly.dev`, app `enigmagift-api`, region `iad` | `fly deploy` from `server/`. 512MB shared-cpu-1x, `/data` volume for SQLite + uploads. |
| Vision | SandBase `api.sandbase.ai/v1` (primary) + Google Gemini (fallback) | Key held as a Fly secret + local `server/sandbase.env`. |

Frontend and backend are **not** on the same host. Pages is static-only (+ the
`/api` proxy Function), so all state (DB, uploads) lives on the Fly volume.

---

## Secrets & where they live

| Secret | Primary home | Backup / local |
|---|---|---|
| `SANDBASE_API_KEY` | Fly app secret (`fly -a enigmagift-api secrets set …`) | `server/sandbase.env` (gitignored) |
| `RECRAFT_API_KEY` | Fly app secret, same `secrets set` flow | env or a `server/*.env` file (gitignored); optional — portrait skipped without it |
| `VITE_STRIPE_LINK_TRAIL` / `_HIDE` / `_SET` | inlined at build time (legacy single `VITE_STRIPE_LINK` maps to the Hide link) | the three `buy.stripe.com` Payment Link URLs (£4.99 / £9.99 / £19) |
| `STRIPE_WEBHOOK_SECRET` | Fly app secret | Stripe dashboard → Webhooks → the `whsec_…` for the `/api/stripe/webhook` endpoint |
| `STRIPE_API_KEY` (optional) | Fly app secret | lets `mark-paid` verify the checkout session server-side. **Without it mark-paid fails closed** — only the signed webhook sets `paid` |
| `ALLOWED_ORIGINS` (optional) | Fly app secret | comma-separated CORS allowlist; defaults to the deployed Pages/Netlify domains + localhost |
| Gemini key (fallback) | any `Dev/*/.env*` the server scans | — |

Note: `RECRAFT_API_KEY` spends **API units**, which are billed separately
from the Recraft Studio subscription credits (those only flow through MCP
and Studio). The keepsake portrait is best-effort: no key → `skipped`,
the reveal simply omits it.

The key file `server/sandbase.env` is gitignored (`.gitignore` has `*.env` and
`server/*.env`). It is **never** committed. The key is `sk-…` (the `enigmagift`
key, created with a $10 spend cap).

### Secrets hygiene (how we stay secure)

- **Secret values live only in**: Fly secrets (`fly -a enigmagift-api secrets
  set …`), the Stripe dashboard, and gitignored local `*.env` files. Never in
  committed files, docs, screenshots, or commit messages.
- `STRIPE_WEBHOOK_SECRET` (`whsec_…`) is a Fly secret; docs reference it by
  name only. The Payment Link URLs (`buy.stripe.com/…`) are **public by
  design** — they're inlined into the frontend bundle on purpose.
- The `pre-commit` hook (`.githooks/`, wired via `core.hooksPath`) greps staged
  content for full-length secret shapes — Stripe webhook secrets
  (`whsec_` + 16+ chars), `sk-…` vendor keys, live/test secret-key prefixes,
  GitHub tokens, AWS keys, private keys, `Bearer …` tokens, and
  `api_key`/`password` assignments — and blocks the commit on a match. Docs
  may mention the *prefix* (`whsec_…`) but never a full value, and must not
  quote the hook's raw regexes (write them with a character-class shim, e.g.
  `s[k]_[a-z]+ive_`, so the doc itself doesn't trip the scan).
- Audit anytime (bracket shims keep the command itself out of the scan):
  `git grep -nE 'whsec_[A-Za-z0-9]{16,}|s[k]_[a-z]+ive_|r[k]_[a-z]+ive_' -- .`
  must only ever hit `.githooks/pre-commit` itself. History check:
  `for c in $(git rev-list --all); do git grep -lE 'whsec_[A-Za-z0-9]{16,}' $c; done | sort -u`
- Databases and uploads are gitignored (`server/*.db`, `server/uploads/`),
  and `dist/` is build output, never committed.
- If a secret ever does leak: rotate it in the provider (Stripe: roll the
  webhook secret; SandBase: revoke the key), set the new value as a Fly
  secret, redeploy, then scrub history only if the repo is private.

To set the Fly secret without printing the key:

```bash
cd server
KEY="$(sed -n 's/^SANDBASE_API_KEY=//p' sandbase.env | tr -d '\r')"
fly -a enigmagift-api secrets set SANDBASE_API_KEY="$KEY"
```

---

## Redeploy

### Backend (Fly)

```bash
cd server          # the Dockerfile lives here, NOT the repo root
fly deploy
```

Gotchas:
- **Run from `server/`, not the repo root.** `fly.toml` says `dockerfile =
  "Dockerfile"`; relative to the repo root that file doesn't exist (it's
  `server/Dockerfile`). Deploy from `server/` so the build context is right.
- After `secrets set`, the machine is rebuilt automatically; a subsequent
  `fly deploy` picks up the latest commit.
- The app was **suspended** at one point — `fly deploy` resumes it. Check
  `fly apps list` for `suspended`.

### The world (per-gift 3D model)

Sealing a gift triggers `buildWorld` (`server/world.js`): SandBase **Run API**
+ TRELLIS.2 turns the gift's **most iconic photo** — the one the throughline
points at, scored by the pipeline (`pickWorldSource` in `pipeline.js`, stored
as `gifts.world_source`) — into a ~2MB GLB (sent as base64; no public URL
needed), saved to the volume at `<UPLOADS_DIR>/<giftId>/world.glb`. Falls back
to the first readable photo if no source is recorded.

- **State** lives on the gift row: `world_status`
  (`pending → worlding → ready|failed`) + `world_file` + `world_started_at`
  + `world_ready_at`. Timing: `gifts.read_ready_at` stamps when the read
  finishes, and both the pipeline and world log their duration
  (`ready in <N>s`, `… (source photo N)`).
- **Build takes ~45–90s** (one TRELLIS.2 run ≈ $0.30 of SandBase credit).
  The reveal scene polls `GET /api/trail/:token/world-status` every 5s and
  shows the world once `ready`; the GLB streams from
  `GET /api/trail/:token/world` (`202` until ready).
- **Failure modes are graceful:** no key / no usable photo / run failed →
  `world_status=failed` and the reveal shows a static note (the letter, code
  and trail are unaffected). A machine restart mid-build leaves `worlding`
  stuck; `world_started_at` marks it stale after 10 min, and the world route
  + `buildWorld` self-heal it on the next trigger.
- **Volume growth:** one ~2MB GLB per sealed gift. Watch it with the rest of
  the volume (`fly volumes info` / `fly machine list` for disk).
- Big build-context warning (node_modules ~81MB) is harmless; `.dockerignore`
  already excludes node_modules/uploads/db.

### The keepsake portrait (Recraft, optional)

`startPortraitBuild` fires alongside `buildWorld` at seal time. `server/portrait.js`
reuses `worldPhotoDataUrl` (same source photo the world uses), calls Recraft
`imageToImage` (`external.api.recraft.ai/v1`) with the keepsake style, and saves
to `<UPLOADS_DIR>/<giftId>/derived/`. It is idempotent and self-heals a stale
`painting` row after 10 min.

- **Billing:** `RECRAFT_API_KEY` spends API units, not Studio subscription
  credits. No key → `portrait_status=skipped` and the reveal omits the card.
- **State/API:** `portrait_status` + `portrait_file` + `portrait_started_at`;
  trail payload carries `portraitStatus`/`portraitUrl`; stream route is
  `GET /api/trail/:token/portrait`.
- **Overridables:** `RECRAFT_STYLE_ID`, `RECRAFT_MODEL`,
  `RECRAFT_STRENGTH` (see `server/portrait.js`).

### The authored miniature (demo only)

`public/world-meshy.glb` is a prebuilt Meshy diorama generated from the tracked
canonical photo `dog-gift-tabletop/public/room.jpg` (provenance in
`assets/meshy/manifest.json`). It powers only the demo "room in the fold"
sample (`/?miniature=1` or the Reveal in demo mode) — real gifts still get the
per-gift TRELLIS world from `server/world.js`.

### Frontend (Cloudflare Pages)

```bash
VITE_STRIPE_LINK_TRAIL="https://buy.stripe.com/<trail>" \
VITE_STRIPE_LINK_HIDE="https://buy.stripe.com/<hide>" \
VITE_STRIPE_LINK_SET="https://buy.stripe.com/<set>" \
npm run build
npx wrangler pages deploy dist --project-name=enigmagift --branch=main
```

`/api/*` is proxied to Fly by `functions/api/[[path]].js` — Pages `_redirects`
cannot proxy external domains, so don't try to express the API route there.
The Stripe links must be set at **build** time for the pay gates to appear. Verify they're inlined:

```bash
grep -hoE 'https://buy\.stripe\.com/[A-Za-z0-9?=_&.-]{6,20}' dist/assets/*.js
```

If a link is missing, that tier's seal button shows a disabled
"payments opening soon" state.

---

## Stripe: three payment links + one webhook (last sales step) — LIVE since 2026-11-21

Live mode, account **EnigmaGift** (`acct_1Gl9hELt1uz9HoCm`). The seal page
(`src/scenes/Seal.tsx`) maps the chosen tier to its Payment Link
(`VITE_STRIPE_LINK_TRAIL` £4.99 / `_HIDE` £9.99 / `_SET` £19; legacy
`VITE_STRIPE_LINK` maps to Hide) and opens it in a new tab with
`client_reference_id=<giftId>`. Each link's **success URL** is:

```
https://enigmagift.pages.dev/?paid=1&sid={CHECKOUT_SESSION_ID}
```

The app detects `?paid=1` on return (or on window focus), calls
`POST /api/gifts/:id/mark-paid`, then `POST /api/gifts/:id/seal`.

**Payment Links (live, GBP, one-off):**

| Tier | Price | Payment Link | Product |
|---|---|---|---|
| The Trail (digital) | £4.99 | `https://buy.stripe.com/cNi6oIgAj4mSa63acb8EM02` | EnigmaGift The Trail |
| The Hide (physical + code) | £9.99 | `https://buy.stripe.com/6oU9AUesb1aGcebckj8EM03` | EnigmaGift The Hide |
| The Set (3-hunt pack) | £19.00 | `https://buy.stripe.com/7sYfZiabV6v0emj0BB8EM04` | EnigmaGift The Set |

**Webhook destination** (Workbench): `we_1UeCkTLt1uz9HoCmDJXgjDYr` ("enigmagift-paid"),
URL `https://enigmagift-api.fly.dev/api/stripe/webhook`, listening to
`checkout.session.completed`, Active. Signing secret is stored as the Fly
secret `STRIPE_WEBHOOK_SECRET` (reveal it in the dashboard under the
destination's "Signing secret" if it ever needs rotating — Stripe may ask for
a 6-digit authenticator code to reveal/roll it).

**The webhook is the source of truth for `paid`.** On
`checkout.session.completed` the server verifies the HMAC signature, checks
`amount_total` against the tier's expected price (`TIER_PRICE_PENCE` =
499/999/1900), sets `paid=1`, and for a **Set** payment creates a 3-credit
`packs` row linked to the gift. `mark-paid` is only a client hint: it **fails
closed** when `STRIPE_API_KEY` is unset (no key yet — see below) and never sets
`paid` from a client claim; with the key it verifies the session via the Stripe
API. The webhook is the only source of truth for `paid`.

Verified live 2026-11-21 (signed test events against the production endpoint
with the real `whsec_…`): valid signature → `{"received":true}` + `paid:true`;
bad signature → 400; wrong amount → 400; Set payment → `paid:true` +
`packId` created. Frontend rebuilt with the three `VITE_STRIPE_LINK_*` URLs
inlined and redeployed to Pages (confirmed in the live bundle).

Known loose end: a junk product "undefined" £0.00 (`prod_VfXk2WAxA7qyET`)
exists from link creation — harmless (no link points at it), archive it via
`POST /v1/products/prod_VfXk2WAxA7qyET` with `active=false` once a restricted
API key exists (dashboard archive is hidden; creating a key may trigger
authenticator verification). Also optional: a restricted **API key**
(Checkout sessions: read) as `STRIPE_API_KEY` so `mark-paid` verifies
server-side.

Fallback UX: if the success URL isn't set, the buyer gets an "I've paid" nudge
button on the seal page that completes the flow manually.

---

## Local dev

```bash
cd server
# load the local key, then run
set -a && . ./sandbase.env && set +a && node index.js     # :8787
```

The server serves the built frontend from `dist/` (SPA fallback on anything not
starting with `/api/`). For hot-reload frontend use `npm run dev` (vite) — but note
vite dev and the backend are different origins; the frontend's API base defaults to
same-origin (`VITE_API_URL ?? ''`), so for local dev either build+serve via the
backend or set `VITE_API_URL` to the backend.

---

## Verifying the live flow (what to run before calling it "up")

```bash
# health through both hops
curl -s https://enigmagift-api.fly.dev/api/health            # {"ok":true}
curl -s https://enigmagift.pages.dev/api/health           # {"ok":true} (proxy works)

# create a gift (5 real photos from server/uploads/<gift>/)
curl -s -X POST https://enigmagift-api.fly.dev/api/gifts \
  -F direction=someone -F photos=@a.jpg -F photos=@b.jpg \
  -F photos=@c.jpg -F photos=@d.jpg -F photos=@e.jpg

# poll until status=ready (~80–110s)
curl -s https://enigmagift-api.fly.dev/api/gifts/<id>

# seal + drive the recipient
curl -s -X POST https://enigmagift-api.fly.dev/api/gifts/<id>/seal
curl -s https://enigmagift-api.fly.dev/api/trail/<token>
curl -s https://enigmagift-api.fly.dev/api/trail/<token>/photo/0 -o p0.jpg   # token-scoped photo
curl -s -X POST https://enigmagift-api.fly.dev/api/trail/<token>/unlock \
  -H 'content-type: application/json' -d '{"code":"XXXXXX"}'   # wrong → {"unlocked":false}
# (Hide tier only — Trail trails have requiresCode=false and skip the code gate)

# editor extras: re-derive clues with notes; pick the world photo
curl -s -X POST https://enigmagift-api.fly.dev/api/gifts/<id>/reclue \
  -H 'content-type: application/json' -d '{"notes":"the door is green, not blue"}'
curl -s -X POST https://enigmagift-api.fly.dev/api/gifts/<id>/world-source \
  -H 'content-type: application/json' -d '{"index":2}'

# funnel events
curl -s -X POST https://enigmagift-api.fly.dev/api/gifts/<id>/event \
  -H 'content-type: application/json' -d '{"name":"editor_done"}'

# revoke the recipient link (buyer-side; the /t/<token> link stops resolving)
curl -s -X POST https://enigmagift-api.fly.dev/api/gifts/<id>/revoke

# security regression tests (local, throwaway DB): webhook sig, fail-closed
# mark-paid, answer-key stripping, unlock rate limit, revoke/expiry, EXIF strip
cd server && node test/security.test.mjs

# webhook smoke test (sign a fake checkout.session.completed with the real secret)
SECRET=$(fly -a enigmagift-api secrets list >/dev/null 2>&1 && echo "<whsec from fly secret>")
PAYLOAD='{"type":"checkout.session.completed","data":{"object":{"id":"cs_test_1","client_reference_id":"<id>","amount_total":499}}}'
SIG=$(node -e 'const c=require("crypto"),t=Math.floor(Date.now()/1000);console.log("t="+t+",v1="+c.createHmac("sha256",process.argv[1]).update(t+"."+process.argv[2]).digest("hex"))' "$SECRET" "$PAYLOAD")
curl -s -X POST https://enigmagift-api.fly.dev/api/stripe/webhook \
  -H 'content-type: application/json' -H "Stripe-Signature: $SIG" -d "$PAYLOAD"   # {"received":true}; bad sig / wrong amount → 400
```

Then confirm the recipient journey in a real browser at
`https://enigmagift.pages.dev/?t=<token>` (round 1 crop+options → code gate on
Hide / straight to the keepsake on Trail). Use the `ego-browser` skill, not
Playwright.

Unlock codes are stored as scrypt hashes (`trails.unlock_hash`); the plaintext
codes listed below are historical — they still verify because their hashes
were derived from them at migration.

---

## Hardening (2026-11-21)

- **Fail-closed payments**: `mark-paid` never sets `paid` from a client claim;
  only the signed webhook does (or `mark-paid` with `STRIPE_API_KEY` set).
- **Answer key stays server-side**: `GET /api/trail/:token` strips `correct`
  from rounds; `/answer` checks it. Unlock attempts capped at 10/h/token.
- **Bearer credentials**: gift id = buyer, trail token = recipient. Tokens can
  be revoked (`POST /api/gifts/:id/revoke`) or expire (`expireDays` on seal;
  `trails.expires_at`, checked in `getTrail`). Recipient links are displayed in
  path form `/t/<token>` (`?t=` still accepted) so they don't leak via
  Referer/history; the Stripe return's `?paid=1&sid=…` is moved to
  sessionStorage and stripped from the URL on load.
- **Headers**: CSP + nosniff + DENY + `Referrer-Policy: no-referrer` + HSTS on
  both origins (`public/_headers` for Pages, middleware in `server/index.js`).
- **EXIF/GPS stripped** from uploaded JPEG/PNG (`server/exif.js`; WebP/GIF/HEIC
  pass through — documented gap). The browser also re-encodes uploads.
- **Rate limits** on create/reclue/unlock/answer/mark-paid/seal/hide/
  world-source/revoke/delete/events; the in-memory limiter is key-bounded.
- **Legal pages**: `/privacy`, `/terms` (static, `public/*.html`, clean URLs
  via `_redirects`); upload requires a consent checkbox linking to `/privacy`.
  Placeholder contact addresses and governing law — **get legal review before
  launch**, and verify each AI subprocessor's retention/training terms before
  claiming anything about training in the policy.
- **Secrets**: pre-commit hook blocks `whsec_…`/`sk-…`/etc. (see Secrets
  hygiene). Multer bumped to 2.x.

## Gotchas (actually hit)

- **`/usr/local/bin/git` hangs** on every command (Homebrew Intel build under
  Rosetta). Use **`/usr/bin/git`** (Apple Git) for all git ops.
- **Push auth:** the repo belongs to `udirobert`; the default gh account may be a
  different one. `gh auth switch -u udirobert` then push, or use the keyring
  token for that account. A 403 "denied to <other>" means wrong account.
- **Gemini free-tier quota is gone** — the old native key is 20 req/day and was
  exhausting. SandBase (paid) is now primary; Gemini is only a fallback. Don't
  assume the Gemini key works.
- **Truncated cross-image JSON** can happen on long observation bundles; the
  pipeline now fails over to the next candidate and retries, and if the aggregate
  still fails it marks the gift `error` rather than shipping a hollow `ready`.
- **Disk is tight (~33 GB free).** Don't add writers / large caches.
- **`fly image list`** etc. need `-a enigmagift-api` when not in `server/`.
- **Netlify `env:list`** is interactive (asks "Show values?") — don't pipe into it
  expecting non-interactive output.
- **Deleting a Set purchase gift 500'd** — `packs.purchase_gift_id` has an FK to
  `gifts` and node:sqlite enforces FKs by default. `DELETE /api/gifts/:id` now
  detaches child hunts and removes the pack row first (fixed 2026-11-21).

---

## Test trails currently in the DB (for re-verification)

Created live on the Fly backend 2026-11-17 (gift id → trail token → original
plaintext code, now stored hashed):

- `43ddaaea-…` → trail `6rOYxBOx-rkCDWxT` → code `F3Z6BQ` (Fort Point)
- `68e0fb7c-…` → trail `kvEkSWjhRWlr6xHc` → code `2JNVZP` (Rosa's Cafe, Portsmouth)
- `dd901e63-…` — ready, not sealed; `placeGuess` "Rockingham House on State Street
  in Portsmouth, New Hampshire" (the concrete-placeGuess fix verified on this one)
