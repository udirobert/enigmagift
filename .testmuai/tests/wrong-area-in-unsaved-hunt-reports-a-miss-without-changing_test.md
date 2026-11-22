---
assurance:
  id: t-9
  base: sha256:155bb836b41580baba37dd16b8b600f2be0d03c1b406d418fd2590fb8b0074a1
---
# Wrong area in unsaved hunt reports a miss without changing draft

> Preview a known wrong search area, see the recipient miss feedback, and return without losing the draft.

## Step 1

At {{start_url}}, open the EnigmaGift photo-gift creator (?photo=1), choose {{jpeg_photo}}, centre the paper marker, enter clue 'Find the centre', and prepare the letter To Alex with message 'Preview check message' and From Sam.

## Step 2 @verifies ac-24

From the unsaved gift editor, use Try the hunt, then assert the recipient preview shows the chosen photo, clue 'Find the centre', and hunt controls A little hint, Open the note, Open without searching, and Search by area.

## Step 3 @verifies ac-27

In the preview's Search by area control, search the middle left rather than the centred marker's region, then assert the feedback says 'Nothing in the middle left'.

## Step 4 @verifies ac-23

Use Back to your gift to return to editing, then assert the photo, centred spot, clue 'Find the centre', To Alex, message 'Preview check message', and From Sam exactly match their pre-preview values.
