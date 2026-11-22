# dog-gift-tabletop — tabletop experiment (isolated cut)

Experiment cut of `dog-gift-next/` with the three interactions called out in
`notes/CANONICAL-GIFT.md` ("What to test first") plus the fuller family-room
pilot layer (still atlas, help ladder, keepsake recap, recipient-preview
remix, and saved recipient links). Control build stays at `dog-gift-next/`;
nothing here feeds back into it.

## The three changes

1. **Touched-part accent.** Picking now returns the actual traced patch, not
   just the target type. A confirmed chair tap outlines/fills only that
   world-space polygon (back vs leg, left vs right) for ~450 ms — warm paper
   edge + translucent fill, tracked per frame, `pointer-events:none`. Static
   outline under reduced motion; never fires on occluded or rear-plane taps.
2. **The dog's viewpoint.** After inspecting the dog, a "Look from here" chip
   appears. Choosing it cuts (eyelid blink, instant under reduced motion) to a
   low camera beside the dog aimed at the table lip — "Back to my spot"
   restores the exact previous pose. No auto-open, walking is parked while
   crouched, and tabletop taps keep working without visiting.
3. **The note lives on the table.** A folded cream paper mesh sits on the
   table lip (hinged flap overhanging the edge, visible from the dog's low
   angle). First table/paper inspect shows an anchored "Unfold" chip; a second
   deliberate touch on the paper — or the chip — unfolds the flap in place and
   opens a small reading card that keeps the room visible. Help/direct-open
   and the no-WebGL text path still use the accessible dialog.

The control's missed-tap nudge, direct-open route and ability to keep
exploring remain available; the photo route and reveal actions have evolved
in the pilot below.

## Family-room pilot additions

The same cut also carries the fuller local hunt layer:

- **The reverse side.** Behind the start view (negative z) a cream illustrated
  postcard on a small easel and a ribbon bookmark on a peg are real meshes —
  placed by raycasting the collider backward from the start pose (max ~3.5 m
  or just before the first wall). Both are pickable like any other target,
  give their own clue/keepsake lines, and appear in the textpath. A one-time
  early line on a familiar item mentions "a card behind you".
- **A quiet run.** `run.ts` records one attempt in memory: route
  (found/guided/direct), active time (paused when the tab hides), exploratory
  taps, distinct discoveries, explicit help requests. No storage, no network.
  After opening, "How the hunt went" shows the frozen recap in place.
- **Success, not just a slip.** The first time the table's envelope is
  discovered the status reads "You found it. I kept it safe for you." before
  the slip line — a direct open never claims a find.
- **Help ladder.** "A little more help" gives one state-aware nudge at a time
  (watcher near the floor → opt-in dog pose → paper edge with a paper flash);
  "Walk me through it" spells out dog → sightline → table → Unfold and marks
  the run guided; "Just open my gift" is always present.
- **Remix → recipient preview.** `ROOM.allowRemix` gates a post-reveal "Make a
  gift in this room" editor: a native `dialog` styled like the room's
  stationery, written in four small stages — People (To/From), Message (the
  invitation, with a live "characters left" count), Clues and Review. The numbered stage tabs
  along the top are always clickable — jumping forward or back never
  validates and never loses text, so the only gate is the explicit action on
  Review. The Review stage adapts to the draft: with essentials missing it
  reads "Make it yours", disables Preview, and turns the primary into a
  gentle guide ("Add recipient", "Write your note"…) that jumps to and
  focuses the right field without red ink; a complete draft reads "Ready to
  share?" with "Create recipient link" and "Preview as {name}" together in the footer
  (length problems still mark the field and explain). The stage tabs carry
  quiet completion marks — a ✓ on People and Message once their required
  fields are in range, "Optional" over Clues — and the primary is labelled
  for where it leads ("Write the note", "Choose the clues"). The Clues
  stage is optional: three small object cards (dog/postcard/ribbon stills)
  pick which one textarea is shown, each with a one-line hint about what
  that clue does in the trail; all three fields stay mounted and keep
  their text, the room's default trail fills in anything left cleared, and
  the primary reads "Keep these clues" until a clue is edited (then
  "Review my gift") — either way it lands on Review. The Review letter
  preserves the giver's own line breaks, as does the note the recipient
  unfolds. `?make=1` opens a clean editor without playing
  the demo — a fresh composer keeps the room's default clues but starts the
  invitation blank; a reopened composer restores the last draft, the same
  stage and the selected clue (drafts stay in the tab until a link is
  created). Backing out — Close or Escape — preserves everything in memory,
  and a quiet "Continue your gift" link appears on the cover, in the help
  panel and along the photo path until a link is created (demo only —
  recipients and previews never see it).
  "Create recipient link" publishes a saved snapshot (below); "Preview as
  {name}" sits beside it in the footer and opens the draft inside a
  full-window same-origin iframe (`./?recipientPreview=1`) — the parent's
  room, run and keepsakes are never replaced. The draft travels by
  `postMessage` in memory only (no URL, no storage); the child validates
  source/origin/room revision/field lengths, signs its cover
  `For {to}, from {from}` via `textContent`, runs a fresh independent run,
  and offers no remix CTA. "Back to editing"/"Back to my draft" removes the
  frame and restores the form, stage and original session. A short
  180 ms settle marks stage changes (skipped under reduced motion).
