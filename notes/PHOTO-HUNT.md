# Personal-photo hunts

## Decision and user evidence

The creator reports that people are unlikely to share the sample room, want
their own photos, cannot reliably reach crafting controls with the phone
keyboard open, and do not understand whether “Tuck it away” gives them a real
choice of hiding place. The treasure hunt is part of the gift, not just
decoration around its message.

The creator explicitly selected **Photo hunt first** when asked whether the
first personal-photo experience must be an explorable generated 3D room.
Implement a real, shareable hunt directly in their photo. The existing 3D
room remains an explicitly labelled sample. Do not send personal photos to
an AI provider or introduce checkout for this free pilot.

The immediately preceding fixes are source `cf498a4`, published as Worker
`7febf89f-d567-4994-a423-d04a6c0b0a67`. They clear contextual hints when
players move on, preserve return navigation, fit the sample composer to
`visualViewport`, keep starters beside navigation, and rename saving to
“Create gift link.” Local browser checks cover real 3D interaction and
emulated constrained viewports; native phone keyboards remain unverified.

## The experience to build

Use the giver's photo as the main object throughout creation. Keep instructions
to the current action, with visible Back/edit controls and a stable action
area above the keyboard. Keep native zoom enabled and text inputs at least
16 CSS pixels.

1. **Choose a photo.** “Hide a little something in a place they know.”
   Primary: “Use your photo.” One image is enough. “Try the sample room”
   is a secondary link. Decode and display locally before any upload.
2. **Choose the hiding place.** Tap the photo to place a small folded note.
   Show exactly where it will be found. “Hide here” confirms that point;
   tapping elsewhere moves it. Provide keyboard adjustment with arrow keys
   and a visible reset/centre action; placement must not require dragging.
3. **Give them a clue.** One optional, editable clue, up to 200 characters.
   “Where our Saturday mornings begin…” is a placeholder, not saved content.
   “Skip the clue” is explicit; an unclued hunt uses neutral search guidance
   and still offers recipient hints. Avoid another occasion/relationship quiz.
4. **Write what they will find.** A paper surface with To, the note, and From.
   Names are limited to 40 characters each; this new format allows a
   600-character message, preserving paragraphs. Keep the distinction between
   the clue and the hidden message clear.
5. **Try and share.** Show the actual hiding place on the giver's review.
   “Move the note,” “Edit clue,” and “Edit note” go directly to those tasks.
   “Try the hunt” hides author markers and uses the same recipient player.
   “Create gift link” is the only publication action. Preview may show an
   unfinished note as an explicitly labelled draft; saving requires real
   names and message.

Replacing the photo preserves the giver's words but clears the old location,
requiring a new choice. Remind them to check that their clue still fits.
Unsupported files must leave the existing draft intact.

## Recipient behavior

Show the actual photograph and the giver's clue. A tap near the saved point
discovers the folded note; “Open the note” reveals the message. The location
is not randomly chosen or ignored by the player.

Use a forgiving hit area: radius is the greater of 22 CSS pixels and 10% of
the rendered photo's shorter dimension. Store the centre as normalized
coordinates and use an uncropped image so placement survives device sizes.
Misses acknowledge the tap without penalties or lockouts.

“A little hint” first indicates the containing third of the photo; a further
“Show the note” reveals its exact marker. “Open without searching” remains
available. Keyboard users can search the nine named regions of the photo.
Do not require exact pixel selection or colour perception to finish.

After discovery, old search guidance disappears. “Back to photo” retains the
found note; “Replay hunt” explicitly starts over. The note remains readable
and scrollable, and “Copy note” helps the recipient keep its words.

## Technical scope

Keep the legacy `#gift=` and `#manage=` sample links working. Introduce a
small bootstrap entry that chooses the photo app for `?photo=1`, and for
`?make=1` when there is no saved-link fragment, recipient-preview flag, or
`sample=1`. Existing sample creation stays at `?make=1&sample=1`.
New public links use `?photo=1#gift=<token>`; private controls use
`?photo=1#manage=<key>`. No key goes into a recipient link or share payload.

Use separate modules for the photo data model, creator/player, browser draft
storage, and API/sharing. Reuse the established stationery palette and
typefaces. Do not migrate the existing sample edition or change its
calibrated 3D geometry.

The new edition is exactly:

```ts
interface PhotoEdition {
  version: 1;
  to: string;       // trimmed, required, 1–40
  from: string;     // trimmed, required, 1–40
  message: string;  // trimmed, required, 1–600; preserve internal newlines
  clue: string;    // trimmed, optional, 0–200
  hidingSpot: { x: number; y: number }; // finite normalized coordinates, 0–1
}
```

