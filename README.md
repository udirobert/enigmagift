# EnigmaGift

> **Let the photographs lead them to it.**

Live: **https://enigmagift.pages.dev**
Canonical recipient example: [Someone saved you a seat](https://saved-you-a-seat--enigmagift.netlify.app/)

EnigmaGift turns photographs of a meaningful place into a small treasure hunt
and a personal digital keepsake. A giver chooses 1–12 photos; the product reads
the place for details only they would notice, proposes a short trail of clues,
and lets the giver approve or correct everything before paying. The recipient
opens a link, works through the clues, and reaches the giver's own words plus a
navigable 3D memory of the place.

The recipient never pays, signs up, or installs anything.

## Tiers

| Tier | Price | Shape |
|---|---:|---|
| **The Trail** | £4.99 | Fully digital: three deduction rounds open the keepsake directly. |
| **The Hide** | £9.99 | The digital trail, plus a physical object or note hidden at the place and a code entry before the keepsake. |
| **The Set** | £19 | Three hunts total: the purchase hunt plus two further credits, each with its own recipient link. |

Previews and re-sending the same link are free. One payment creates one
published recipient link; Set credits create additional links.

## How it works

1. **Choose the place** — the giver selects or photographs 1–12 images.
2. **Read the photos** — the vision pipeline produces located observations and
   candidate clues; the giver watches the read arrive progressively.
3. **Approve the trail** — the giver can accept the proposed clues, edit them,
   remove weak ones, add notes, or choose which photo becomes the 3D world.
4. **Seal and send** — Stripe payment creates the recipient link. The Hide tier
   also records the physical ending and unlock code.
5. **Recipient plays** — deduction rounds reveal the place gradually, with the
   giver's letter paid out along the way.
6. **Keep the memory** — the final reveal contains the giver's words, an
   orbitable GLB world generated from the chosen photo, and an optional painted
   keepsake portrait.

## Product status

The core trail-first product is live, payment-hardened, and instrumented, but
it is still a pre-launch pilot. The next product gate is uncoached human
recipient research, not more feature work. Operational gaps and launch
boundaries are tracked in [notes/PLAN.md](notes/PLAN.md) and
[notes/OPS.md](notes/OPS.md).

## Architecture at a glance

- **Frontend:** Vite + React + TypeScript, deployed to Cloudflare Pages.
- **Backend:** Node + Express + SQLite (`node:sqlite`) on Fly.io, with uploads
  and the database on a persistent volume.
- **Vision:** `server/gemini.js` (historical name) fails over across SandBase,
  Cloudflare Workers AI (Mistral then Qwen), Groq, and finally Google Gemini.
- **World:** `server/world.js` uses fal.ai's queued TRELLIS.2 API to turn one
  approved photo into a GLB at seal time.
- **Portrait:** `server/portrait.js` optionally uses Recraft for the painted
  keepsake portrait.
- **Payments:** Stripe Payment Links plus a signed webhook; the webhook is the
  source of truth for payment.
- **Privacy:** uploads are normalized to JPEG server-side, stripping EXIF/XMP/GPS
  metadata before provider processing. Public policy pages live at `/privacy`
  and `/terms`.

Detailed endpoints, security invariants, secrets, deployment commands, and
provider evidence live in the notes rather than being duplicated here.

## Develop

```bash
npm install
npm run dev              # frontend on :5173, proxies /api to :8787

cd server
npm install
npm run dev              # API on :8787
```

Provider keys and runtime flags are documented in
[notes/OPS.md](notes/OPS.md); example variable names are in
[server/.env.example](server/.env.example). Secret values belong only in Fly
secrets or gitignored local env files.

## Verify

```bash
npm test                         # frontend/unit scene smoke tests
npm run build:pages              # production frontend build
npm run verify:pages-build       # payment-link and bundle checks

cd server
npm test                         # API security regression suite
```

Deployment is intentionally not a README shortcut: follow
[notes/OPS.md](notes/OPS.md), which records the required verification order,
live topology, provider state, rollback notes, and operational evidence.

## Documentation map

- [notes/CONCEPT.md](notes/CONCEPT.md) — product concept and experience
  principles.
- [notes/PLAN.md](notes/PLAN.md) — current sequencing, evidence gates, kill
  criteria, and owner decisions.
- [notes/RESEARCH.md](notes/RESEARCH.md) — demand and behavioral research log.
- [notes/API.md](notes/API.md) — API surface and security contract.
- [notes/OPS.md](notes/OPS.md) — operational runbook, secrets topology,
  deployment, provider configuration, incidents, and validation evidence.
- [notes/SPIKE.md](notes/SPIKE.md) — completed historical vision-feasibility
  spike; superseded by the provider evidence in OPS.
- [notes/CANONICAL-GIFT.md](notes/CANONICAL-GIFT.md) — canonical recipient
  example and what to test first.
- [notes/DIGITAL-HUNT.md](notes/DIGITAL-HUNT.md) — proposed world-first future
  direction, explicitly not the shipped baseline.
- [notes/PHOTO-HUNT.md](notes/PHOTO-HUNT.md) — experimental personal-photo
  hunt pilot.
- [notes/ONBOARDING.md](notes/ONBOARDING.md),
  [notes/MOTION.md](notes/MOTION.md), and [notes/CRAFT.md](notes/CRAFT.md) —
  interaction, motion, and visual craft references.

GitHub: https://github.com/udirobert/enigmagift

Pre-commit hook (`.githooks/pre-commit`) scans staged diffs for secrets and
formats web files; enable it with `git config core.hooksPath .githooks`.
