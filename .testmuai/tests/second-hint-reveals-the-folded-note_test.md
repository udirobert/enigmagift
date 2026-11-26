---
assurance:
  id: t-20
  base: sha256:3b8c87e942363ec3c91ee23121473aa531fa807cab06755d799dcf1a3a8fcbdc
---

# Second hint reveals the folded note

> A recipient requests the hint sequence until the second hint reveals the folded note.

## Step 1

Open the recipient gift URL {{valid_gift_url}} in the EnigmaGift browser.

## Step 2 @verifies ac-56

In the recipient photo hunt, request A little hint once, then assert the hint text is 'Somewhere in the bottom right of the photo.'

## Step 3 @verifies ac-44, ac-45

In the same recipient hunt, request the second hint, then assert a folded-note marker is revealed.
