# EnigmaGift — ops runbook

Last verified live: 2026-11-18. This is the "how to operate it" doc: deploys,
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
| `VITE_STRIPE_LINK` | inlined at build time (`VITE_STRIPE_LINK=… npm run build`) | the `enigmagift` Payment Link URL |
| Gemini key (fallback) | any `Dev/*/.env*` the server scans | — |

Note: `RECRAFT_API_KEY` spends **API units**, which are billed separately
from the Recraft Studio subscription credits (those only flow through MCP
and Studio). The keepsake portrait is best-effort: no key → `skipped`,
the reveal simply omits it.

The key file `server/sandbase.env` is gitignored (`.gitignore` has `*.env` and
`server/*.env`). It is **never** committed. The key is `sk-…` (the `enigmagift`
key, created with a $10 spend cap).

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
VITE_STRIPE_LINK="https://buy.stripe.com/<id>" npm run build
npx wrangler pages deploy dist --project-name=enigmagift --branch=main
```

`/api/*` is proxied to Fly by `functions/api/[[path]].js` — Pages `_redirects`
cannot proxy external domains, so don't try to express the API route there.
`VITE_STRIPE_LINK` must be set at **build** time for the £19 gate to appear. Verify it's inlined:

```bash
grep -hoE 'https://buy\.stripe\.com/[A-Za-z0-9?=_&.-]{6,20}' dist/assets/*.js
```

If the Stripe link is missing, the seal page shows a disabled
"payments opening soon" button.

---

## The Stripe payment link (last sales step)

The seal page (`src/scenes/Seal.tsx`) reads `import.meta.env.VITE_STRIPE_LINK` and
opens it in a new tab with `client_reference_id=<giftId>`. For the buyer to return
and auto-seal, the Payment Link's **success URL** must be:

```
https://enigmagift.pages.dev/?paid=1&sid={CHECKOUT_SESSION_ID}
```

The app detects `?paid=1` on return (or on window focus), calls
`POST /api/gifts/:id/mark-paid`, then `POST /api/gifts/:id/seal`.

Fallback: if the success URL isn't set, the buyer gets a "I've paid" nudge button
on the seal page that completes the flow manually. The success URL is the smooth
path though. Confirm in the Stripe dashboard that the link is **£19** and active.

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
curl -s -X POST https://enigmagift-api.fly.dev/api/trail/<token>/unlock \
  -H 'content-type: application/json' -d '{"code":"XXXXXX"}'   # wrong → {"unlocked":false}
```

Then confirm the recipient journey in a real browser at
`https://enigmagift.pages.dev/?t=<token>` (round 1 crop+options → code gate →
keepsake). Use the `ego-browser` skill, not Playwright.

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

---

## Test trails currently in the DB (for re-verification)

Created live on the Fly backend 2026-11-17 (gift id → trail token → code):

- `43ddaaea-…` → trail `6rOYxBOx-rkCDWxT` → code `F3Z6BQ` (Fort Point)
- `68e0fb7c-…` → trail `kvEkSWjhRWlr6xHc` → code `2JNVZP` (Rosa's Cafe, Portsmouth)
- `dd901e63-…` — ready, not sealed; `placeGuess` "Rockingham House on State Street
  in Portsmouth, New Hampshire" (the concrete-placeGuess fix verified on this one)