- **Saved recipient links.** "Create recipient link" posts the draft to
  `/api/room-gifts` on the EnigmaGift API — an immutable edition snapshot,
  saved server-side (no checkout, no email, no account; free). The API
  returns a recipient token; the client builds the two URLs locally: the
  recipient link `…#gift=<token>` to share, and a private management link
  `…#manage=<key>` that opens the owner view ("Your gift is ready." — a
  copyable recipient link and, where the OS supports it, a native
  "Share gift…" that only ever carries the public `#gift` URL, with copy
  always present as fallback and cancel leaving copy available; and behind
  "Keep your private controls" a copyable management URL and a confirmed
  "Close recipient link" that revokes it). Anyone holding the recipient
  link can open the gift; revoking removes the message from the stored
  edition and the link stops working — a closed or failed link shows an
  honest error card (retry only for transient failures), never silently the
  canonical gift. To reply or change wording the sender makes a new link —
  the snapshot can't be edited. An interrupted create keeps its draft and
  management key in this tab's session so the exact retry reuses them. The
  server allowlist (currently only this room, revision 44124720) is
  authoritative; `ROOM.allowRemix` is not. Live since 2026-11-21 on
  Cloudflare Worker `enigmagift-room`
  (`https://enigmagift-room.trustfall.workers.dev`, `?make=1` for the
  editor), proxying to the Fly API. Link creation is free — no code or
  checkout is needed for phone testing — capped at 10 new links per
  visitor per hour (the Worker signs a pseudonymous client-IP id; a
  shared household or NAT can still share one bucket). Not yet proven
  on a real phone.
- **Still atlas — "Explore in photos".** The flat text fallback is named
  *Explore in photos* (entry link, help button and panel title all read it),
  is available before or without loading 3D, and a failed room open recovers
  into the same photo route without blaming the device. Inside it is a
  two-place atlas — "Around the table" / "On the other side" — backed by ten
  local captures
  (`public/stills/*.webp`, cropped from the rendered world, revision
  44124720). Each artefact shows its actual still, one spatial sentence and
  the edition-aware clue; selecting never moves the camera. "Take me there"
  (3D only) jumps to a saved look with "Back to my spot" restoring the exact
  pose; "Return to the room" simply leaves. Ask-the-dog, the low observation,
  the table slip and Unfold are preserved. Back works one level at a time
  (still → artefact list → places), each labelled where it leads. Back from
  a still restores focus to its item; leaving a place focuses the first
  place control.
- **Keepsake recap.** A `keepsakes` set records intentional inspections of
  the three authored memories (dog/postcard/ribbon) in either mode, past the
  reveal; a new attempt clears it. The recap panel reads "You found your
  gift." or "Your gift is open.", suggests one still-unseen keepsake
  (ribbon → postcard → dog, no spoilers), and keeps the frozen route/time/
  discoveries/hints behind a collapsed "See my trail". "My trail" stays
  reachable after the reveal; all seen reads "You found everything that was
  left for you."
- **Quiet endings.** Both the unfolded paper note and the gift note end on
  one primary "Keep exploring"; a small "Make a gift in this room" link sits
  beside it (CSS-gated so it can never appear while the note is still the
  folded slip), and recap/replay stay behind a collapsed "More options"
  disclosure. The pre-reveal slip offers only "Unfold the note" and a
  dedicated "Not yet" — secondary actions can't leak in before the gift is
  open.

## Build

