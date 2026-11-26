# EnigmaGift — ops runbook

Last verified live: 2026-11-26. This is the "how to operate it" doc: deploys,
secrets, the gotchas that actually bit us, and how to verify the live flow.
The endpoint contract itself lives in [API.md](API.md); this file records how
the live system is run and validated.

---

## Topology

| Piece | Where | Notes |
|---|---|---|
| Frontend | Cloudflare Pages — `enigmagift.pages.dev` (project `enigmagift`) | `npm run deploy:pages` (canonical; includes payment-link verification). `/api/*` proxied to Fly by `functions/api/[[path]].js`; `/*` → `index.html` via `_redirects`. Netlify (`enigmagift.netlify.app`) still live as legacy mirror. |
| Backend | Fly.io — `enigmagift-api.fly.dev`, app `enigmagift-api`, region `iad` | `fly deploy` from `server/`. 512MB shared-cpu-1x, `/data` volume for SQLite + uploads. |
| Gift pilot | Cloudflare Worker `enigmagift-room` — `https://enigmagift-room.trustfall.workers.dev` | Personal photo creation at `?photo=1`; sample-room editor at `?make=1&sample=1`. `npm run deploy:room` builds `dog-gift-tabletop/dist` and deploys `dog-gift-tabletop/wrangler.jsonc`. Static assets + `worker.ts` proxying `/api/health` and the `/api/room-gifts` and `/api/photo-gifts` routes to Fly. Deploy the Fly API first. |
| Vision | SandBase `api.sandbase.ai/v1` (primary), Cloudflare Workers AI then Groq (privacy-conscious fallbacks), Google Gemini (final fallback) | Keys held as Fly secrets + local gitignored provider env files. `VISION_PROVIDERS` can pin the enabled provider set for incident response. |
| World generation | fal.ai queued TRELLIS.2 (`fal-ai/trellis-2`) | Scoped key held as Fly secret `FAL_KEY` + local `server/fal.env` (gitignored). |

Frontend and backend are **not** on the same host. Pages is static-only (+ the
`/api` proxy Function), so all state (DB, uploads) lives on the Fly volume.

---

## Secrets & where they live