Prepare one JPEG locally: preserve orientation and aspect ratio, longest
side at most 1600 pixels, white behind transparency. Always re-encode;
do not upload the original file or metadata. Accept JPEG, PNG, WebP, and
HEIC/HEIF only when the browser can decode them; reject SVG and unsupported
images clearly. Retain the old draft until a replacement has decoded.
Maximum original selection is 20 MiB; maximum prepared image is 2 MiB.

The server must independently decode and normalize the image with
`sharp@0.35.5` (npm reports Node >=20.9.0; the server uses Node's built-in
SQLite). Accept only a valid JPEG multipart upload, limit incoming file
bytes to 3 MiB and decoded pixels to 16 million, then rotate/resize to a
1600-pixel maximum and encode JPEG without metadata. Enforce the 2 MiB
stored-image limit after normalization. Do not trust filename or MIME alone.

Add `/api/photo-gifts` alongside `/api/room-gifts`, with the same public
token/private management-key separation. Use multipart `photo` plus an
`edition` JSON field for creation. Hash the management key; use normalized
edition plus normalized JPEG bytes for request identity. An identical retry
returns the same link; a changed edition with that key returns conflict.
Revoked keys stay revoked.

Store the normalized image with its immutable edition in SQLite for this
pilot, on the existing persistent Fly volume. This permits atomic creation
and revocation without orphaned upload files. Return image bytes only through
an active recipient token; neither public metadata nor management metadata
should read or serialize the image BLOB unnecessarily.

### Exact API contract for implementation

- `POST /api/photo-gifts`: Authorization `Bearer <64-hex management key>`;
  multipart `photo` (one file) and `edition` (one JSON field, <=8192 bytes).
  Return 201 `{recipientToken, createdAt}`; identical retry returns 200 with
  the same values. Changed content with that key returns 409
  `edition_already_created`; a revoked key returns 410 `gift_revoked`.
- `GET /api/photo-gifts/:token`: return
  `{edition, image: {width, height}, createdAt}` only while active.
- `GET /api/photo-gifts/:token/image`: return `image/jpeg` bytes only while
  active. Use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- `GET /api/photo-gifts/manage`: management authorization required; return
  `{recipientToken, createdAt, revoked, edition, image}`. A closed gift has
  `edition: null, image: null`.
- `DELETE /api/photo-gifts/manage`: same authorization; idempotent closure
  returns `{revoked: true}` and clears both image and wording.
- Invalid management authorization: 401 `invalid_management_key`.
  Unknown keys and unknown/bad-shaped/closed recipient tokens: 404
  `gift_unavailable`. Public tokens are 43-character base64url strings.
  Invalid edition: 400 `invalid_edition`. Unsupported or corrupt image:
  400 `invalid_photo`. Oversize upload/image: 413 `photo_too_large`.
  Storage/processing failure: generic 503 `save_unavailable`, never a stack
  trace, private key, raw request, or filesystem location.

Normalize edition fields in the order shown in the TypeScript shape, reject
raw over-limit strings before trimming, and discard unrecognized properties.
Require version 1, all four string fields, and finite x/y in the inclusive
range 0–1. The clue may be empty; names and message may not.

Compute request identity as SHA-256 over canonical edition JSON, a newline,
and the normalized JPEG bytes. Re-check the owner row after asynchronous
processing. Execute the final lookup/insertion using `BEGIN IMMEDIATE`,
`COMMIT`, and `ROLLBACK`; do not await anything while the transaction is open.
Existing rows are compared before the creation-quota check. Set the same
`X-RateLimit-Scope` semantics as the room-gift API. Bound image normalization
to one active job and four waiting jobs; return 503 `save_unavailable` beyond
that small queue rather than letting image decoding exhaust the 512 MiB API
machine. Multer memory limits apply before decoding.

Lead-authored schema and query shapes:

```sql
CREATE TABLE IF NOT EXISTS photo_gifts (
  token TEXT PRIMARY KEY,
  manage_hash TEXT NOT NULL UNIQUE,
  edition_json TEXT,
  image BLOB,
  image_width INTEGER,
  image_height INTEGER,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

SELECT token, edition_json, image_width, image_height, content_hash,
       created_at, revoked_at
FROM photo_gifts WHERE manage_hash = ?;

INSERT INTO photo_gifts
  (token, manage_hash, edition_json, image, image_width, image_height,
   content_hash, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);

SELECT edition_json, image_width, image_height, created_at
FROM photo_gifts WHERE token = ? AND revoked_at IS NULL;

SELECT image FROM photo_gifts WHERE token = ? AND revoked_at IS NULL;

UPDATE photo_gifts
SET revoked_at = COALESCE(revoked_at, ?), edition_json = NULL, image = NULL,
    image_width = NULL, image_height = NULL
WHERE manage_hash = ?;
```

