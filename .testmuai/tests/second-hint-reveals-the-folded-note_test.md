---
assurance:
  id: t-20
  base: sha256:3b8c87e942363ec3c91ee23121473aa531fa807cab06755d799dcf1a3a8fcbdc
---

# Second hint reveals the folded note

> A recipient requests the hint sequence until the second hint reveals the folded note.

## Step 1 @verifies ac-35, ac-36

Open the recipient gift URL {{valid_gift_url}} in the EnigmaGift browser, then assert the gift photo and clue {{gift_clue}} appear.

## Step 2 @verifies ac-37, ac-38, ac-39

In the recipient photo hunt, assert A little hint, Open without searching, and Search by area with nine named regions are visible.

## Step 3 @verifies ac-56

In the recipient photo hunt, request A little hint once, then assert the first hint narrows the search area.

## Step 4 @verifies ac-44, ac-45

In the same recipient hunt, request the second hint, then assert a folded-note marker and Open the note are offered.