Run from the repo root (it reuses the root's vite + node_modules):

The tabletop Vite dev server proxies `/api` to `127.0.0.1:8787`, so the
backend (`server/index.js`, Node >= 22.15) must be running for saved-link
features. The published form is a Cloudflare Worker (`enigmagift-room`,
`wrangler.jsonc`): static assets from `dist/` plus a same-origin `/api/*`
proxy (`worker.ts`) that forwards only `/api/health` and `/api/room-gifts*`
to `enigmagift-api.fly.dev` — other API paths get a 404, cross-origin
requests a 403, and the browser Origin/Host/cookies are stripped before
forwarding. `_headers` keeps `X-Frame-Options: SAMEORIGIN` (the preview
iframe needs it) and `/api/*` no-store. Deploy the API (`server/` fly
deploy) first, then `npm run deploy:room` builds `dist/` and publishes the
Worker. Local verification used a temporary data directory, not permanent
production storage.

```sh
# local dev server
./node_modules/.bin/vite dog-gift-tabletop --host 127.0.0.1 --port 4296 --strictPort

# static build
out=$(mktemp -d) && ./node_modules/.bin/vite build dog-gift-tabletop --outDir "$out" \
  && cp -R "$out"/. /tmp/eg-family-room-pilot/
```

`room.jpg`, `world.json` and `stills/` ship alongside; `?recipientPreview=1`
is only ever used by the in-page iframe, `?make=1` is a local author
shortcut.

Runtime contract is identical to the control: same-origin `world.json`
`{rad, collider}` remote URLs, shared root transform, `ANCHOR_REVISION` must
match the streamed world (44124720).

## Verification so far (manual, one session)

Checked in Ego Browser (desktop 1450x736, emulated 390x844 and 320x568):
the root door layout shows no overlap at 390 and no horizontal overflow at
320; photos accumulate and deduplicate to five, with consent gating Build;
the selector caps its stored selection at 12. On this cut the editor headings stay inside the panel at both widths,
a preview shows the personalized invitation and a backed-out draft is
retained, and optional empty clues preview fine. The 3D path worked end to
end (dog → "Look from here" → paper at the low pose → Unfold), and a forced
world.json failure recovered into the photo route. Not exercised: real
phones, full checkout/generation/sends, and the earlier 3D load failure's
root cause is not established.

Saved-link checks also passed in Ego Browser: personalized preview →
creation → a fresh recipient page → photo discovery and reveal; reloads
retained the edition; closing the link blocked later opens. Copy success
and manual-copy fallback, denied session storage with an ambiguous create
response, ambiguous revocation, API failure/retry, literal HTML as text,
and invalid/combined URL modes were exercised. Management layouts were
checked at 390×844 and 320×568 without horizontal overflow. API regression
tests additionally verified persistence across a server restart. Those
were local tests against a temporary database.

Staged-editor checks (local, Ego Browser): the four-stage
composer was exercised at 1450×736, 390×844, 320×568 and a 360 px
short-height pass — always-clickable stage tabs with required-field
completion marks, a real Enter keypress in a name field advancing one
stage without posting (handled explicitly, since a disabled Preview can
block implicit submission; the textarea keeps its newline and synthetic
composing events were ignored — real IME input was not tested), adaptive
Review ("Make it yours" with a guided primary and disabled Preview vs
"Ready to share?"), per-field errors for missing and oversized content,
literal HTML names rendered as text, the "Keep these clues"/"Review my
gift" primary label flipping when a clue differs from the room defaults,
per-card clue-purpose hints, and clue selection plus all draft text
surviving Close/Escape and reopen. The recipient preview closed the
dialog, ran inert-gated in its iframe and returned to the same stage with
the giver's paragraph breaks intact; a 12-line invitation scrolls inside
the recipient note surfaces with the first line and the close controls
reachable rather than pushed off-screen — the photo note was exercised
through its reveal; the tabletop paper was checked in a rendered DOM
fixture, without rerunning the 3D journey. The entry link stayed hidden
until the note was open, and "Continue your gift" resumed the draft from
cover/help/photo paths (never on recipient or preview pages). A deferred
local create froze every composer control (Escape included) and its
rejection restored them — Preview re-enabled, the Create label back —
before a real retry created and revoked one local fixture; the management
view showed the large "Your gift is ready." title and, against a mocked
manage view with stubbed `navigator.share`/`canShare`, copy stayed the
primary action when sharing was absent, declined or threw, and when
supported the share button offered only the public `#gift` URL (no key,
no `#manage`), stayed quiet on cancel, pointed back at copy on failure,
and never claimed anything was sent. Reduced-motion runs produced no
stage or arrival animation. Small-height (~360 px) layout was checked for
internal scrolling only; real-phone keyboards, touch and the real OS
share sheet were not exercised.

The staged editor was then verified live (2026-11-22): all four stages,
stage-jump persistence, the "Skip clues" default, recipient preview and
return, and a disposable gift created through the public UI — recipient
page served the exact personalized edition, and revocation through the
private controls left the recipient link unavailable. Real phones remain
unverified.

Live verification (2026-11-21, Cloudflare Worker + Fly API): a disposable
test gift was created through the real UI, opened in a fresh recipient
page (personalized cover, photo discovery, unfolded message and
signature), refreshed intact, and closed through the private controls —
after which the recipient link returned the unavailable card. The preview
iframe ran same-origin unblocked, and management layout was re-checked at
390×844. HTTP checks confirmed `/api/health` 200 with no-store,
unauthenticated manage 401, non-room API paths 404, cross-origin POST 403,
SAMEORIGIN + no-referrer headers, and 404 (not HTML) for missing assets.
The per-visitor rate limit fix (48 API tests + 10 Worker unit tests covering
independent signed visitors and forgeries) is deployed and the public
`X-RateLimit-Scope: verified-client` header was confirmed on a real create.
Not exercised: real phones, checkout, generation, or sending through an
external messaging app.

## Experiment run card

Give each first-time recipient ONE build (control or this cut) with the neutral
instruction "Someone sent you this. Open it as you normally would." Assign
different people to different cuts so nobody learns the solution. Observe:
intended vs registered taps, what led them to the table, whether they explore
after opening. No analytics are collected; these are proposed observations,
not results.