Serialize the final owner lookup and insertion after asynchronous image
processing; use a SQLite transaction to avoid racing retries. Keep the
existing creation allowance shared between sample and photo gifts:
`room-create:${roomCreateRateKey(req, secret)}`, 10 new links/hour. Identical
retries do not consume that allowance. Add a separate upload-attempt limit
of 60 requests/hour per verified client to bound image processing.

The Worker must explicitly allow the new routes and sign creation requests
using the existing verified-client mechanism. Allow 45 seconds for the
photo-create upstream request; retain the existing timeout for other routes.
No new bucket, provider, secret, or payment integration is needed.

Preserve drafts, including the prepared image, in one IndexedDB record with
debounced updates. Offer Resume/Discard when reopening. If storage fails,
keep the draft in memory and say it remains only in this tab. Persist pending
creation identity before POST; on interrupted-save recovery, look up the
management key before resending. Clear the local draft only after confirmed
success or explicit discard. Do not serialize blob URLs as durable images.

### Existing code seams

- `dog-gift-tabletop/index.html` currently imports `main.ts` directly. Use a
  small `entry.ts` dynamic-import router; retain the same Vite single-page
  build and static-asset configuration. Do not add a second framework or
  payment flow. Route legacy saved links and `recipientPreview` to `main.ts`;
  route `?photo=1` to the new photo app. A plain `?make=1` selects photo
  creation only when no legacy saved link or preview is present.
- Add an obvious “Use your photo” link to the sample's demo cover; keep it
  out of recipient links and recipient previews. The existing room editor
  remains usable as the sample option.
- The Worker currently allows only health and room-gift API paths. Extend
  the exact-path/prefix allowlist and creation-signing condition to photo
  gifts. Do not expose the older paid `/api/gifts` pipeline through this
  Worker. Use the same signed-client prefix and secret; no new credential.
- `server/index.js` mounts room routes near `/api/health`; mount the new
  route module there with `{db, limitOr429}`. `server/db.js` owns additive
  schema creation. Existing Node 24 slim Docker and persistent `/data`
  SQLite deployment can support Sharp's Node >=20.9 requirement.
- Extend `server/test/security.test.mjs`, which already starts an isolated
  real server on port 8898, blocks provider imports/outbound fetches, uses a
  temporary database, and refuses a foreign process on its port. Reuse its
  signed-visitor helpers to keep new cases independent of exhausted quotas.
  Extend `server/test/room-worker.test.mjs` for the new allowlist, signed
  multipart requests, unchanged origin/header protections and failure paths.

### UI and player structure

The creator has five small views: photo, hiding place, clue, note, review.
No numbered checklist. Back and direct edit links preserve draft values.
Use the shared photo as the visual centre, cream paper for the message,
and the existing Fraunces/Instrument Sans/rust palette. Keep primary actions
outside the scrolling content and fit the shell to `visualViewport`.

Choosing a new photo clears only the location, preserving names, clue and
message. A single optional clue remains distinct from the secret message.
The default unclued recipient line is “I left a little note here. Have a
look around.” This is interface guidance, not a message saved on the
giver's behalf.

For placement, a real pointer tap computes normalized x/y from the displayed
image rectangle. A focusable placement surface supports arrow adjustments
of 0.02 per press (Shift: 0.10), clamped to 0–1; a “Centre the note” button
provides a starting point. Ignore gestures that move more than 7 CSS pixels
so scrolling never relocates the note accidentally.

Use the same player module for local draft playtests and saved recipients.
Keep its run state separate from the draft. The nine keyboard search regions
correspond to thirds of the image; choosing the containing region discovers
the note. Pointer misses give brief feedback but do not consume guesses.
One hint outlines the containing third, a second reveals the note marker,
and the direct-open action never requires a successful visual search.

The ready screen lets the giver inspect, test and adjust before sharing:
"See what they see" plays the saved gift in this tab (the same hunt, not a
direct reveal), "Make changes" copies the saved photo, spot, clue and note
back into the ordinary editor, and the public "Link to share" sits beside
Copy/native Share while the private management URL and close controls stay
behind a "Your private link" disclosure. Saved links are immutable —
editing is always a copy: "Save changes" mints a new recipient/private
pair, the original link is never updated or revoked, and the original
private page stays in browser history via `history.pushState`.

Before saving, validate the final edition and selected photo. Persist a new
pending management key and draft fingerprint before the request. Reuse that
key for an identical retry; editing the payload uses a new key. Freeze
creation controls while saving, preserve the complete draft on failure,
and never say the gift was sent merely because it was saved, copied, or
shared through the OS sheet.

