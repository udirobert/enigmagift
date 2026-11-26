# API surface and security contract

**Status:** canonical technical contract · **Last reviewed:** 2026-11-26

Canonical reference for the paid gift API and the experimental tabletop/photo
pilots. Operational smoke commands live in [OPS.md](OPS.md); historical
deployment evidence lives in [OPS-LOG.md](OPS-LOG.md). This document describes
the contract, not the runbook.

## Core gift API

| Route | Purpose |
|---|---|
| `GET /api/health` | liveness |
| `POST /api/gifts` | multipart `photos` (1–12, field name `photos`) + `direction` + `mode` (`digital`\|`physical`) + `tier` (`trail`\|`hide`\|`set`) + optional `packId` + optional `ref` → `{giftId}`. Rate-limited per IP. Unknown, expired, revoked, or scheduled refs are ignored. |
| `GET /api/gifts/:id` | gift payload for the buyer/editor: clues, hide spots, throughline, rounds, mode, tier |
| `GET /api/gifts/:id/overview` | giver-dashboard payload: status, trail link, schedule, pack, referral, stats, recent events. Never includes clues, rounds, answers, or unlock hashes. Rate-limited, `no-store` |
| `PATCH /api/gifts/:id/clues` | `{keepIds, edits}` buyer approval |
| `PATCH /api/gifts/:id/letter` | `{message, signature}` save the giver's words before sealing; `409` once sealed |
| `POST /api/gifts/:id/letter-drafts` | `{notes?}` generate bounded agent draft openings from the observations; the giver still owns the final words |
| `PATCH /api/gifts/:id/tier` | `{tier: trail\|hide\|set, mode}` pre-seal tier choice/upsell; `409` once sealed/paid or when a pack-spawned hunt tries to become a Set |
| `POST /api/gifts/:id/reclue` | `{notes}` re-run the cross-image pass with buyer notes; regenerates clues/rounds, bounded pre-payment |
| `POST /api/gifts/:id/world-source` | `{index}` choose which photo becomes the 3D world; rebuilds if already built |
| `POST /api/gifts/:id/hide` | record the physical hide for the Hide tier |
| `POST /api/gifts/:id/seal` | payment/entitlement-gated (`402` until Stripe/pack entitlement exists) → `{trailToken, trailUrl, unlockCode?, expiresAt?, sendAt?, fallbackAt?}`. Optional `email` stores the buyer recovery/delivery address; future `sendAt` schedules availability (≤1 year); `expireDays` sets expiry from the scheduled open when present; Hide-tier `fallbackAt` sets the optional “open anyway” date. Idempotent: re-sealing returns the existing token/schedule. |
| `POST /api/gifts/:id/mark-paid` | fallback paid marker; verifies the Stripe session server-side when `STRIPE_API_KEY` is set and otherwise fails closed. It never trusts a client claim. |
| `POST /api/gifts/:id/revoke` | buyer revokes the recipient trail link immediately |
| `POST /api/stripe/webhook` | signed Stripe webhook — source of truth for `paid`; creates a pack on a Set payment |
| `DELETE /api/gifts/:id` | delete a draft or whole gift including recipient link, photos, files, and pack entitlement |
| `POST /api/gifts/:id/event` | first-party funnel event `{name}` |
| `POST /api/gifts/:id/intent` | record checkout intent/abandonment visibility when the Stripe tab opens |
| `GET /api/lookup` | `?email=` mails every gift owned by that address back to the address; rate-limited and does not reveal whether matching gifts exist |
| `GET /api/packs/:id` | pack status (`creditsLeft`) |
| `POST /api/packs/:id/gifts` | create another hunt from a Set pack, consuming a credit; same multipart body as `POST /api/gifts` |
| `GET /api/trail/:token` | recipient trail without the answer key; token-scoped photo URLs, world status, `requiresCode`; `404` when revoked/expired and `423 {error:'scheduled', sendAt}` before the scheduled open |
| `POST /api/trail/:token/answer` | `{round, choice}` checked server-side |
| `POST /api/trail/:token/unlock` | `{code}` → keepsake for the Hide tier; codes are stored as scrypt hashes |
| `POST /api/trail/:token/event` | recipient funnel event |
| `GET /api/trail/:token/world-status` | `{worldStatus}` for the generated world |
| `GET /api/trail/:token/world` | streams the GLB (`202` until ready) |
| `GET /api/trail/:token/portrait` | streams the optional painted portrait (`202` until ready/skipped) |
| `GET /api/trail/:token/photo/:i` | original normalized photo by sorted index, token-scoped |
| `GET /api/photo/:giftId/:i` | original normalized photo by gift id for the buyer/editor only |

