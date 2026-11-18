# EnigmaGift — ops runbook

Last verified live: 2026-11-17. This is the "how to operate it" doc: deploys,
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
| `VITE_STRIPE_LINK` | Netlify **production** context env var | inlined at build time |
| Gemini key (fallback) | any `Dev/*/.env*` the server scans | — |

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
- Big build-context warning (node_modules ~81MB) is harmless; `.dockerignore`
  already excludes node_modules/uploads/db.

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