## Verification and status

This design is approved and implemented at `?photo=1` —
creator (`photo-app.ts`, `photo-edition.ts`, `photo-image.ts`,
`photo-links.ts`, `photo-storage.ts`), shared player
(`photo-player.ts`), server route (`server/photo-gifts.js` mounted
beside room gifts), Worker proxy signing, and routing in `entry.ts`.
Published 2026-11-22: backend source `fc38277`, frontend source
`66cf464`, Fly API image `deployment-01M81SA5SRK00CANRFZ2AD120M` and
Worker version `a7f7442f-538f-4726-ac7d-8f524b97c301`. A live fixture
was created, played and revoked through the public Worker — the recipient
displayed the saved photo and exact note, and metadata plus image returned
404 after close.

Verified locally 2026-11-22: upload → placement (tap + arrow keys +
Centre) → clue → note → local playtest → create → fresh recipient →
reveal → revoke, at landscape and portrait aspect ratios; moving the
spot changes what the recipient must find (same renderer for preview
and saved links); nine-region keyboard search and direct open; draft
resume/discard and pending-save recovery after a failed POST;
malformed upload keeps the previous draft with an honest message;
revocation removes metadata and image (both 404); legacy sample editor,
recipient and preview routes untouched. Server security suite 56/56
including JPEG/EXIF/quota/idempotency/revoke/restart cases; Worker
tests 14/14 including signed multipart proxy. Storage-denied paths were
exercised live: a blocked IndexedDB open and a late write-transaction
abort both surface the persistent "Draft stays in this tab." notice
without stalling creation, and a failed recipient image load shows an
honest message with a working retry and direct note access. Remaining
gaps: real phones, their virtual keyboards and retry races against
production are still open.

A ready-screen/copy batch was published on 2026-11-22: the
ready screen above ("See what they see" / "Make changes" / "Link to
share" / "Your private link"), immutable copy-editing with `Save
changes` minting a new link, the shared ready layout for the sample
room, and plain-language copy across the React app scenes. Verified
locally in-browser: photo save → preview → copy-edit → new token with
original metadata unchanged, original private page reachable via Back,
draft restore after refresh, failed saved-image fetch preserving the
draft, denied storage falling back to in-memory editing, confirm-cancel
preserving an unfinished draft, single-player recipient retry after a
transient 503, frozen controls during a deferred saved-image fetch,
`pushState` failure leaving private controls and drafts intact, and
320/390/320×360 layouts including the visible new-link footnote. The room
flow was verified the same way (new token, original unchanged, no edit
controls on the recipient route, native Share carrying only the public
URL); on refresh the newest copied draft wins over an older pending save.
React Editor and Seal were rendered in demo mode via a direct component
mount on the dev server — component proof, not full pipeline coverage.
Native OS share sheet and real phones remain unverified.

Live verification of this batch: both photo and sample-room gifts were
created, previewed and copied for editing. Saving each revision produced a
new token while the original edition stayed unchanged. The photo revision
also moved the hiding spot; a fresh recipient found the note there.
The original photo gift’s private page remained reachable through Back.
All four disposable gifts were closed afterward; their public metadata
(and both photo images) then returned 404. Worker version:
`ca3b1aed-3df9-496e-802d-247ddfbc56ae`; pilot source: `35986b8`.

A first motion pass (published 2026-11-22, `paper-motion.ts` + scoped WAAPI)
landed after that publish — see `notes/MOTION.md` "Implemented" for the
full account: photo→clue FLIP with a counter-scaled marker, immediate
marker travel on placement, note-paper arrival, post-save ready glyph,
player discovery/fold animations, and shorter React Seal/Editor
entrances with synchronous send. Verified locally: authoritative
coordinates land before animation, rapid gestures/back cancel cleanly,
typing and footers stay steady, zero animations under reduced motion or
a throwing `Element.prototype.animate`, review paper survives a deferred
POST, ready actions are usable immediately, compact 320/360-landscape
layouts hold. Not yet checked: real phones, virtual-keyboard motion,
and the genuine-gift comparison the research asks for.

Release: pilot source `9c36528`, Worker version
`cbc94cb0-f94c-487c-9655-9b9c65211324`. Production assets match the reviewed
build. See MOTION.md for the independent automated run's assertion failure
and the separate direct verification.

The live photo → place → clue → note → preview → return → save → saved-preview
check passed. The draft retained its exact words after preview. Saved preview
rendered in place on the private page. The one live release fixture was closed,
and both metadata and image returned 404 afterward.
