# EnigmaGift — operations runbook

**Status:** canonical operational reference · **Last verified live:** 2026-11-26

**Scope:** how to run, deploy, verify, back up, and troubleshoot the live system.

Historical deployment evidence, release-specific rollback IDs, provider migration
notes, and validation episodes live in [OPS-LOG.md](OPS-LOG.md). The endpoint
contract lives in [API.md](API.md). This file should contain current operating
truth, not a chronological release diary.

---

## Current topology

| Piece | Production location | Notes |
|---|---|---|
| Frontend | Cloudflare Pages, `https://enigmagift.pages.dev` | Static Vite build plus Pages Function proxy for `/api/*`. Deploy with `npm run deploy:pages`. |
| Backend | Fly.io, `https://enigmagift-api.fly.dev`, app `enigmagift-api`, region `iad` | Node/Express/SQLite. Persistent `/data` volume holds the database and uploads. |
| Experimental pilots | Cloudflare Worker `https://enigmagift-room.trustfall.workers.dev` | Tabletop/photo-gift pilot. Enabled only because `ENABLE_EXPERIMENTAL_ROUTES=true`. |
| Vision | SandBase → Cloudflare Workers AI → Groq → Google Gemini | Cloudflare uses Mistral first, then Qwen. `VISION_PROVIDERS` can restrict the chain for incidents or benchmarks. |
| World generation | fal.ai queued TRELLIS.2 | Scoped `FAL_KEY`; production path validated. |
| Portrait | Recraft | Optional. Currently not configured in production. |
| Email | Resend | Code exists. Currently not configured for customer email because no owned sending domain is verified. |
| Payments | Stripe Payment Links + signed webhook | Webhook is the source of truth for `paid`. |

Netlify remains only as a legacy mirror; Cloudflare Pages is canonical.

---

## Secrets and configuration

Secret values live only in Fly secrets, provider dashboards, or gitignored local
`*.env` files. Never commit or print them.