Every sensitive trail route — answer, unlock, event, photo, world-status,
world, portrait — returns `404` while the trail is scheduled and not yet open.

## Payment validation

The signed webhook and `mark-paid` session verification use the same rules:

- checkout session must be `paid`;
- currency must be GBP;
- total must exactly match the tier price: Trail 499p, Hide 999p, Set 1900p;
- a £1 discount is accepted only when the gift has a recorded referral;
- a `null` tier is legacy physical inventory priced as Hide;
- unknown non-null tiers are rejected.

`POST /api/gifts/:id/mark-paid` fails closed without `STRIPE_API_KEY`; in that
configuration only the signed webhook can set `paid`.

## Security and privacy invariants

- Unlock codes are stored as scrypt hashes, never plaintext; unlock attempts
  are rate-limited per token.
- The answer key never leaves the server. `GET /api/trail/:token` strips
  `correct` from rounds and `POST /api/trail/:token/answer` checks answers
  server-side.
- Recipient assets are token-scoped. Buyer/editor assets use the gift id only
  before publication.
- Recipient links use the path form `/t/<token>` rather than a query token,
  reducing leakage through browser history and Referer behavior.
- Uploads are normalized to JPEG through sharp before anything reads them,
  stripping EXIF/XMP/GPS metadata. Undecodable uploads are rejected rather than
  stored.
- Security headers are set by both Pages and the API: CSP,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, and HSTS.
- CORS is restricted to `ALLOWED_ORIGINS`; SQL statements are parameterised.
- `POST /api/gifts` is rate-limited per IP and bounded by the global daily
  draft circuit breaker (`MAX_DRAFTS_PER_DAY`, default 200). Unsealed drafts
  older than 7 days are purged with their files.
- Funnel events are first-party only. There are no third-party trackers or
  cookies; the in-progress gift id lives in browser localStorage.

## Experimental room/photo pilot API

These routes are mounted only when `ENABLE_EXPERIMENTAL_ROUTES=true`. They are
not part of the canonical paid product contract.

| Route | Purpose |
|---|---|
| `POST /api/room-gifts` | `{edition}` + bearer management key — save an immutable tabletop gift edition → `{recipientToken}`; idempotent on the same key+edition, `409` on a different edition, `410` once revoked |
| `GET /api/room-gifts/:token` | public recipient edition (`no-store`); `404` when revoked/unknown or outside the server room/revision allowlist |
| `GET /api/room-gifts/manage` | owner view behind the management key |
| `DELETE /api/room-gifts/manage` | revoke: deletes the stored edition text and marks the link closed, repeat-safe |
| `POST /api/photo-gifts` | multipart `edition` + one JPEG photo ≤3 MiB + bearer management key → `{recipientToken}`; `409` on a different payload with the same key, `410` once revoked |
| `GET /api/photo-gifts/:token` | public edition (`no-store`, never carries the image); `404` when revoked/unknown |
| `GET /api/photo-gifts/:token/image` | normalized JPEG (`no-store`); `404` when revoked/unknown |
| `GET /api/photo-gifts/manage` | owner view behind the management key |
| `DELETE /api/photo-gifts/manage` | revoke; removes edition and image atomically |

Room/photo pilot links have no accounts, checkout, email, or automatic
delivery. The management key is a 64-hex bearer in the private `#manage=` URL;
only its SHA-256 hash is stored. Creation is rate-limited through the
Cloudflare Worker's signed pseudonymous client bucket; unsigned or forged
requests share the direct-connection bucket. No IP or visitor id is persisted.

## API-only behavior not exposed in the main client

The current frontend does not forward `ref` or `sendAt`. `sendAt` schedules
link availability only; it does not render a recipient countdown. Referral
promotions must be configured separately in Stripe, and discounted payment is
accepted only when the gift carries a recorded `ref`.

## Verification

Run the local regression suites before changing this contract:

```bash
npm test
cd server && npm test
```

The server security suite uses a temporary database and mocked providers; it
does not require credentials or make paid provider calls.
