# EnigmaGift

**Canonical recipient example:** [Someone saved you a seat](https://saved-you-a-seat--enigmagift.netlify.app/) — [live baseline and next design iteration](notes/CANONICAL-GIFT.md).

**Roadmap (not shipped):** [Immersive world-first memory hunt](notes/DIGITAL-HUNT.md). The flow below describes the shipped trail-first product. Local prototypes: `/studio/room` (2D memory map), `/studio/world` (stereo shelf explorer) and `/studio/marble` (world authoring tool) in `npm run dev`. `/?miniature=1` opens **the room in the fold**, an authored sample reveal: a photograph unfolds while the Meshy-built miniature (`public/world-meshy.glb`) rises out of it, with scrub, replay and orbit.

> **Let the photographs lead them to it.**

A gift only one person can find. The buyer photographs a place that matters,
and the agent reads the photos — finding the details only they would know —
and builds a sealed trail of clues that leads the recipient to the keepsake.
**The default gift is fully digital** (The Trail, £4.99): three deduction
rounds open the keepsake directly — no physical errand, any distance, sent in
five minutes. **The Hide** (£9.99) adds the physical beat: the buyer hides
something at the place and writes an unlock code into it. **The Set** (£19)
is a pack of three hunts for different people or occasions.

Live: **https://enigmagift.pages.dev**

## Tiers

| Tier | Price | Mode | What the giver does | Recipient flow |
|---|---|---|---|---|
| **The Trail** (default) | £4.99 | digital | upload 5–12 photos, approve the clues, seal & send | `?t=` → 3 rounds → keepsake opens directly (no code) |
| **The Hide** | £9.99 | physical | everything in The Trail, plus physically hide a thing at the place and write the code into it | 3 rounds → find the thing → enter code → keepsake |
| **The Set** | £19 | pack of 3 | buy once, create up to 3 hunts (each Trail or Hide), each with its own recipient link | one link per hunt |

One send = one published recipient link; previews and re-sending the same link
are free. The recipient is never charged. The same exploration, rounds and
guaranteed reveal apply at every price. Recommend the cheaper tier when that
is all someone needs (the set saves £10.97 against three Hides).

## How it works

0. **Watch it** — an auto-playing showcase of a real gift's recipient side
   (the sales pitch before the ask).
1. **Door** — pick a tier, drop 5–12 photos of a place (or "for me" / demo mode).
2. **Reading** — vision pass (SandBase → Gemini fallback) returns located
   observations per photo. Each photo's read lands in the DB as it finishes, so
   the buyer watches the discoveries stream in live (`photosObserved` ticks
   0→N, partial observations included) instead of waiting on a spinner.
3. **Editor** — buyer approves/cuts/edits the proposed clues (hallucination
   gate; *seen* vs *inferred* labelled), picks which photo becomes the 3D
   world, and can ask the agent to re-derive the clues with notes
   (`POST /api/gifts/:id/reclue`, bounded pre-payment).
4. **Hide** — *The Hide tier only*: agent-proposed hide spots; the buyer
   physically hides a note/object and writes the unlock code into it.
   The Trail tier skips this scene entirely.
5. **Seal** — Stripe Payment Link for the chosen tier; on return (webhook +
   `?paid=1`) the gift seals and issues a trail token (+ unlock code for
   The Hide; The Set also creates a 3-credit pack).
6. **Recipient** — `?t=<token>` opens three deduction rounds (detail →
   connection → throughline reveal), then either the keepsake directly
   (Trail: `requiresCode=false`) or the code gate (Hide). The reveal also
   shows the **3D world of the place** — built from one of the buyer's photos
   (SandBase Run API + TRELLIS.2, `server/world.js`) at seal time — which the
   recipient can orbit and keep (`download` a `.glb`), plus the painted
   keepsake portrait when Recraft is configured.

Scene order in code: WatchIt → Door → Reading → Editor → [Hide] → Seal →
R1 → R2 → R3 → Reveal (state machine in `src/App.tsx`, no router; the Hide
scene is skipped for digital gifts).

## Stack

- **Frontend** — Vite + React + TypeScript, GSAP + Lenis. Scene state
  machine (no router). Deployed to Cloudflare Pages (`dist/` is the publish dir).
- **Backend** — Node + Express + SQLite via `node:sqlite` (`server/db.js`), Multer uploads. Deployed to Fly.io
  (`enigmagift-api`, region `iad`, persistent volume at `/data`).
- **Vision** — `server/gemini.js` (name is historical): SandBase
  (OpenAI-compatible vision, primary) with Google Gemini as fallback.
  Per-image observation + cross-image synthesis, failing over across all
  working key×model pairs. Uploaded photos are downscaled client-side
  (max ~1280px) before upload to keep token cost down.
- **World** — `server/world.js`: SandBase Run API + TRELLIS.2 turns the
  buyer-chosen photo (default: the one the throughline points at, picked by
  `pickWorldSource` in the pipeline; changeable in the editor via
  `POST /api/gifts/:id/world-source`) into an orbitable 3D world (GLB) at
  seal time, saved to the gift's volume. The recipient orbits it in the
  reveal — it assembles out of the flat photo — and keeps a copy.
- **Payments** — Stripe Payment Links (live, GBP, one-time) per tier on the
  "EnigmaGift" Stripe account, plus a signed webhook
  (`POST /api/stripe/webhook`) that is the source of truth for `paid`.
  `VITE_STRIPE_LINK_TRAIL` / `_HIDE` / `_SET` are baked at build time.
- **Analytics** — privacy-respecting funnel events (`events` table):
  `POST /api/gifts/:id/event`, `POST /api/trail/:token/event`. No third-party
  trackers.

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
- `RECRAFT_API_KEY` — optional; paints the seal-time keepsake "portrait of
  the place" (`server/portrait.js`, Recraft `imageToImage` — bills API
  units, not subscription credits). Without it the portrait is skipped.
  `RECRAFT_STYLE_ID` / `RECRAFT_MODEL` override the keepsake style/model.
