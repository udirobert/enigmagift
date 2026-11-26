---
assurance:
  id: t-9
  base: sha256:155bb836b41580baba37dd16b8b600f2be0d03c1b406d418fd2590fb8b0074a1
---

# Wrong area in unsaved hunt reports a miss without changing draft

> Preview a known wrong search area, see the recipient miss feedback, and return without losing the draft.

## Step 1

At {{start_url}}, open the EnigmaGift photo-gift creator (?photo=1) and choose {{jpeg_photo}}. Place the paper marker at the centre. In the Clue field, type exactly 'Find the centre', then choose Write the note. Prepare the letter To Alex with message 'Preview check message' and From Sam.

## Step 2 @verifies ac-24

From the unsaved gift editor, use See what they see, then assert the recipient preview shows the clue text 'Find the centre'.

## Step 3 @verifies ac-24

In the recipient preview, assert the chosen photo is visible.

## Step 4 @verifies ac-27

In the preview's Search by area control, search the middle left rather than the centred marker's region, then assert the feedback text is 'Nothing in the middle left — look again.'.

## Step 5 @verifies ac-23

Use Back to your gift to return to editing, then assert the message text 'Preview check message' is still present.
