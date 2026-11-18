# EnigmaGift

**Canonical recipient example:** [Someone saved you a seat](https://saved-you-a-seat--enigmagift.netlify.app/) — [live baseline and next design iteration](notes/CANONICAL-GIFT.md).

**Roadmap (not shipped):** [World-first memory hunt and proposed gift tiers](notes/DIGITAL-HUNT.md). The flow below describes the existing £19 physical hunt. Local prototypes: `/studio/room` (2D memory map), `/studio/world` (stereo shelf explorer) and `/studio/marble` (world authoring tool) in `npm run dev`.

> **Hide something real. Let the photographs lead them to it.**

A gift only one person can find. The buyer photographs a place that matters,
hides something there, and the agent reads the photos — finding the details
only they would know — and builds a sealed trail of clues that leads the
recipient to what was left behind. A code in the hidden thing unlocks the
digital keepsake.

Live: **https://enigmagift.pages.dev**

## How it works

0. **Watch it** — an auto-playing showcase of a real gift's recipient side
   (the sales pitch before the ask).
1. **Door** — drop 5–12 photos of a place (or "for me" / demo mode).
2. **Reading** — vision pass (SandBase → Gemini fallback) returns located
   observations per photo. Each photo's read lands in the DB as it finishes, so
   the buyer watches the discoveries stream in live (`photosObserved` ticks
   0→N, partial observations included) instead of waiting on a spinner.
3. **Editor** — buyer approves/cuts the proposed clues (hallucination gate).
4. **Hide** — agent-proposed hide spots; buyer physically hides a note/object
   and writes the unlock code into it.
5. **Seal** — £19 Stripe Payment Link; on return the gift seals and issues a
   trail token + unlock code.
6. **Recipient** — `?t=<token>` opens three deduction rounds (detail →
   connection → throughline reveal), then the physical find + code unlocks
   the keepsake (throughline, place guess, letter). The reveal also shows the
   **3D world of the place** — built from one of the buyer's photos
   (SandBase Run API + TRELLIS.2, `server/world.js`) at seal time — which the
   recipient can orbit and keep (`download` a `.glb`).

Scene order in code: WatchIt → Door → Reading → Editor → Hide → Seal →
R1 → R2 → R3 → Reveal (state machine in `src/App.tsx`, no router).

## Stack

- **Frontend** — Vite + React + TypeScript, GSAP + Lenis. Scene state
  machine (no router). Deployed to Netlify (`dist/` is the publish dir).
- **Backend** — Node + Express + SQLite via `node:sqlite` (`server/db.js`), Multer uploads. Deployed to Fly.io
  (`enigmagift-api`, region `iad`, persistent volume at `/data`).
- **Vision** — `server/gemini.js` (name is historical): SandBase
  (OpenAI-compatible vision, primary) with Google Gemini as fallback.
  Per-image observation + cross-image synthesis, failing over across all
  working key×model pairs.
- **World** — `server/world.js`: SandBase Run API + TRELLIS.2 turns the
  buyer's most iconic photo (the one the throughline points at, picked by
  `pickWorldSource` in the pipeline) into an orbitable 3D world (GLB) at seal
  time, saved to the gift's volume. The recipient orbits it in the reveal —
  it assembles out of the flat photo — and keeps a copy.
- **Payments** — Stripe Payment Link (live, GBP £19 one-time) on the
  "EnigmaGift" Stripe account. `VITE_STRIPE_LINK` is baked at build time.

## Development

```bash
npm install
npm run dev          # frontend on :5173, proxies /api → :8787

cd server
npm install
npm run dev          # API on :8787 (node --watch)
```

Env (backend, `server/.env` or Fly secrets):

- `SANDBASE_API_KEY` — primary vision provider (local copy in
  `server/sandbase.env`, gitignored; set on Fly via `fly secrets set`).
- `GEMINI_API_KEY` — fallback provider; `GOOGLE_API_KEY` /
  `GOOGLE_GENERATIVE_AI_API_KEY` are also picked up as extra quota pools.
- `DB_PATH`, `UPLOADS_DIR` — default to `./data` locally, `/data/*` on Fly.

Frontend env:

- `VITE_STRIPE_LINK` — Stripe Payment Link URL (set in Netlify env vars).
- `VITE_API_URL` — optional; defaults to same-origin `/api`.

## API

| Route | Purpose |
|---|---|
| `GET /api/health` | liveness |
| `POST /api/gifts` | multipart `photos` (5–12, field name `photos`) + `direction` → `{giftId}` |
| `GET /api/gifts/:id` | gift payload (clues, hideSpots, throughline, rounds) |
| `PATCH /api/gifts/:id/clues` | `{keepIds, edits}` buyer approval |
| `POST /api/gifts/:id/hide` | record the physical hide |
| `POST /api/gifts/:id/seal` | → `{trailToken, trailUrl, unlockCode}` |
| `POST /api/gifts/:id/mark-paid` | called on Stripe return (`?paid=1`) |
| `GET /api/trail/:token` | recipient trail (rounds, photo URLs, world status) |
| `POST /api/trail/:token/answer` | `{round, choice}` |
| `POST /api/trail/:token/unlock` | `{code}` → keepsake |
| `GET /api/trail/:token/world-status` | `{worldStatus}` — the 3D world build state |
| `GET /api/trail/:token/world` | streams the place's GLB (202 until ready) |
| `GET /api/photo/:giftId/:i` | original photo by sorted index |

## Deploy

Full runbook: `notes/OPS.md` (topology, secrets, redeploy, gotchas).

- **Frontend**: Cloudflare Pages project `enigmagift`
  (`enigmagift.pages.dev`). `npm run build` then
  `npx wrangler pages deploy dist --project-name=enigmagift --branch=main`
  with `VITE_STRIPE_LINK` set at build time. `/api/*` is proxied to Fly by
  the Pages Function `functions/api/[[path]].js` (Pages `_redirects`
  cannot proxy external domains). Netlify remains as a legacy mirror.
- **Backend**: `cd server && fly deploy`.
- Stripe return URL is configured on the Payment Link:
  `https://enigmagift.pages.dev/?paid=1&sid={CHECKOUT_SESSION_ID}`.
  The gift ID survives the new-tab checkout via `localStorage`
  (`enigmagift.gift.v1`), so `?paid=1` resumes at the Seal scene.

## Known gaps (pre-launch hardening)

- `mark-paid` is unauthenticated — needs a Stripe webhook with signature
  verification before treating `paid` as trustworthy.
- Unlock codes stored plaintext; hash before wider launch.
- CORS is open (`origin: true`); restrict to the deployed domain.
- Multer is on 1.x (npm audit warning) — upgrade to 2.x.
- HEIC upload accepted by extension but untested end-to-end.
- Fly `min_machines_running = 0` — cold starts ~5s on first hit.

Notes: `notes/CONCEPT.md` (product), `notes/RESEARCH.md` (demand evidence),
`notes/SPIKE.md` (vision feasibility), `notes/CRAFT.md` (motion references).
Competition context: Shipyard "Make Me Money" (Nov 2026) + Ship or Die.
GitHub: https://github.com/udirobert/enigmagift

Pre-commit hook (`.githooks/pre-commit`) scans staged diffs for secrets and
runs prettier on web files — enable with `git config core.hooksPath .githooks`.
The `buy.stripe.com` payment link is public by design and safe to commit.