- `GEMINI_API_KEY` — fallback provider; `GOOGLE_API_KEY` /
  `GOOGLE_GENERATIVE_AI_API_KEY` are also picked up as extra quota pools.
- `STRIPE_WEBHOOK_SECRET` — verifies `POST /api/stripe/webhook` signatures.
- `STRIPE_API_KEY` — optional secret key; lets `mark-paid` verify the
  checkout session server-side instead of trusting the client.
- `ALLOWED_ORIGINS` — comma-separated CORS allowlist (defaults to the
  deployed Pages/Netlify domains + localhost).
- `DB_PATH`, `UPLOADS_DIR` — default to `./data` locally, `/data/*` on Fly.

Frontend env (build-time):

- `VITE_STRIPE_LINK_TRAIL` / `VITE_STRIPE_LINK_HIDE` / `VITE_STRIPE_LINK_SET` —
  the three Payment Link URLs (legacy single `VITE_STRIPE_LINK` still works and
  maps to the Hide link). Set in Pages/Netlify env vars.
- `VITE_API_URL` — optional; defaults to same-origin `/api`.

## API

| Route | Purpose |
|---|---|
| `GET /api/health` | liveness |
| `POST /api/gifts` | multipart `photos` (5–12, field name `photos`) + `direction` + `mode` (`digital`\|`physical`) + `tier` (`trail`\|`hide`\|`set`) + optional `packId` → `{giftId}`. Rate-limited per IP |
| `GET /api/gifts/:id` | gift payload (clues, hideSpots, throughline, rounds, mode, tier) |
| `PATCH /api/gifts/:id/clues` | `{keepIds, edits}` buyer approval |
| `POST /api/gifts/:id/reclue` | `{notes}` — re-run the cross-image pass with buyer notes; regenerates clues/rounds (bounded to 2 pre-payment) |
| `POST /api/gifts/:id/world-source` | `{index}` — pick which photo becomes the 3D world; rebuilds if already built |
| `POST /api/gifts/:id/hide` | record the physical hide (Hide tier) |
| `POST /api/gifts/:id/seal` | → `{trailToken, trailUrl, unlockCode?}` (code only for Hide) |
| `POST /api/gifts/:id/mark-paid` | fallback paid-marker; verifies the Stripe session server-side when `STRIPE_API_KEY` is set |
| `POST /api/stripe/webhook` | signed Stripe webhook — the source of truth for `paid`; creates a pack on a Set payment |
| `DELETE /api/gifts/:id` | giver deletes a draft (pre-seal) or a whole gift incl. its recipient link |
| `POST /api/gifts/:id/event` | funnel event `{name}` |
| `GET /api/packs/:id` | pack status (`creditsLeft`) |
| `POST /api/packs/:id/gifts` | create another hunt from a Set pack (consumes a credit; same multipart body as `POST /api/gifts`) |
| `GET /api/trail/:token` | recipient trail (rounds, token-scoped photo URLs, world status, `requiresCode`) |
| `POST /api/trail/:token/answer` | `{round, choice}` |
| `POST /api/trail/:token/unlock` | `{code}` → keepsake (Hide tier; codes stored as scrypt hashes) |
| `POST /api/trail/:token/event` | recipient funnel event |
| `GET /api/trail/:token/world-status` | `{worldStatus}` — the 3D world build state |
| `GET /api/trail/:token/world` | streams the place's GLB (202 until ready) |
| `GET /api/trail/:token/portrait` | streams the painted keepsake portrait (202 until ready/skipped) |
| `GET /api/trail/:token/photo/:i` | original photo by sorted index, **token-scoped** |
| `GET /api/photo/:giftId/:i` | original photo by gift id (buyer/editor side only) |