| Secret | Primary home | Backup / local |
|---|---|---|
| `SANDBASE_API_KEY` | Fly app secret (`fly -a enigmagift-api secrets set …`) | `server/sandbase.env` (gitignored) |
| `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | Fly app secrets, same `secrets set` flow | `server/cloudflare.env` (gitignored); token is account-scoped Workers AI Read only; first fallback |
| `GROQ_API_KEY` | Fly app secret, same `secrets set` flow | `server/groq.env` (gitignored); free tier is fast but output-rate-limited; secondary fallback |
| `VISION_PROVIDERS` (optional) | Fly config/secret value | comma-separated allowlist: `sandbase,cloudflare,groq,gemini`; normally unset |
| `FAL_KEY` | Fly app secret (`fly -a enigmagift-api secrets set …`) | `server/fal.env` (gitignored); scoped to TRELLIS.2 plus upload/request permissions |
| `RECRAFT_API_KEY` | Fly app secret, same `secrets set` flow | env or a `server/*.env` file (gitignored); optional — portrait skipped without it |
| `VITE_STRIPE_LINK_TRAIL` / `_HIDE` / `_SET` | inlined at build time (legacy single `VITE_STRIPE_LINK` maps to the Hide link) | the three `buy.stripe.com` Payment Link URLs (£4.99 / £9.99 / £19) |
| `STRIPE_WEBHOOK_SECRET` | Fly app secret | Stripe dashboard → Webhooks → the `whsec_…` for the `/api/stripe/webhook` endpoint |
| `STRIPE_API_KEY` (optional) | Fly app secret | lets `mark-paid` verify the checkout session server-side. **Without it mark-paid fails closed** — only the signed webhook sets `paid` |
| `ALLOWED_ORIGINS` (optional) | Fly app secret | comma-separated CORS allowlist; defaults to the deployed Pages/Netlify domains + localhost |
| `ROOM_PROXY_SECRET` | Fly app secret **and** Cloudflare Worker secret — the same value in both | 32 random bytes as 64 hex; shared edge→API proof so room-gift creates bucket per real client IP. Never committed; `.dev.vars` is gitignored |
| `ENABLE_EXPERIMENTAL_ROUTES` | Fly app secret/config value | currently `true` in production to preserve the already-live room/photo pilots behind an explicit operator opt-in; unset it when those pilots move off the canonical API |
| Gemini key (fallback) | Fly app secret or explicit `server/.env` / `server/sandbase.env` | sibling-project `.env` scanning was removed; keys are never discovered across `~/Dev` |

Note: `RECRAFT_API_KEY` spends **API units**, which are billed separately
from the Recraft Studio subscription credits (those only flow through MCP
and Studio). The keepsake portrait is best-effort: no key → `skipped`,
the reveal simply omits it.

Provider key files such as `server/sandbase.env`, `server/groq.env`,
`server/cloudflare.env`, `server/fal.env`, `server/recraft.env` and
`server/resend.env` are gitignored (`.gitignore` has
`*.env` and `server/*.env`). They are **never** committed. The current SandBase
key was created with a $1 pilot cap; the fal.ai key is scoped to
TRELLIS.2 execution plus the upload/request permissions needed to run it.

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
  webhook secret; SandBase/fal/Recraft/Resend: revoke the key), set the new
  value as a Fly secret, redeploy, then scrub history only if the repo is private.


### Required explicit runtime flags

- `ALLOW_UNPAID_SEAL` defaults off. Set it to `true` only for a deliberately
  free demo/dev deployment. Production must leave it unset/false; otherwise
  sealing, recipient access, email delivery, world generation and portrait
  generation are all blocked until Stripe/pack entitlement exists.
- `ENABLE_EXPERIMENTAL_ROUTES` defaults off. Set it to `true` only on backends
  that intentionally serve the tabletop `/api/room-gifts` and `/api/photo-gifts`
  pilots. The canonical EnigmaGift API does not need those routes.
- `MAX_DRAFTS_PER_DAY` defaults to `200`. It is a global cost circuit breaker
  in addition to the existing 5 drafts/hour/IP limit.

To set Fly secrets without printing keys:

```bash
cd server
KEY="$(sed -n 's/^SANDBASE_API_KEY=//p' sandbase.env | tr -d '\r')"
fly -a enigmagift-api secrets set SANDBASE_API_KEY="$KEY"
KEY="$(sed -n 's/^FAL_KEY=//p' fal.env | tr -d '\r')"
fly -a enigmagift-api secrets set FAL_KEY="$KEY"
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

### Tabletop room Worker (pilot)

```bash
npm run deploy:room   # from the repo root, after `fly deploy` for the API
```

Builds `dog-gift-tabletop/dist`, regenerates Worker types and publishes
Worker `enigmagift-room`. Generation keys stay out of the Docker image via
`server/.dockerignore` (`*.env`).

`ROOM_PROXY_SECRET` must be provisioned to **both** providers with the same
value — Fly via `fly secrets import` (stdin) and the Worker via
`wrangler secret put` (stdin). Deploy the Fly API **first** (the new server
code is backward-compatible: unsigned requests fall back to the
connection-IP bucket), then the Worker last — `wrangler.jsonc` declares the
secret `required` so deploy validates presence. No secret value lives in
the repo, config `vars`, or docs.

**First deploy, 2026-11-21** (source `ecc9781`):

- Fly: image `registry.fly.io/enigmagift-api:deployment-01M804EX88G88CSZCV9AZ958GF`,
  machine `080ee739b9d578` version 17, volume `vol_vlygqw13dp1zwxg4` (`/data`).
  Pre-room-feature rollback image: `deployment-01M7Z9H5XHACZPY9PPB689MNC9`.
- Worker: `https://enigmagift-room.trustfall.workers.dev`, initial version
  `7aa6dfad-2d85-4da0-8164-2949ff6a8aa8`, account
  `e7383c0c7474c8f61cc06598eeb134a0`. Metadata update version:
  `2d92d543-6f15-45fe-81a4-4f38abce6428` (metadata-only update setting the
  public Open Graph image URL). The initial version remains the rollback
  target.
- Rollback: Fly → prior image above; Worker →
  `wrangler rollback <VERSION_ID> --config dog-gift-tabletop/wrangler.jsonc`
  (takes a **version** ID, not a deployment ID). The initial version is the
  only rollback target until a newer one is recorded — there is no prior
  Worker to roll back to. The SQLite database is not rolled back with code.

**Rate-limit deploy, 2026-11-22 ~00:58 UTC** (source `eddfd6a`):

- `ROOM_PROXY_SECRET` provisioned identically to Fly (`fly secrets import`)
  and the Worker (`wrangler secret put`) before the Worker deploy.
- Fly: image `registry.fly.io/enigmagift-api:deployment-01M80C276AHAJGTD2P7HET78KE`,
  `/api/health` 200.
- Worker: version `42ddc732-61b6-407a-96df-dceabc206cf1` (0 frontend asset
  changes).
- Public proof: a disposable fixture verified create 201 with
  `X-RateLimit-Scope: verified-client`, recipient 200 with the exact
  edition, idempotent retry 200 same token, close 200, recipient 404 and
  owner view `revoked:true, edition:null` afterwards.
- Rollback targets: Fly image `deployment-01M804EX88G88CSZCV9AZ958GF` and
  Worker version `2d92d543-6f15-45fe-81a4-4f38abce6428` (the pre-signing
  code still works via the unsigned fallback; the secret can remain).

**Staged gift editor release, 2026-11-22** (source `67d792d`): Worker version
`27da1606-9354-4997-8ef2-9a00ca0d2028` — frontend-only update, 3 static
assets changed (`index.html`, `index-BjtlKqIz.js`, `index-B_khd6nr.css`).
API and Worker proxy logic unchanged; the shared `ROOM_PROXY_SECRET` stays
provisioned. Public smoke: staged composer, preview and one
create→recipient→revoke fixture all verified live. Rollback target: Worker
version `42ddc732-61b6-407a-96df-dceabc206cf1`; API remains image
`deployment-01M80C276AHAJGTD2P7HET78KE` (no API redeploy).

**Delight/intuitiveness release, 2026-11-22** (source `71911b9`): Worker
version `7a8638ed-0324-41c0-b877-25a871a0c421` — frontend-only update, 3
static assets changed (`index.html`, `index-C0QB9sXR.js`,
`index-a7RnKLxp.css`). API and Worker proxy logic unchanged.
UI changes: adaptive Review (guided primary, disabled Preview until the
essentials are complete, ✓ marks only on completed required
stages), clearer stage-primary labels ("Write the note", "Keep these
clues"/"Review my gift"), per-clue purpose hints, "Continue your gift"
draft resume on cover/help/photo paths, preserved line breaks in review
and both recipient notes (overflowing notes now scroll instead of
clipping), a large "Your gift is ready." management heading, optional
native Share for the public recipient link (copy always present), and
clearer public-vs-private link wording. Enter in a name field explicitly
advances one stage. Public smoke: `?make=1` served the new assets, empty
Review guided to the first field, real Enter advanced without a POST,
Close→resume restored the draft, preview preserved line breaks and
returned to Review, one disposable create→recipient→revoke fixture
behaved end-to-end (recipient unavailable after close). Real phones and
the native OS share sheet remain unverified (share was stub-tested
locally). Rollback target: Worker version
`27da1606-9354-4997-8ef2-9a00ca0d2028`; API remains image
`deployment-01M80C276AHAJGTD2P7HET78KE` (no API redeploy).

**Letter-led composer release, 2026-11-22** (source `b839209`): Worker
version `414ccb0d-2901-4e92-be38-0b99545d8be8` — frontend-only update, 3
static assets changed (`index.html`, `index-CbIdV1rk.js`,
`index-DEUIajLM.css`). API and Worker proxy logic unchanged; the shared
`ROOM_PROXY_SECRET` stays provisioned. The staged form became a
letter-first composer: envelope (recipient) → letter (note + signature)
→ gift, clue trail as an optional detour, optional first-line starters
that must be finished before saving, Enter advancing a stage, and the
room UI dimmed (visibility only) while composing. Public smoke: new
assets served; guided/Enter routing, starter finish-gate, detour,
close/resume and preview return all worked live; one disposable
create→recipient→revoke fixture behaved end to end. Real phones and
human onboarding research remain unverified. Rollback target: Worker
version `7a8638ed-0324-41c0-b877-25a871a0c421`; API remains image
`deployment-01M80C276AHAJGTD2P7HET78KE` (no API redeploy).

**Post-release fixes, 2026-11-22** (source `cf498a4`): Worker version
`7febf89f-d567-4994-a423-d04a6c0b0a67` — contextual hints cleared on
movement/inspect/discovery, composer follows the visual viewport, copy
updates. API unchanged.

**Personal-photo hunts release, 2026-11-22** (backend source `fc38277`,
frontend source `66cf464`): Fly API image
`deployment-01M81SA5SRK00CANRFZ2AD120M`; Worker version
`a7f7442f-538f-4726-ac7d-8f524b97c301` serving `index-CLiT6pfW.js`,
`photo-app-wzFju6F8.js`, `main-BcsBTyFK.js`, `index-WgNI_fO3.css`. The
Worker proxy allowlist now covers `/api/photo-gifts` and its subpaths
alongside `/api/health` and the room-gift routes. Normalized JPEGs and
editions are stored atomically in SQLite on the existing `/data` volume;
the API machine has 512 MB of RAM.
Live public smoke: one fixture created, played and revoked through the
Worker — metadata and image both 404 after close. Rollback: Worker
version `7febf89f-d567-4994-a423-d04a6c0b0a67` (an older frontend would
only disable photo links, not delete stored gifts — favour roll-forward);
API → prior image. Real phones, virtual keyboards and production retry
races unverified.

### Ready-screen and language release, 2026-11-22

Pilot source `35986b8`, React wording source `7112bac`, research/documentation
`c379161`. Worker version `ca3b1aed-3df9-496e-802d-247ddfbc56ae` serves
`index-Di-8O9f8.js`, `photo-app-nUnd3Zlr.js`, `main-UYRZBahY.js` and
`index-CaFGvmvy.css`. Previous Worker version:
`a7f7442f-538f-4726-ac7d-8f524b97c301`.

The main Pages site also published at
`https://c0567b5b.enigmagift.pages.dev`, with production
`https://enigmagift.pages.dev` serving `index-DCrthbMf.js` and
`index-UhriMBEY.css`. This brings the earlier landing/mobile changes
(`33bfcff`) and giver dashboard (`5387d02`) onto Pages too; those were not
in its previous production source `bceba03` (deployment
`e35897d7-2f2d-4c49-8e0b-f0f254c111ae`).

Strict pilot TypeScript and both builds passed. Public asset bytes matched
the local builds, and the Pages `/api/health` proxy returned 200. Both pilot
flows passed live create → preview → edit a copy → new recipient link;
original editions remained unchanged. All four fixtures were closed and
public access checked afterward. Local checks also covered draft recovery,
failed requests, denied storage, failed history navigation and short mobile
viewports. React Editor/Seal were checked by rendering their demo components,
not by completing the paid pipeline. Real phones, native share sheets and
live payment/generation remain unverified. No Fly redeploy was needed.

**Pages builds:** use `npm run deploy:pages`. The script builds with the
three production `VITE_STRIPE_LINK_*` public values, then
`scripts/verify-pages-build.mjs` proves the live links are inlined, no Stripe
`test_` link slipped in, the terms copy matches the upload pipeline, and the
first HTML does not preload three.js/the GLB. `wrangler pages deploy` uploads
already-built assets; it does not inject dashboard or shell env vars into a
local build. Do not hand-assemble payment-link env vars unless the script
itself is being changed.

The motion proposals and sources are in [`MOTION.md`](MOTION.md). This
release changes language and the ready/editing flows, not animation timing.

### The world (per-gift 3D model)

Sealing a gift triggers `buildWorld` (`server/world.js`): fal.ai's queued
**TRELLIS.2** API (`fal-ai/trellis-2`) turns the gift's **most iconic photo** —
the one the throughline points at, scored by the pipeline (`pickWorldSource` in
`pipeline.js`, stored as `gifts.world_source`) — into a ~1.5–3MB GLB, saved to
the volume at `<UPLOADS_DIR>/<giftId>/world.glb`. Falls back to the first
readable photo if no source is recorded.

- **State** lives on the gift row: `world_status`
  (`pending → worlding → ready|failed`) + `world_file` + `world_started_at`
  + `world_ready_at`. Timing: `gifts.read_ready_at` stamps when the read
  finishes, and both the pipeline and world log their duration
  (`ready in <N>s`, `… (source photo N)`).
- **Build cost/latency:** fal currently charges **$0.30 at 1024p**; the first
  controlled fal build completed in **25s**. The reveal scene polls
  `GET /api/trail/:token/world-status` every 5s and shows the world once
  `ready`; the GLB streams from `GET /api/trail/:token/world` (`202` until ready).
- **Provider media handling:** the source photo is uploaded to fal's CDN with a
  one-hour lifecycle; inference uses `X-Fal-Store-IO: 0`; input and output CDN
  objects are explicitly deleted after the run. The durable GLB copy is ours on
  the Fly volume.
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
npm run deploy:pages
```

For a manual two-step deploy, use `npm run build:pages && npm run
verify:pages-build` before `npx wrangler pages deploy dist
--project-name=enigmagift --branch=main`.

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
499/999/1900), sets `paid=1` and `delivery_entitled=1`, and for a **Set**
payment creates a 2-credit `packs` row linked to the gift (three hunts total
including the purchase gift). `mark-paid` is only a client hint: it **fails
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
# mark-paid, answer-key stripping, unlock rate limit, revoke/expiry, upload normalization
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
- **EXIF/GPS removed by JPEG normalization** for every accepted upload
  (`server/image.js`, sharp; unsupported/undecodable files are rejected rather
  than stored). Safari 17+/iOS also re-encodes HEIC in the browser before upload.
- **Rate limits** on create/reclue/unlock/answer/mark-paid/seal/hide/
  world-source/revoke/delete/events; the in-memory limiter is key-bounded.
- **Legal pages**: `/privacy`, `/terms` (static, `public/*.html`, clean URLs —
  Pages serves `privacy.html` at `/privacy` automatically; do NOT add
  `_redirects` rules for them, that 308-loops). Both open with a "short
  version" box; full text in `<details>`. Upload requires a consent checkbox.
  Placeholder contact addresses and governing law — **get legal review before
  launch**, and verify each AI subprocessor's retention/training terms before
  claiming anything about training in the policy.
- **Trust UI** (informed-but-not-verbose): `TrustRow`/`InfoDot` components
  (`src/components/TrustRow.tsx`) — photo-promise rows + consent on the Door,
  order-summary card (tier/price/includes/Stripe lock/refund) above the pay
  button on the Seal, and a manage row (revoke / delete / what's stored) once
  sealed; a one-line privacy note on the recipient's round 1. Keep copy in the
  lowercase brand voice; never pre-tick anything.
- **Giftability UI**: the Seal shows a REAL scannable QR (`QRCode`,
  qrcode-generator) of the /t/ link, and for The Hide a printable card
  (QR + code + link, `@media print` isolates it) for inside the hidden thing.
  The Reveal ends with a recap of the recipient's own picks (polaroids + stats,
  kept client-side in sessionStorage — the answer key never leaves the server)
  and a "copy a note to send back" button (logs a `shared_back` event).
  Gotcha: the unlock code plaintext is returned ONLY by the first seal
  (stored as a scrypt hash afterwards) — re-sealing returns `unlockCode: null`,
  and the UI says so.
- **Hide destination clue**: the trail payload carries `hideHint` (the hide
  spot the giver actually used, else the best pipeline-proposed spot) for
  physical gifts only; Round 3 shows "one last clue — the thing is hidden …"
  and the CTA becomes "go find it →". Digital trails carry no hideHint.
- **Secrets**: pre-commit hook blocks `whsec_…`/`sk-…`/etc. (see Secrets
  hygiene). Multer bumped to 2.x.

## Performance & caching (2026-11-21)

- **Pages**: `/assets/*` (vite-hashed) → `Cache-Control: public, max-age=31536000, immutable`
  via `public/_headers`; everything else revalidates. Measured ~60–80ms at the edge.
- **API**: all `/api/*` responses default to `no-store`; token-scoped
  photos/world/portrait and the buyer photo route override with
  `private, max-age=86400`. When the server serves `dist/` locally it applies
  the same policy (hashed assets immutable, index no-cache) — on Fly the image
  is API-only (`/` is 404 there by design; Pages owns the frontend).
- **DB**: indexes on all `gift_id` FK columns; deleting a gift or purging a
  stale draft also deletes its `events` rows (erasure + no unbounded growth).
- **Polling**: Reveal backs off 5s → 10s → 20s while the world builds; Reading
  polls on a 1.6s chain (shows live progress).
- **Cold starts**: `auto_stop_machines=stop`, `min_machines_running=0` — first
  hit after idle pays a multi-second cold start. If that hurts, set
  `min_machines_running=1` in `fly.toml` (one always-on shared-cpu machine).
- **Cost levers already in**: client-side 1280px downscale before upload (fewer
  vision tokens, less storage), server-side JPEG normalization, 5 drafts/h/IP
  plus `MAX_DRAFTS_PER_DAY` global circuit breaker, payment-gated generation,
  reclue bounded, world build idempotent. Later: self-host fonts (drops a render-blocking
  third-party request + CSP exceptions), optional `compression` on the API.

## Weekly ops routine (volume, funnel, money, webhook health)

Run the report inside the Fly machine (the script ships in the image):

```bash
fly -a enigmagift-api ssh console -C "node /app/scripts/ops-report.mjs"
```

It prints: configured capability presence (never secret values), gifts by
status/tier/mode, paid-by-tier + estimated gross £, unsealed drafts (7d count
= vision spend at risk), trails (unlocked/expired), packs,
entitlement/payoff integrity (`paid but not delivery-entitled` should always
be 0; legacy unentitled sealed rows are counted separately and should remain
blocked at read time; world/portrait status counts; stale generation jobs),
the event funnel
(round-pick correctness, `shared_back`, `webhook_ok`, `markpaid_pending`,
`seal_blocked_unpaid`), and the reconciliation checklist:

1. Stripe → Developers → Webhooks → `we_…` → Recent deliveries: all 2xx?
   Compare with non-synthetic `webhook_ok` in the report — a gap means a lost
   `paid` event. The report separately counts `evt_ops_smoke_…` webhooks so
   operator smoke tests do not masquerade as Stripe deliveries.
2. Stripe → Balance/payouts vs estimated gross (same window).
3. fal.ai + SandBase + Recraft dashboards → spend in the same window. If
   drafts(7d) × ~10p approaches paid revenue, consider gating the vision read
   behind payment or tightening the 5/h draft limit.

Also: `fly -a enigmagift-api logs --no-tail | grep -i "stripe webhook"` for
endpoint errors. Every verified webhook is logged as a `webhook_ok` event
(`server/index.js`), which is what makes the gap check possible.


## Backup and restore

The SQLite database and uploads are customer data; the Fly volume is durable
infrastructure, not a backup. Create a verified point-in-time backup inside the
machine with:

```bash
fly -a enigmagift-api ssh console -C "node /app/scripts/backup-volume.mjs"
```

The script uses SQLite `VACUUM INTO`, verifies row counts against the source,
copies uploads, writes a manifest, and stores the result under
`/data/backups/<timestamp>` (override with `BACKUP_DIR`). A backup on the same
volume protects against application corruption, not volume/machine loss — copy
important backups offsite before relying on them:

```bash
fly -a enigmagift-api ssh console -C "tar -C /data/backups -czf - <timestamp>" > enigmagift-backup-<timestamp>.tar.gz
```

The canonical local wrapper does both steps and verifies the gzip before
moving it into place:

```bash
scripts/pull-backup.sh ~/enigmagift-backups
```

Restore is intentionally explicit and preserves the pre-restore database and
uploads beside the restored files:

```bash
DB_PATH=/data/enigmagift.db UPLOADS_DIR=/data/uploads \
  node /app/scripts/restore-volume.mjs --from /data/backups/<timestamp> --confirm-restore
```

Run restore only while the application is not serving the target database, then
restart the app and verify `/api/health`, one known recipient link, and the
ops-report counts. The right long-term shape is continuous off-volume backup
(for example Litestream to object storage); until that exists, running
`scripts/pull-backup.sh` is part of the weekly routine.

---

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

## Motion release — 2026-11-22

- Pilot source `9c36528`; React source `16968d6`.
- Worker `enigmagift-room`, account `e7383c0c7474c8f61cc06598eeb134a0`,
  default production environment: version
  `cbc94cb0-f94c-487c-9655-9b9c65211324`.
- Pages project `enigmagift`, branch `main`:
  `https://2eb2e97f.enigmagift.pages.dev`, serving the canonical Pages site.
- Reviewed artifact bytes match production; Pages `/api/health` returned 200.
  Public Stripe link mappings were checked before deployment and preserved.
- No API deployment, schema, payment configuration or secret changes.
- Prior frontend versions for rollback: Worker
  `ca3b1aed-3df9-496e-802d-247ddfbc56ae`; Pages
  `https://c0567b5b.enigmagift.pages.dev`. Reconfirm rollback limitations and
  the active deployment before rolling back.
- Motion details and verification limits are in `MOTION.md`.
- Live creation, discovery, draft return and saved preview verified; the one
  release fixture was revoked and its metadata and image both returned 404.
  Task browser sessions were closed and their Chrome profiles confirmed gone.

## Production hardening release — 2026-11-25

- Source `a6e512d` (`Harden payment, privacy, and production operations`).
- Pre-deployment backup: `/data/backups/pre-deploy-a6e512d` on the Fly volume,
  verified against source row counts (6 gifts, 5 trails, 1 pack, 15 events,
  9 room gifts, 6 photo gifts) and copied off-volume before deployment.
- Fly API image `deployment-01M89BHJ3H11Y5891R43YBYYCG`, machine
  `080ee739b9d578` version 21. Previous rollback image:
  `deployment-01M81SA5SRK00CANRFZ2AD120M`.
- `ENABLE_EXPERIMENTAL_ROUTES=true` is intentionally provisioned so the
  already-live tabletop/photo pilots keep working. `ALLOW_UNPAID_SEAL` is
  unset; `MAX_DRAFTS_PER_DAY` uses the default 200.
- Pages deployment `https://75cb3c78.enigmagift.pages.dev` is live at
  `https://enigmagift.pages.dev`, serving `index-a2d7cmP_.js` and
  `index-Bv1eB1Ss.css`. Prior Pages rollback target:
  `https://2eb2e97f.enigmagift.pages.dev`.
- Live smoke: API health 200 directly and through Pages; experimental Worker
  `/api/health` 200; all three Stripe Payment Links present in the production
  bundle; no three.js preload in `index.html`; updated privacy copy live;
  the documented paid Fort Point trail returns 200 while the documented
  unpaid Rosa's Cafe trail now returns 404 (intentional fail-closed behavior).
- Migration result at deploy time: 2/6 gifts delivery-entitled, 1/5 trails
  entitled. The other sealed trails were legacy unpaid test rows and are now
  closed to recipients. The legacy already-minted Set pack still has 3 credits;
  only newly minted Set packs are 2-credit packs.
- Local verification before deployment: root build passed, root tests passed
  (53 assertions + 10 scene smoke renders), server security suite 62/62,
  backup/restore rehearsal passed, legacy migration rehearsal passed, root and
  server production audits clean.

## Post-release validation and corrections — 2026-11-25

- A controlled live funnel test created gift
  `0de519d7-8d37-4900-ba6c-6c9550923953` from one production photo upload.
  The vision pipeline completed (`3` clues, `2` rounds) after a fallback from
  one unparseable vision response.
- Payment-negative verification: unauthenticated unpaid `POST /seal` returned
  `402 paymentRequired` and logged `seal_blocked_unpaid`; no trail was created.
- Payment-positive verification without spending money: a synthetic
  `checkout.session.completed` payload was signed inside the Fly machine using
  the production webhook secret and posted to localhost. The webhook returned
  `200`; the gift became `paid=1`/`delivery_entitled=1`; a subsequent public
  `POST /seal` returned `200` and created recipient token `q6Gls1W8rkiLkJ3_`.
  The recipient API/page returned 200 and rendered the keepsake. This proves
  our webhook handling and seal boundary, not Stripe dashboard delivery.
- The controlled fixture was then deleted through the public delete route;
  gift and trail both returned 404 afterward. No test customer data remains.
- No real Stripe checkout was completed: the production Payment Links are
  live-money links. Stripe dashboard delivery therefore remains the one
  unverified part of the true payment path.
- Deployment correction: during the Terms copy redeploy, a manually assembled
  build first omitted payment links and then briefly used invalid Stripe
  `test_…` links carried forward incorrectly. The mistake was caught in live
  verification and corrected within minutes; production again serves the real
  links. `npm run deploy:pages` plus `verify:pages-build` now makes that class
  of mistake a build/CI failure instead of a manual-memory requirement.
- Production capability findings from the controlled seal: Recraft portrait
  was skipped because `RECRAFT_API_KEY` is not configured; SandBase world
  generation failed with provider `402 API key spending limit exceeded`.
  Email is likewise unconfigured until `RESEND_API_KEY`/`MAIL_FROM` are set.
  These are operator billing/key decisions, not code-path failures.
- Post-test backup `/data/backups/2026-11-25T17-12-24-249Z` was created and
  copied off-volume to `~/enigmagift-backups/enigmagift-2026-11-25T17-12-24-249Z.tar.gz`
  (12,917,317 bytes, sha256
  `f95d3910d4133f3e484552787b0dfb1f9346082b6dde3963722a17aa8e427103`).
- `server/scripts/stripe-webhook-smoke.mjs` now formalizes the signed local
  webhook smoke test. It requires `--confirm`, never prints the secret, and
  must be documented as synthetic whenever used.
- Ops tooling deploy: Fly image `deployment-01M89VWB5DVCB9P5P3ZYWPECM6`
  (machine `080ee739b9d578`) ships the enhanced ops report and webhook smoke
  script. `/api/health` returned 200 after deployment; no runtime application
  behavior changed.
- Legacy Set cleanup: the pre-launch 3-credit test pack
  (`08ec61f6-0b9b-4dc3-a10a-510fe3327361`) was detached and deleted after a
  verified off-volume backup at
  `~/enigmagift-backups/enigmagift-pre-pack-cleanup-2026-11-25T19-05-32-407Z.tar.gz`
  (sha256 `f9818e02a106107675a21e64c8c8e61fd19d394cbe07e6ac3f59524a1aee3d34`).
  There are no real users; the purchase-shaped parent gift remains part of the
  older test inventory, but the pack liability is gone (`packs` is now empty).
- SandBase activation: the original key remained unusable because its key-level
  spending limit was exhausted and even the balance endpoint returned 402. The
  owning console account could not be identified from available sessions, so a
  new capped key was created in the authenticated Papa workspace using only its
  existing $1 credit. Production `SANDBASE_API_KEY` was rotated to that key.
  The key is named `EnigmaGift production pilot`, has a $1 lifetime cap, and
  the console confirmed it active before use.
- SandBase validation: a fresh controlled trail gift
  (`55a0f7d5-2e55-46fc-b34b-a08337eea97c`) completed vision, synthetic payment,
  seal, recipient payload and TRELLIS world generation. The world endpoint
  returned 206 for a ranged asset request. The fixture was deleted through the
  public delete route and both gift/trail then returned 404. SandBase history
  showed one $0.300 TRELLIS run plus approximately $0.024 of vision/candidate
  calls; balance after the test was $0.676027. This validates the provider
  path but leaves budget for only a very small pilot unless credits are added.
- Recraft boundary: the available Recraft account was accessible, but its API
  balance is $0. Studio credits are separate and cannot power production API
  image-to-image calls. No purchase was made, so `RECRAFT_API_KEY` remains
  unset and portraits remain skipped.
- Resend boundary: the user confirmed there is no production domain yet. The
  free Resend tier is sufficient for pilot volume, but real customer email
  requires a verified owned domain; `onboarding@resend.dev` only supports
  owner testing. No purchase was made, so `RESEND_API_KEY` and `MAIL_FROM`
  remain unset.
- Ops-report provider balances were deployed in Fly image
  `deployment-01M8A2X7B5TA68QF9NJ6FWPDWR`; the live report showed SandBase
  balance `$0.676027`, Recraft key missing, `/api/health` 200. The first cold
  start after the deploy measured about 4.9s, consistent with the accepted
  auto-stop trade-off.
- Recipient research instrumentation is live in Pages deployment
  `https://c61c2ec7.enigmagift.pages.dev` (`index-sQV1dESN.js`): per-round
  dwell, reveal completion, letter-read, world load/failure and bounded
  token-redacted client errors now write to the existing events table. The
  deployed ops report summarizes all of them; current counts are zero until
  the first recipient session after this deploy.
- Repository hardening: `main` now requires the `verify` CI check before
  pushes merge through GitHub, with force pushes and branch deletion disabled.
  The first CI run covering the Pages verifier passed as run `45663687944`.
- fal.ai migration: a scoped production runtime key named `EnigmaGift production
  runtime` was created for TRELLIS.2 execution plus upload/request permissions,
  stored only in gitignored `server/fal.env` (0600) and Fly secret `FAL_KEY`.
  A local controlled build produced a valid 1.50MB GLB in 25s. Backend image
  `deployment-01M8CB5MJ58ADSPF7PX2W34TK5` deployed the migration; `/api/health`
  returned 200.
- fal.ai production validation: controlled gift
  `f09b8d1c-7e93-4069-bd87-28126cd4cae1` completed upload, vision, synthetic
  signed webhook payment, seal, recipient payload and world generation. The
  production world was a valid 1.24MB GLB built in 20s; a ranged `/world`
  request returned 206 with `glTF` magic. The fixture was deleted through the
  public delete route and both gift/trail then returned 404. The fal dashboard
  balance moved from $129.28 to $128.68 across the local and production test
  runs, matching two $0.30 TRELLIS builds. The scoped key correctly cannot read
  billing through the API (ops-report shows 403); use the dashboard for balance.
- Privacy/provider copy is live in Pages deployment
  `https://20d3511d.enigmagift.pages.dev`; `/privacy` now names fal.ai as the
  world-generation processor and SandBase only as the vision processor. Direct
  API health and Pages `/api/health` both returned 200 after deployment.


## Vision fallback expansion — 2026-11-26

- Groq key `EnigmaGift vision pilot` and Cloudflare API token
  `EnigmaGift Workers AI vision` were created through the authenticated
  dashboards. Neither value was committed or printed. Local copies live only
  in gitignored `server/groq.env` and `server/cloudflare.env` (0600); the
  Cloudflare token is account-scoped Workers AI Read only. Production values
  are Fly secrets `GROQ_API_KEY`, `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`.
- Benchmarks on the representative Fort Point sample showed Groq
  `qwen/qwen3.8-27b` returning valid structured observations quickly
  (about 2–5s), but the free tier rejected normal 4,096-token output budgets
  because its output-token-minute cap is 1,000. The integration therefore
  caps Groq responses at 900 tokens and treats truncation/malformed JSON as a
  failover signal. This makes Groq useful as a secondary fallback, not the
  primary parallel-image fallback.
- Cloudflare Qwen initially burned the whole completion budget in reasoning
  and returned no JSON. Benchmarking showed
  `chat_template_kwargs: { enable_thinking: false }` is required. Cloudflare
  Mistral Small 3.1 was the better first Workers AI candidate: valid JSON,
  13 normalized observations, about 17s and roughly 82 Neurons for the sample,
  versus roughly 273 Neurons for Qwen. The provider order is therefore
  SandBase → Cloudflare Mistral → Cloudflare Qwen → Groq → Gemini.
- Local integration smoke tests passed for both fallbacks: structured image
  observations plus text-only cross-image and letter-draft generation.
  Production smoke tests inside the Fly machine used the public sample image
  and deployed secrets: Cloudflare returned 12 observations in 15.5s; Groq
  returned 12 observations in 4.6s. No private customer photos were used.
- Backend image `deployment-01M8CE8FCKFCVGF53CVCDZGC79` carries the provider
  failover code and enhanced ops-report capability output. Failover memory is
  workload-specific so a text-only Groq success cannot promote Groq ahead of
  Cloudflare for subsequent image reads. `/api/health` returned 200, and the
  in-machine candidate probe confirmed the production order
  `cloudflare:mistral`, `cloudflare:qwen`, `groq:qwen` when SandBase was
  deliberately excluded by `VISION_PROVIDERS`.
- Pages deployment `https://e879d3b8.enigmagift.pages.dev` updates the
  privacy subprocessors to name Groq and Cloudflare Workers AI. Pages
  `/api/health` returned 200 and the live privacy page was verified to contain
  both new provider rows.
- `VISION_PROVIDERS` is available as an emergency/benchmark allowlist
  (`sandbase,cloudflare,groq,gemini`). Leave it unset in normal production so
  the full failover chain remains available.

## Test trails currently in the DB (for re-verification)

Created live on the Fly backend 2026-11-17 (gift id → trail token → original
plaintext code, now stored hashed):

- `43ddaaea-…` → trail `6rOYxBOx-rkCDWxT` → code `F3Z6BQ` (Fort Point)
- `68e0fb7c-…` → trail `kvEkSWjhRWlr6xHc` → code `2JNVZP` (Rosa's Cafe, Portsmouth)
- older unsealed drafts, including the former Rockingham House test draft,
  were purged as stale before the 2026-11-25 hardening backup/deploy
