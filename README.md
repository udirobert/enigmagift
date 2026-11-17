# EnigmaGift

> **Hide something real. Let the photographs lead them to it.**

A gift only one person can find. The buyer photographs a place that matters,
hides something there, and the agent reads the photos — finding the details
only they would know — and builds a sealed trail of clues that leads the
recipient to what was left behind. A code in the hidden thing unlocks the
digital keepsake.

Live: **https://enigmagift.netlify.app**

## How it works

1. **Door** — drop 5–12 photos of a place (or "for me" / demo mode).
2. **Reading** — Gemini vision pass returns located observations per photo.
3. **Editor** — buyer approves/cuts the proposed clues (hallucination gate).
4. **Hide** — agent-proposed hide spots; buyer physically hides a note/object
   and writes the unlock code into it.
5. **Seal** — £19 Stripe Payment Link; on return the gift seals and issues a
   trail token + unlock code.
6. **Recipient** — `?t=<token>` opens three deduction rounds (detail →
   connection → throughline reveal), then the physical find + code unlocks
   the keepsake (throughline, place guess, letter).

## Stack

- **Frontend** — Vite + React + TypeScript, GSAP + Lenis. Six-scene state
  machine (no router): Door → Reading → Editor → Hide → Seal → Rounds →
  Reveal. Deployed to Netlify (`dist/` is the publish dir).
- **Backend** — Node + Express + SQLite (better-sqlite3-style `node:sqlite`
  via `server/db.js`), Multer uploads. Deployed to Fly.io
  (`enigmagift-api`, region `iad`, persistent volume at `/data`).
- **Vision** — Gemini API (`server/gemini.js`): per-image observation +
  cross-image synthesis. Fails over across all working key×model pairs.
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

- `GEMINI_API_KEY` — required. `GOOGLE_API_KEY` /
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
| `GET /api/trail/:token` | recipient trail (rounds, photo URLs) |
| `POST /api/trail/:token/answer` | `{round, choice}` |
| `POST /api/trail/:token/unlock` | `{code}` → keepsake |
| `GET /api/photo/:giftId/:i` | original photo by sorted index |

## Deploy

- **Frontend**: `netlify deploy --prod --build` (build command `npm run
  build`, env `VITE_STRIPE_LINK` in Netlify production context).
- **Backend**: `cd server && fly deploy`.
- Stripe return URL is configured on the Payment Link:
  `https://enigmagift.netlify.app/?paid=1&sid={CHECKOUT_SESSION_ID}`.
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
The Stripe payment link URL is public by design and safe to commit.
The `buy.stripe.com` link itself is not a secret.

Hmm wait — I added a stray line "The `buy.stripe.com` link itself is not a secret." that's awkward/redundant. Let me fix that in the file — remove it. Also double check: does db.js use node:sqlite? Let me verify quickly to keep docs accurate.<|end_message|><|message_model|>exec<|content_invoke_tool_json|>{