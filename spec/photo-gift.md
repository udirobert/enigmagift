# EnigmaGift — Photo Gift Journey Requirements

EnigmaGift lets a giver hide a personal note inside a photo and share it as a
link. The recipient plays a small treasure hunt to find the folded note and
read the message. All flows run in a browser on desktop and mobile viewports.

## UC1 — Create a photo gift

- The giver opens the photo-gift creator (?photo=1).
- They choose a JPEG, PNG or WebP photo from their device; the browser normalizes it to a clean JPEG before upload.
- They place the hiding spot by tapping the photo or using "Centre the note";
  the spot can be moved before continuing. A paper-marker shows the spot.
- They may write an optional clue (up to 200 characters) or skip it.
- They write the note: To (recipient name), the message, From (giver name).
- The review shows the photo with its marker and the full letter text.
- "Look it over" leads to "Create gift link". Saving produces:
  - a ready screen with "See what they see", "Make changes",
    "Link to share", "Copy link", and private controls behind a disclosure.
- Editing a saved gift creates a new link; earlier links keep their gift.

## UC2 — Preview the gift before sharing

- "See what they see" (before saving, "Try the hunt") runs the exact
  recipient experience in place: photo, clue, hunt controls.
- "Back to your gift" returns to the editor with the draft preserved
  exactly (photo, spot, clue, names, message).

## UC3 — Recipient discovers and reads the note

- Opening the recipient link shows the photo, the clue, and hunt controls:
  "A little hint", "Open without searching", and "Search by area"
  (nine named regions). "Open the note" appears once the note is found.
- Tapping outside the spot reports a gentle miss ("Not quite there").
- Searching a wrong area names it ("Nothing in the middle left").
- Finding the spot (tap, correct area, or second hint) reveals a folded-note
  marker and offers "Open the note".
- "Open the note" shows the letter: For <name>, the message, — <sender>;
  controls: Back to photo, Replay hunt, Copy note.
- "Replay hunt" re-hides the note for another search.
- A revoked or unknown link shows a closed-gift message, not the hunt.

## UC4 — Resilience and comfort

- If the photo cannot load, the recipient sees an honest message plus
  "Try again" and can still open the note directly.
- With OS reduced-motion enabled, all screens remain fully usable.
- At 320px-wide and short viewports, all primary controls remain reachable.
- If the browser blocks persistent storage, the app still works within the tab
  and says the draft stays in this tab.

## Out of scope for this suite

- The 3D sample-room demo and its editor.
- Paid React-app flows, Stripe checkout, and payments.
- Private management revocation (requires a secret key; covered separately).
