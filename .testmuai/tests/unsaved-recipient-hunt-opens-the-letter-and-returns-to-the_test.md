---
assurance:
  id: t-7
  base: sha256:028ec843ffb286d7cb808c3bf16740f7905ede10cd95dd8a7b9b9dcaaf5638c3
---
# Unsaved recipient hunt opens the letter and returns to the unchanged draft

> Open the recipient hunt before saving, find the hiding spot, read the letter and return to the unchanged editor.

## Step 1

At {{start_url}}, open the EnigmaGift photo-gift creator (?photo=1), choose the JPEG photo {{jpeg_photo}}, place the paper marker at the centre, enter clue 'Find the centre', and prepare the letter To Alex with message 'Preview check message' and From Sam.

## Step 2 @verifies ac-24, ac-25

From the unsaved gift editor, open Try the hunt, then assert the in-place recipient hunt shows the chosen photo, clue 'Find the centre', and the recipient controls A little hint, Open the note, Open without searching, and Search by area.

## Step 3 @verifies ac-29

In the recipient hunt preview, find the centred hiding spot and open the note, then assert the letter reads For Alex, Preview check message, — Sam.

## Step 4 @verifies ac-23

From the recipient preview, use Back to your gift to return to the editor, then assert the photo, centred hiding spot, clue 'Find the centre', To Alex, message 'Preview check message', and From Sam exactly match their pre-preview values.
