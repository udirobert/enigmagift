---
assurance:
  id: t-7
  base: sha256:028ec843ffb286d7cb808c3bf16740f7905ede10cd95dd8a7b9b9dcaaf5638c3
---

# Unsaved recipient hunt opens the letter and returns to the unchanged draft

> Open the recipient hunt before saving, find the hiding spot, read the letter and return to the unchanged editor.

## Step 1

At {{start_url}}, open the EnigmaGift photo-gift creator (?photo=1) and choose {{jpeg_photo}}. Place the paper marker at the centre. In the Clue field, type exactly 'Find the centre', then choose Write the note. Prepare the letter To Alex with message 'Preview check message' and From Sam.

## Step 2 @verifies ac-24, ac-25

From the unsaved gift editor, open See what they see, then assert the in-place recipient hunt shows the clue text 'Find the centre'.

## Step 3 @verifies ac-24, ac-25

In the in-place recipient hunt, assert the chosen photo is visible.

## Step 4 @verifies ac-29

In the recipient hunt preview, find the centred hiding spot and open the note, then assert the letter message text is 'Preview check message'.

## Step 5 @verifies ac-23

From the recipient preview, use Back to your gift to return to the editor, then assert the message text 'Preview check message' is still present.
