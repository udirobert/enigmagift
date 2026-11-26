---
assurance:
  id: t-10
  base: sha256:2913c7a894f2c976864ae86d1b42881cb2afcee3dfcd9b2f1455746988f0862f
---

# Second hint reveals folded note and preserves draft on return

> Preview the second hint's reveal of the spot and return to the unchanged editor.

## Step 1

At {{start_url}}, open the EnigmaGift photo-gift creator (?photo=1) and choose {{jpeg_photo}}. Place the paper marker at the centre. In the Clue field, type exactly 'Find the centre', then choose Write the note. Prepare the letter To Alex with message 'Preview check message' and From Sam.

## Step 2 @verifies ac-24

From the unsaved gift editor, use See what they see, then assert the recipient preview shows the clue text 'Find the centre'.

## Step 3 @verifies ac-24

In the recipient preview, assert the chosen photo is visible.

## Step 4 @verifies ac-28

In the recipient preview, use A little hint until the second hint is shown, then assert a folded-note marker is revealed.

## Step 5 @verifies ac-23

Use Back to your gift to return to editing, then assert the message text 'Preview check message' is still present.