## Deploy

Full runbook: `notes/OPS.md` (topology, secrets, redeploy, gotchas).

- **Frontend**: Cloudflare Pages project `enigmagift`
  (`enigmagift.pages.dev`). `npm run build` then
  `npx wrangler pages deploy dist --project-name=enigmagift --branch=main`
  with the `VITE_STRIPE_LINK_*` vars set at build time. `/api/*` is proxied to Fly by
  the Pages Function `functions/api/[[path]].js` (Pages `_redirects`
  cannot proxy external domains). Netlify remains as a legacy mirror.
- **Backend**: `cd server && fly deploy`.
- Each Payment Link's success URL is
  `https://enigmagift.pages.dev/?paid=1&sid={CHECKOUT_SESSION_ID}`.
  The gift ID survives the new-tab checkout via `localStorage`
  (`enigmagift.gift.v1`), so `?paid=1` resumes at the Seal scene.
- The Stripe webhook endpoint (`POST https://enigmagift-api.fly.dev/api/stripe/webhook`,
  events: `checkout.session.completed`) must be configured in the dashboard with
  `STRIPE_WEBHOOK_SECRET`.

## Data handling

- Unlock codes are stored as **scrypt hashes** (`trails.unlock_hash`), never plaintext.
- Recipient photo URLs are **token-scoped** (`/api/trail/:token/photo/:i`); the
  gift-id-scoped route is for the buyer only.
- CORS is restricted to `ALLOWED_ORIGINS`.
- `POST /api/gifts` is rate-limited per IP; unsealed drafts older than 7 days
  are purged (files included) on a timer.
- The giver can `DELETE /api/gifts/:id` (draft or whole gift + link).

## Known gaps (pre-launch hardening)

- Multer is on 1.x (npm audit warning) — upgrade to 2.x.
- HEIC upload accepted by extension but untested end-to-end.
- Fly `min_machines_running = 0` — cold starts ~5s on first hit.
- No automated tests around the new tier/mode branching yet — verify with the
  run card in `notes/CANONICAL-GIFT.md` (one person, own phone, no coaching)
  plus the `events` funnel on real strangers.

Notes: `notes/CONCEPT.md` (product), `notes/RESEARCH.md` (demand evidence),
`notes/SPIKE.md` (vision feasibility), `notes/CRAFT.md` (motion references),
`notes/DIGITAL-HUNT.md` (world-first roadmap + tier price test).
Competition context: Shipyard "Make Me Money" (Nov 2026) + Ship or Die.
GitHub: https://github.com/udirobert/enigmagift

Pre-commit hook (`.githooks/pre-commit`) scans staged diffs for secrets and
runs prettier on web files — enable with `git config core.hooksPath .githooks`.
The `buy.stripe.com` payment links are public by design and safe to commit.
