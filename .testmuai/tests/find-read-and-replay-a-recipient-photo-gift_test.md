---
assurance:
  id: t-19
  base: sha256:4c1fb284a39909a9ee170323f6bef241a55ecd66e03ef4463755dd46cc748375
---

# Find, read and replay a recipient photo gift

> A correct photo tap reveals the folded marker; recipient reads the personalized letter and re-hides it by replaying.

## Step 1 @verifies ac-35, ac-36

Open the recipient gift URL {{valid_gift_url}} in the EnigmaGift browser, then assert the gift photo and clue {{gift_clue}} appear.

## Step 2 @verifies ac-37, ac-38, ac-39

In the recipient photo hunt, assert A little hint, Open without searching, and Search by area with nine named regions are visible.

## Step 3 @verifies ac-61

Before the note is found, assert the Open the note control is hidden.

## Step 4 @verifies ac-42, ac-45

On the recipient photo hunt, find the hiding spot at {{hiding_spot_location}}, then assert a folded-note marker and Open the note are offered.

## Step 5 @verifies ac-46, ac-47, ac-48, ac-49, ac-50, ac-51

From the revealed folded note, open the note, then assert the letter shows For {{recipient_name}}, {{gift_message}}, and — {{sender_name}}, with Back to photo, Replay hunt, and Copy note available.

## Step 6 @verifies ac-52

On the open recipient letter, use Replay hunt, then assert the photo hunt is visible again for another search.