| Name | Production state | Purpose / notes |
|---|---|---|
| `SANDBASE_API_KEY` | configured | Primary vision provider. Current key is a small capped pilot key; monitor balance. |
| `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | configured | Workers AI vision fallback. Token should remain account-scoped Workers AI Read only. |
| `GROQ_API_KEY` | configured | Fast secondary vision fallback. Free-tier output-token limits mean truncation must fail over. |
| `GEMINI_API_KEY` | configured | Final compatibility fallback. |
| `VISION_PROVIDERS` | unset | Optional comma-separated allowlist: `sandbase,cloudflare,groq,gemini`. Leave unset normally. |
| `FAL_KEY` | configured | Scoped TRELLIS.2 execution plus upload/request permissions. It cannot read billing; use the fal dashboard for balance. |
| `STRIPE_WEBHOOK_SECRET` | configured | Verifies `POST /api/stripe/webhook`. |
| `STRIPE_API_KEY` | missing | Optional restricted Checkout-read key. Until configured, `mark-paid` fails closed. |
| `RECRAFT_API_KEY` | missing | Optional portrait generation. Requires prepaid Recraft API units; Studio credits do not apply. |
| `RESEND_API_KEY` / `MAIL_FROM` | missing | Transactional email. Do not enable for customers until an owned domain is verified. |
| `ROOM_PROXY_SECRET` | configured | Must be the same value in Fly and the pilot Worker. Never commit it. |
| `ENABLE_EXPERIMENTAL_ROUTES` | `true` | Preserves the already-live experimental tabletop/photo pilots. |
| `ALLOW_UNPAID_SEAL` | unset/false | Must remain false in production. |
| `MAX_DRAFTS_PER_DAY` | default 200 | Global draft-cost circuit breaker. |

Local provider files such as `server/sandbase.env`, `server/cloudflare.env`,
`server/groq.env`, `server/fal.env`, `server/recraft.env`, and
`server/resend.env` are gitignored. Example variable names are in
[../server/.env.example](../server/.env.example).

---

## Provider operations

### Vision

The runtime failover order is:

```text
SandBase → Cloudflare Mistral → Cloudflare Qwen → Groq → Gemini
```

Important operating facts:

- Groq is fast but its free tier has a restrictive output-token-minute budget;
  the integration caps output and treats truncation/malformed JSON as failure.
- Cloudflare Qwen requires `enable_thinking: false`; Mistral is cheaper and is
  therefore the first Cloudflare candidate.
- Failover memory is workload-specific, so a fast text-only success cannot
  promote a provider ahead of a better image provider.
- Photos are normalized and downscaled before provider processing.
- Vision is pre-payment spend: abandoned drafts still cost money. Watch draft
  counts and provider dashboards together.

Detailed benchmark evidence is in [OPS-LOG.md](OPS-LOG.md).

### World generation

Sealing starts `buildWorld` in `server/world.js`:

- fal.ai TRELLIS.2 turns the selected source photo into a GLB.
- A controlled production build cost $0.30 and completed in about 20–25s.
- Provider input/output CDN objects use short-lived storage and are deleted
  after the run; the durable GLB lives on the Fly volume.
- `world_status` moves `pending → worlding → ready|failed`.
- Stale `worlding` jobs self-heal after about 10 minutes.
- Failure is graceful: the letter and trail still work without a world.

### Portrait

Recraft is best-effort and optional. Missing key or insufficient API units means
`portrait_status=skipped`/unbuilt; the reveal must still work. API units are
separate from Recraft Studio credits.

### Email

The mailer supports seal delivery, scheduled delivery, and lookup recovery, but
production customer email is blocked until a domain the operator controls is
verified in Resend. The shared Resend test sender is not a production solution.

---

## Payments

- Payment links are public build-time configuration. Use `npm run build:pages`
  or `npm run deploy:pages`; do not hand-assemble Stripe link environment
  variables.
- The signed webhook is the source of truth for `paid`.
- Payment validation requires the correct tier amount in GBP: Trail 499p,
  Hide 999p, Set 1900p. A £1 referral discount is valid only with a recorded
  referral.
- A Set payment creates two additional pack credits; the purchase gift itself
  is the first of the three hunts.
- `mark-paid` is only a fallback hint. Without `STRIPE_API_KEY`, it fails
  closed and never trusts the browser.
- Payment-link success returns use `?paid=1&sid={CHECKOUT_SESSION_ID}`; the
  client strips sensitive checkout state from the visible URL after resuming.

Stripe validation evidence and historical incidents are in
[OPS-LOG.md](OPS-LOG.md).

---

## Deploy

### Backend — Fly

```bash
cd server
fly deploy
```

Run from `server/`, not the repository root; the Dockerfile and Fly build
context live there. After `fly secrets set`, Fly restarts/rebuilds the machine
automatically.

### Frontend — Cloudflare Pages

```bash
npm run deploy:pages
```

This builds with the canonical public Stripe links, runs
`scripts/verify-pages-build.mjs`, and deploys `dist`. The verifier proves the
live links are present, no Stripe test link slipped in, and the first HTML does
not preload the heavy world stack.

### Experimental room/photo Worker

```bash
npm run deploy:room
```

Deploy the Fly API first, then the Worker. `ROOM_PROXY_SECRET` must already be
provisioned identically to both Fly and the Worker.

### Rollback rule

Before every deploy, record the current Fly image, Pages deployment URL, and
Worker version. Historical rollback examples are in [OPS-LOG.md](OPS-LOG.md),
but do not copy old IDs blindly — confirm what is currently active with:

```bash
fly image show -a enigmagift-api
fly releases --image -a enigmagift-api
npx wrangler deployments list --config dog-gift-tabletop/wrangler.jsonc
```

Database rows and uploaded files do not roll back with code.

---

## Verify before calling production “up”

Minimum checks:

```bash
curl -s https://enigmagift-api.fly.dev/api/health
curl -s https://enigmagift.pages.dev/api/health
```

Local regression checks:

```bash
npm test
npm run build:pages
npm run verify:pages-build
cd server && npm test
```

For deeper verification, use a disposable controlled gift and delete it through
the public delete route afterward. Do not use private customer photos for
provider smoke tests.

The signed webhook smoke test is synthetic. Use
`server/scripts/stripe-webhook-smoke.mjs` only intentionally, with `--confirm`,
and record it as synthetic in ops notes. It proves local webhook handling, not
Stripe dashboard delivery.

For browser verification use a named `agent-browser` session and close that
same session when finished.

---

## Weekly operations routine

Run the operational report inside the Fly machine:

```bash
fly -a enigmagift-api ssh console -C "node /app/scripts/ops-report.mjs"
```

Review:

1. capability presence and provider balance state;
2. unsealed draft count and vision spend at risk;
3. paid gifts versus Stripe settlements;
4. `webhook_ok` events versus Stripe webhook deliveries;
5. world/portrait status counts and stale jobs;
6. recipient funnel events once real sessions exist;
7. volume size and backup freshness.

Reconcile fal.ai, SandBase, Recraft, and Stripe dashboards over the same time
window. Treat synthetic webhook events separately from real Stripe deliveries.

---

## Backup and restore

The Fly volume is infrastructure, not a backup. Create a verified backup inside
the machine:

```bash
fly -a enigmagift-api ssh console -C "node /app/scripts/backup-volume.mjs"
```

Copy it off-volume with the canonical wrapper:

```bash
scripts/pull-backup.sh ~/enigmagift-backups
```

Restore is explicit and destructive to the current database state, so it must
be deliberate:

```bash
DB_PATH=/data/enigmagift.db UPLOADS_DIR=/data/uploads \
  node /app/scripts/restore-volume.mjs --from /data/backups/<timestamp> --confirm-restore
```

Run restore only while the app is not serving the target database. Verify
`/api/health`, one known recipient link, and ops-report counts afterward.
Continuous off-volume backup is not configured yet; the weekly pull remains an
operator responsibility.

---

## Current launch boundaries

These are intentional boundaries, not hidden state:

- No uncoached human recipient research has been run yet.
- No real-money Stripe checkout has been completed end-to-end from the Stripe
  dashboard.
- Resend customer email is not configured because no owned domain is verified.
- Recraft production portraits are not configured; API units are separate from
  Studio credits.
- SandBase vision budget is small and capped; monitor before human testing.
- Fly cold starts are accepted for now (`min_machines_running=0`).
- Legal review is still required before launch, especially privacy terms,
  provider retention claims, contact addresses, and governing law.

---

## Gotchas already hit

- Use `/usr/bin/git` on this machine if `/usr/local/bin/git` hangs.
- Push as the GitHub account with write permission (`udirobert`); a 403 usually
  means the wrong gh account is active.
- Do not scan sibling projects for provider keys. Keys come only from explicit
  env vars or gitignored provider files in this repository.
- Cloudflare Pages cannot proxy external domains through `_redirects`; `/api`
  uses the Pages Function.
- Do not add `_redirects` entries for `/privacy` or `/terms`; Pages already
  serves the HTML files at clean URLs and redirects can loop.
- The first seal returns the plaintext Hide unlock code once. Later idempotent
  seals return `null`; only the scrypt hash is stored.
- Legacy unpaid test trails are intentionally blocked at read time even if old
  rows still exist in the database.
- Disk is constrained. Avoid large local caches, generated video artifacts, and
  unnecessary dependency installs in the repository.
