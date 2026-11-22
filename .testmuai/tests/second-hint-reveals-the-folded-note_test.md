---
assurance:
  id: t-16
  base: sha256:a644697fc75ea1b85b56f546479e5f6c4c8a6bd60ba2f9ac40a9678f9baf85cf
---
# Second hint reveals the folded note

> A recipient requests the hint sequence until the second hint reveals the folded note.

## Step 1 @verifies ac-35, ac-36, ac-37, ac-38, ac-39

Open the recipient gift URL {{valid_gift_url}} in the EnigmaGift browser, then assert the gift photo and clue {{gift_clue}} appear, A little hint and Open without searching are available, and Search by area offers nine named regions.

## Step 2 @verifies ac-56

In the recipient photo hunt, request A little hint once, then assert the first hint narrows the search area.

## Step 3 @verifies ac-44, ac-45

In the same recipient hunt, request the second hint, then assert a folded-note marker and Open the note are offered.
