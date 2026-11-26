# EnigmaGift

**Canonical recipient example:** [Someone saved you a seat](https://saved-you-a-seat--enigmagift.netlify.app/) — [live baseline and next design iteration](notes/CANONICAL-GIFT.md).

**Roadmap (not shipped):** [Immersive world-first memory hunt](notes/DIGITAL-HUNT.md). The flow below describes the shipped trail-first product. Local prototypes: `/studio/room` (2D memory map), `/studio/world` (stereo shelf explorer) and `/studio/marble` (world authoring tool) in `npm run dev`. `/?miniature=1` opens **the room in the fold**, an authored sample reveal: a photograph unfolds while the Meshy-built miniature (`public/world-meshy.glb`) rises out of it, with scrub, replay and orbit.

> **Let the photographs lead them to it.**

Turn photographs of a place you share into a short trail of clues and a
digital keepsake. The buyer photographs a place that matters, and the agent
reads the photos — finding the details only they would know — and builds a
sealed trail of clues that leads the recipient to the keepsake.
**The default gift is fully digital** (The Trail, £4.99): three deduction
rounds open the keepsake directly — no physical errand, any distance, sent
as a link. **The Hide** (£9.99) adds the physical beat: the buyer hides
something at the place and writes an unlock code into it. **The Set** (£19)
is three hunts total — this purchase plus two further hunts — for different people or occasions.

Live: **https://enigmagift.pages.dev**

## Tiers

| Tier | Price | Mode | What the giver does | Recipient flow |
|---|---|---|---|---|
| **The Trail** (default) | £4.99 | digital | upload 1–12 photos, approve the clues, seal & send | `?t=` → 3 rounds → keepsake opens directly (no code) |
| **The Hide** | £9.99 | physical | everything in The Trail, plus physically hide a thing at the place and write the code into it | 3 rounds → find the thing → enter code → keepsake |
| **The Set** | £19 | pack of 3 total | buy once, create this hunt plus 2 further hunts (each Trail or Hide), each with its own recipient link | one link per hunt |

One send = one published recipient link; previews and re-sending the same link
are free. The recipient is never charged. The same exploration, rounds and
guaranteed reveal apply at every price. Recommend the cheaper tier when that
is all someone needs (the set saves £10.97 against three Hides).

## How it works

0. **Watch it** — an auto-playing showcase of a real gift's recipient side
   (the sales pitch before the ask).
1. **Door** — pick a tier, choose photos of a place (or "for me" / demo
   mode). The selection accumulates across picks and drops — up to 12,
   deduplicated, minimum 1 — and nothing is uploaded until the buyer
   confirms consent and presses "Build my trail"; "Clear selection" resets
   it. Copy adapts to direction and tier: "for me" reframes the lede, and
   the digital tiers say there is a link to send, not a thing to hide.
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
   The Hide; The Set also creates a 2-credit pack (three hunts total including this one). Mid-flow upsell: on a
   live, unsealed Trail the pay block offers "add the physical ending
   (+£5)", which switches the order summary to The Hide and persists via
   `PATCH /api/gifts/:id/tier` (409 once sealed/paid — tier is locked then).
6. **Recipient** — `?t=<token>` opens three deduction rounds (detail →
   connection → throughline reveal), then either the keepsake directly
   (Trail: `requiresCode=false`) or the code gate (Hide). The reveal also
   shows the **3D world of the place** — built from one of the buyer's photos
   (fal.ai queued TRELLIS.2, `server/world.js`) at seal time — which the
   recipient can orbit and keep (`download` a `.glb`), plus the painted
   keepsake portrait when Recraft is configured. The reveal ends with a
   quiet virality CTA — "loved this? make one for someone you love →" —
   and the copyable note-back to the giver includes the site origin, so
   recipients become the next givers.

Scene order in code: WatchIt → Door → Reading → Editor → [Hide] → Seal →
R1 → R2 → R3 → Reveal (state machine in `src/App.tsx`, no router; the Hide
scene is skipped for digital gifts).

**Giver dashboard** — `/?g=<giftId>` (linked from the Seal's manage row) is
the owner view: live recipient link + copy + QR, status pill, recipient
progress derived from funnel events (opens, per-round picks, unlock,
note-back), the humanized event feed, pack credits for The Set, and manage
actions (revoke / delete / what's stored). The gift id is the bearer
capability — the `?g=` query is stripped from the URL on load so it never
lingers in history or leaks via Referer. Polls with backoff (6s→30s) so a
giver watching live sees rounds land. Unsealed drafts get a
"continue building" button that resumes the builder via `/?resume=1`.

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
- **World** — `server/world.js`: fal.ai's queued TRELLIS.2 API turns the
  buyer-chosen photo (default: the one the throughline points at, picked by
  `pickWorldSource` in the pipeline; changeable in the editor via
  `POST /api/gifts/:id/world-source`) into an orbitable 3D world (GLB) at
  seal time, saved to the gift's volume. The recipient orbits it in the
  reveal — it assembles out of the flat photo — and keeps a copy. Provider
  input/output media is short-lived and deleted after the run.
- **Payments** — Stripe Payment Links (live, GBP, one-time) per tier on the
  "EnigmaGift" Stripe account, plus a signed webhook
  (`POST /api/stripe/webhook`) that is the source of truth for `paid`.
  `VITE_STRIPE_LINK_TRAIL` / `_HIDE` / `_SET` are baked at build time;
  the canonical production mapping is encoded in `npm run build:pages`.
- **Analytics** — privacy-respecting funnel events (`events` table):
  `POST /api/gifts/:id/event`, `POST /api/trail/:token/event`. Recipient
  quality signals include round dwell/picks, reveal completion, letter read,
  world load/failure, note-back and bounded client errors. No third-party trackers.

## Development

```bash
npm install
npm run dev          # frontend on :5173, proxies /api → :8787
npm run dev -- --host 127.0.0.1 --port 4297 --strictPort   # or pinned port

# the tabletop experiment (see dog-gift-tabletop/README.md; ?make=1 is a
# local author shortcut)
./node_modules/.bin/vite dog-gift-tabletop --host 127.0.0.1 --port 4296 --strictPort

cd server
npm install
npm run dev          # API on :8787 (node --watch)
```

Env (backend, `server/.env` or Fly secrets):

- `SANDBASE_API_KEY` — primary vision provider (local copy in
  `server/sandbase.env`, gitignored; set on Fly via `fly secrets set`).
- `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` — first privacy-conscious
  Workers AI vision fallback (`server/cloudflare.env`, gitignored). Uses
  Mistral Small first and Qwen as a second Cloudflare candidate; both are
  zero-data-retention models. The token needs only account-scoped Workers AI
  Read access.
- `GROQ_API_KEY` — fast secondary privacy-conscious vision fallback using
  Qwen (`server/groq.env`, gitignored). The free tier is rate-limited,
  especially on output tokens, so it is a fallback rather than the sole
  provider.
- `VISION_PROVIDERS` — optional comma-separated provider allowlist
  (`sandbase,groq,cloudflare,gemini`) for controlled benchmarks or incident
  response. Leave unset in normal production.
- `FAL_KEY` — world-generation provider (local copy in `server/fal.env`,
  gitignored). Use a scoped key limited to TRELLIS.2 execution plus the
  upload/request permissions needed to submit and poll it.
- `RECRAFT_API_KEY` — optional; paints the seal-time keepsake "portrait of
  the place" (`server/portrait.js`, Recraft `imageToImage` — bills API
  units, not subscription credits). Without it the portrait is skipped.
  `RECRAFT_STYLE_ID` / `RECRAFT_MODEL` override the keepsake style/model.
- `GEMINI_API_KEY` — final fallback provider; `GOOGLE_API_KEY` /
  `GOOGLE_GENERATIVE_AI_API_KEY` are also picked up as extra quota pools.
- `STRIPE_WEBHOOK_SECRET` — verifies `POST /api/stripe/webhook` signatures.
- `STRIPE_API_KEY` — optional secret key; lets `mark-paid` verify the
  checkout session server-side instead of trusting the client.
- `ALLOWED_ORIGINS` — comma-separated CORS allowlist (defaults to the
  deployed Pages/Netlify domains + localhost).
- `DB_PATH`, `UPLOADS_DIR` — default to `server/enigmagift.db` and
  `server/uploads` locally, `/data/*` on Fly.
- `RESEND_API_KEY` — transactional email (Phase 1b): the gift link at seal,
  scheduled-morning delivery, and `/api/lookup` recovery. Without it, sends
  are logged to the server console (dev mode). Verify your sending domain in
  Resend before production use.
- `MAIL_FROM` — from-address for the above (default
  `EnigmaGift <gifts@enigmagift.pages.dev>`; set a real domain in production).
- `APP_ORIGIN` — absolute origin used in email links (default
  `https://enigmagift.pages.dev`). Recovery page lives at `/find.html`.
- `ALLOW_UNPAID_SEAL` — exact `true` enables deliberately free demo deployments;
  unset/false in production. Payment or pack entitlement is otherwise required
  before sealing, delivery, recipient access, world generation or portrait generation.
- `ENABLE_EXPERIMENTAL_ROUTES` — exact `true` mounts the tabletop/photo-gift pilot
  routes; unset/false for the canonical paid product.
- `MAX_DRAFTS_PER_DAY` — global draft-cost circuit breaker (default 200), in
  addition to the per-IP draft limit.

Optional local sandbox for browser testing: `DAYTONA_API_KEY` may live in a
gitignored root `.env.local` (never a `VITE_` prefix — it must not reach the
bundle; `server/.env` stays the backend's own file). Nothing loads it
automatically in an arbitrary shell — `node --env-file=.env.local` reads it.
A Daytona macOS sandbox requires a 24h reservation and creation can auto-reserve;
consult the current Daytona catalog, not pinned prices.

Frontend env (build-time):

- `VITE_STRIPE_LINK_TRAIL` / `VITE_STRIPE_LINK_HIDE` / `VITE_STRIPE_LINK_SET` —
  the three Payment Link URLs (legacy single `VITE_STRIPE_LINK` still works and
  maps to the Hide link). Build-time only — use `npm run build:pages` for the
  canonical production mapping; Pages/Netlify runtime env vars do NOT reach a
  prebuilt Vite bundle.
- `VITE_API_URL` — optional; defaults to same-origin `/api`.

## API

| Route | Purpose |
|---|---|
| `GET /api/health` | liveness |
| `POST /api/gifts` | multipart `photos` (1–12, field name `photos`) + `direction` + `mode` (`digital`\|`physical`) + `tier` (`trail`\|`hide`\|`set`) + optional `packId` + optional `ref` (a source trail token for referral attribution; unknown/expired/revoked/scheduled refs are ignored) → `{giftId}`. Rate-limited per IP |
| `GET /api/gifts/:id` | gift payload (clues, hideSpots, throughline, rounds, mode, tier) |
| `GET /api/gifts/:id/overview` | giver-dashboard payload: status, trail link (incl. `sendAt`/`scheduled`), pack, `referredBy`, stats derived from events, recent events. **Never includes clues/rounds/answers/unlock hashes.** Rate-limited, `no-store` |
| `PATCH /api/gifts/:id/clues` | `{keepIds, edits}` buyer approval |
| `PATCH /api/gifts/:id/tier` | `{tier: trail\|hide\|set, mode}` — tier choice/upsell pre-seal; `409` once sealed/paid, `400` for other tiers |
| `POST /api/gifts/:id/reclue` | `{notes}` — re-run the cross-image pass with buyer notes; regenerates clues/rounds (bounded to 2 pre-payment) |
| `POST /api/gifts/:id/world-source` | `{index}` — pick which photo becomes the 3D world; rebuilds if already built |
| `POST /api/gifts/:id/hide` | record the physical hide (Hide tier) |
| `POST /api/gifts/:id/seal` | payment/entitlement-gated (`402` until Stripe/pack entitlement exists) → `{trailToken, trailUrl, unlockCode?, expiresAt?, sendAt?}`; optional `{sendAt}` schedules availability (future, ≤1 year — enforced at read time) and optional `{expireDays}` sets link expiry, counted from the scheduled open when one is set (code only for Hide). Idempotent: re-sealing returns the existing token/sendAt |
| `POST /api/gifts/:id/mark-paid` | fallback paid-marker; verifies the Stripe session server-side when `STRIPE_API_KEY` is set — **fails closed otherwise** (never trusts the client; only the webhook sets `paid`) |
| `POST /api/gifts/:id/revoke` | buyer revokes the recipient trail link (token stops resolving immediately) |
| `POST /api/stripe/webhook` | signed Stripe webhook — the source of truth for `paid`; creates a pack on a Set payment |
| `DELETE /api/gifts/:id` | giver deletes a draft (pre-seal) or a whole gift incl. its recipient link, photos and pack |
| `POST /api/gifts/:id/event` | funnel event `{name}` |
| `GET /api/packs/:id` | pack status (`creditsLeft`) |
| `POST /api/packs/:id/gifts` | create another hunt from a Set pack (consumes a credit; same multipart body as `POST /api/gifts`) |
| `GET /api/trail/:token` | recipient trail (rounds **without the answer key**, token-scoped photo URLs, world status, `requiresCode`); 404 when revoked or expired; **423 `{error:'scheduled', sendAt}` while pending**, and every sensitive trail route (answer/unlock/event/photo/world-status/world/portrait) returns 404 until it opens |
| `POST /api/trail/:token/answer` | `{round, choice}` |
| `POST /api/trail/:token/unlock` | `{code}` → keepsake (Hide tier; codes stored as scrypt hashes) |
| `POST /api/trail/:token/event` | recipient funnel event |
| `GET /api/trail/:token/world-status` | `{worldStatus}` — the 3D world build state |
| `GET /api/trail/:token/world` | streams the place's GLB (202 until ready) |
| `GET /api/trail/:token/portrait` | streams the painted keepsake portrait (202 until ready/skipped) |
| `GET /api/trail/:token/photo/:i` | original photo by sorted index, **token-scoped** |
| `GET /api/photo/:giftId/:i` | original photo by gift id (buyer/editor side only) |
| `POST /api/room-gifts` *(experimental, only when `ENABLE_EXPERIMENTAL_ROUTES=true`)* | `{edition}` + `Authorization: Bearer <key>` — save an immutable tabletop gift edition → `{recipientToken}`; idempotent on the same key+edition, `409` on a different edition, `410` once revoked |
| `GET /api/room-gifts/:token` *(experimental)* | public recipient edition (`no-store`); `404` when revoked/unknown or the room/revision is not in the server allowlist |
| `GET /api/room-gifts/manage` *(experimental)* | owner view (`recipientToken`, `revoked`, `edition`) behind the management key |
| `DELETE /api/room-gifts/manage` *(experimental)* | revoke: deletes the stored edition text and marks the link closed (repeat-safe) |
| `POST /api/photo-gifts` *(experimental)* | multipart `edition` + `photo` (JPEG ≤ 3 MiB) + `Authorization: Bearer <key>` — one immutable photo gift → `{recipientToken}`; `409` on a different payload with the same key, `410` once revoked |
| `GET /api/photo-gifts/:token` *(experimental)* | public edition (`no-store`, never carries the image); `404` when revoked/unknown |
| `GET /api/photo-gifts/:token/image` *(experimental)* | the normalized JPEG (`no-store`); `404` when revoked/unknown |
| `GET`/`DELETE /api/photo-gifts/manage` *(experimental)* | owner view / revoke — removes edition and image atomically |

Room-gift links are a pilot feature: no accounts — the sender's management
key is a 64-hex bearer in the private `#manage=` URL and only its SHA-256
hash is stored; revocation removes the message from the stored edition. The approved
room/revision allowlist lives in `server/room-gifts.js` (currently only the
dog-dining-room sample), create is rate-limited to 10 new links per visitor
per hour: the Cloudflare Worker signs a pseudonymous HMAC id for the real
client IP (`ROOM_PROXY_SECRET`), which the API verifies in constant time
(`verified-client` bucket); unsigned or forged requests — including all
direct/legacy API traffic — share a per-connection-IP bucket (`trust proxy`
is not enabled, so forwarded IPs are never honoured). A shared household or
NAT can still share a visitor bucket; no IP or visitor id is persisted —
only a bounded in-memory rate map. There is no email, checkout or automatic
delivery — the giver copies the link and sends it themselves.

Photo-gift links follow the same pilot model but use **one** of the
sender's own photos (the paid trail accepts 1–12): the photo is
normalized server-side to a JPEG and stored next to the note, and revoke
removes both at once. The ready screen offers "See what they see"
(play the saved gift) and "Make changes" — saved links are immutable,
so changes always copy into the editor and "Save changes" mints a new
link without touching the original. See `notes/PHOTO-HUNT.md`.

API-only behaviors not surfaced in the current client: the frontend does not
forward `ref` or `sendAt`; `sendAt` schedules the link's availability only —
there is no email or automatic delivery worker, and the recipient UI does not
render a countdown. Referral promotions must be configured separately in
Stripe; the discounted amount is accepted only when the gift carries a
recorded `ref`.

**Payment validation** is identical at both entry points (signed webhook and
`mark-paid` session verification): the session must be `paid`, in GBP, and
total exactly the tier's price — trail 499p, hide 999p, set 1900p — or £1
less only when the gift has a recorded referral. A `null` tier is a legacy
physical gift priced as Hide (999p); unknown non-null tiers are rejected.

## Deploy

Full runbook: `notes/OPS.md` (topology, secrets, redeploy, gotchas).

- **Frontend**: Cloudflare Pages project `enigmagift`
  (`enigmagift.pages.dev`). Use `npm run deploy:pages` (or `npm run build:pages`
  plus `npm run verify:pages-build` before a manual wrangler deploy). The
  verifier proves the live payment links are inlined and the first HTML does
  not preload the heavy world stack. `/api/*` is proxied to Fly by
  the Pages Function `functions/api/[[path]].js` (Pages `_redirects`
  cannot proxy external domains). Netlify remains as a legacy mirror.
- **Backend**: `cd server && fly deploy`.
- **Tabletop pilot**: Cloudflare Worker `enigmagift-room`, live at
  `https://enigmagift-room.trustfall.workers.dev` — personal photo hunts
  start at `…/?photo=1` (plain `?make=1` also lands there; the
  sample-room editor stays at `…/?make=1&sample=1`). `npm run deploy:room`
  builds `dog-gift-tabletop/dist` and deploys
  `dog-gift-tabletop/wrangler.jsonc`; deploy the Fly API first.
- Each Payment Link's success URL is
  `https://enigmagift.pages.dev/?paid=1&sid={CHECKOUT_SESSION_ID}`.
  The gift ID survives the new-tab checkout via `localStorage`
  (`enigmagift.gift.v1`), so `?paid=1` resumes at the Seal scene.
- The Stripe webhook endpoint (`POST https://enigmagift-api.fly.dev/api/stripe/webhook`,
  events: `checkout.session.completed`) must be configured in the dashboard with
  `STRIPE_WEBHOOK_SECRET`.

## Data handling & security

Public pages: `/privacy` and `/terms` (`public/privacy.html`, `public/terms.html`).

- Unlock codes are stored as **scrypt hashes** (`trails.unlock_hash`), never plaintext;
  unlock attempts are rate-limited per token (10/h).
- The **answer key never leaves the server** — `GET /api/trail/:token` strips
  `correct` from rounds; `POST /api/trail/:token/answer` checks it server-side.
- Recipient assets are **token-scoped** (`/api/trail/:token/photo|world|portrait`);
  the gift-id-scoped photo route is for the buyer only. Trail links can be
  **revoked** (`POST /api/gifts/:id/revoke`) or set to **expire** (`expireDays`
  on seal); the recipient URL is the path form `/t/<token>` (kept out of query
  strings, which leak via Referer/history).
- `POST /api/gifts/:id/mark-paid` **fails closed** without `STRIPE_API_KEY` —
  only the signed Stripe webhook sets `paid` (HMAC + per-tier amount check).
- **Uploads are normalized to JPEG server-side through sharp before anything reads them**, stripping EXIF/XMP/GPS metadata regardless of accepted source format. Safari 17+ can also decode HEIC in the browser, so HEIC is re-encoded client-side there; unsupported undecodable uploads are rejected rather than stored. Upload consent is required in the UI before any photo is sent.
- Photos are processed by the AI providers listed in `/privacy` (SandBase,
  Google Gemini fallback, fal.ai, Recraft) solely to generate the gift. No third-party
  trackers; funnel events are first-party only. No cookies — the in-progress
  gift id lives in localStorage on the buyer's device.
- Security headers everywhere: CSP, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS — set both by
  `public/_headers` (Pages) and in `server/index.js` (API/SPA origin).
- CORS is restricted to `ALLOWED_ORIGINS`; all SQL is parameterised.
- `POST /api/gifts` is rate-limited per IP and bounded by a global daily draft circuit breaker (`MAX_DRAFTS_PER_DAY`, default 200); other state-changing routes keep their own bounded limits; unsealed
  drafts older than 7 days are purged (files included) on a timer.
- The giver can `DELETE /api/gifts/:id` (draft or whole gift + link + photos)
  and revoke the recipient link at any time.
- Photo-gift browser suite (Kane CLI): `spec/` holds the requirements and
  fixtures; `.testmuai/tests/` the assurance-designed `_test.md` suite.
  `npm run deploy:room` refuses to deploy unless `npm run verify:room` passes
  — the gate replays the suite against the build about to ship and writes an
  agent-readable failure digest. See `spec/README.md`; the 2026 KaneCLI
  Online Hackathon eligibility/evidence snapshot is in
  `notes/KANECLI-HACKATHON.md`.
- Security regression tests: `cd server && npm test`
  (webhook signature + payment-amount matrix, fail-closed mark-paid,
  answer-key stripping, unlock rate limit, revoke/expiry, scheduled
  availability, referral attribution, upload normalization, headers). Requires Node
  ≥22.15 (`module.registerHooks`); runs against a temporary DB and mocked
  pipeline/world/portrait providers with external HTTP disabled — no paid
  provider calls, no credentials needed.
- Root verification: `npm test` runs the bundled shelf assertions plus scene smoke render; `npm run smoke:scenes` runs the scene pass alone — bundles each scene with
  esbuild and renders every demo/live state (editor review card, door tiers,
  seal incl. pack-owned gifts) to catch a broken scene before a deploy.

## The giver's letter (Phase 1a)

The gift carries the giver's own words: `gifts.message` + `signature`
(written in a calm scene after the clues, with three agent drafts offered
from the observations — the AI never writes the final voice). The reveal
renders the giver's words, never a template; older gifts with no letter keep
the historical fallback. The Hide tier receives the letter only on unlock,
so the physical ending still means something.

## Delivery, scheduling and recovery (Phase 1b)

- The buyer's email is captured at the till ("where should we send the
  link?"), transactional only, deleted with the gift. The link email fires at
  seal, on the Stripe webhook (the lost-tab path), and from a 10-minute
  sweep that also delivers scheduled gifts on their morning and retries
  failures. Idempotent via `gifts.email_sent_at`.
- Optional open date: `sendAt` on seal — the link exists but opens on the
  scheduled morning (enforced at read time), and the email arrives then.
- Recovery: `GET /api/lookup?email=` mails back every gift owned by that
  address (rate-limited, no existence leak); the no-build page at
  `/find.html` is the entry point. No accounts, no passwords.
- Checkout intent: `POST /api/gifts/:id/intent` records payment attempts
  (abandonment visibility); `gifts.checkout_intent` stores the last one.
- Hide fallback: an optional "open anyway on ⟨date⟩" (`trails.fallback_at`)
  means a hidden-thing errand that slips can't dead-end a £9.99 gift — after
  the date the keepsake opens without the code (`viaFallback` logged).

## The trail pays out (Phase 2)

A correct look releases one paragraph of the giver's letter (rounds 1–2;
round 3 releases the rest) with a "keep going" beat; misses label the actual
crop ("this is what's there — look again") instead of a nudge string; after
three misses there is no auto-advance — an "open it anyway" button keeps the
choice with the recipient. Events: `round_N_payout`, `unlocked{viaFallback}`.

## Lowered floor (Phase 3)

One photo is enough (1–12 accepted; short trails degrade honestly — fewer
rounds, round counter reads the real total). The editor opens on a review
card ("looks right" / "something's not quite right?"), with the authoring
grid and world-source picker behind "look closer". Tier selection lives at
the till: the door ships one default with "other ways to give" behind an
expander, and the Seal's order summary carries trail ↔ hide (a Set is minted
at creation and can't be switched at the till). Scenes live in
`history.pushState`, so browser Back returns to the previous scene. The dock
suggests the five shots that read best (door / sign / seat / view / detail).

## Known gaps (pre-launch hardening)

- HEIC depends on browser decode support (Safari 17+/iOS); if the browser
  cannot decode it, the server rejects it rather than storing metadata-bearing
  bytes. A WASM HEIC decoder would widen coverage but adds significant bundle
  cost and should only be added after measuring real upload failures.
- `mark-paid` server-side verification still needs a restricted Stripe API key
  (`STRIPE_API_KEY`) — until then the webhook alone sets `paid` (fail closed).
- Fly `min_machines_running = 0` — cold starts ~5s on first hit.
- Backups are scripted (`server/scripts/backup-volume.mjs` plus
  `scripts/pull-backup.sh` for the off-volume copy) but still depend on the
  weekly operator routine; continuous off-volume backup (for example
  Litestream to object storage) is not configured yet.
- Uncoached recipient research (Phase 0 in `notes/PLAN.md`) has still not
  been run — it gates every remaining decision (Set fate, print product,
  price test, the world-first roadmap).

Notes: `notes/CONCEPT.md` (product), `notes/RESEARCH.md` (demand evidence),
`notes/SPIKE.md` (vision feasibility), `notes/CRAFT.md` (motion references),
`notes/DIGITAL-HUNT.md` (world-first roadmap + tier price test),
`notes/PLAN.md` (the sequencing plan: what shipped, what's gated on
observation, kill criteria and owner decisions).
Competition context: Shipyard "Make Me Money" (Nov 2026) + Ship or Die.
GitHub: https://github.com/udirobert/enigmagift

Pre-commit hook (`.githooks/pre-commit`) scans staged diffs for secrets and
runs prettier on web files — enable with `git config core.hooksPath .githooks`.
The `buy.stripe.com` payment links are public by design and safe to commit.
