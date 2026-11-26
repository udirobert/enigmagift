---
assurance:
  id: t-19
  base: sha256:4c1fb284a39909a9ee170323f6bef241a55ecd66e03ef4463755dd46cc748375
---

# Find, read and replay a recipient photo gift

> A correct photo tap reveals the folded marker; recipient reads the personalized letter and re-hides it by replaying.

## Step 1

Open the recipient gift URL {{valid_gift_url}} in the EnigmaGift browser.

## Step 2 @verifies ac-36

In the recipient hunt, assert the clue text {{gift_clue}} is visible.

## Step 3 @verifies ac-35

In the recipient hunt, assert the gift photo is visible.

## Step 4 @verifies ac-37

In the recipient hunt, assert the A little hint control is visible.

## Step 5 @verifies ac-38

In the recipient hunt, assert the Open without searching control is visible.

## Step 6 @verifies ac-39

In the recipient hunt, assert the Search by area control is visible.

## Step 7 @verifies ac-61

Before the note is found, assert the Open the note control is hidden.

## Step 8 @verifies ac-42, ac-45

On the recipient photo hunt, find the hiding spot at {{hiding_spot_location}}, then assert a folded-note marker is revealed.

## Step 9 @verifies ac-46, ac-47, ac-48, ac-49, ac-50, ac-51

Open the revealed note, then assert the letter message text {{gift_message}} is visible.

## Step 10 @verifies ac-52

On the open recipient letter, use Replay hunt, then assert the recipient photo hunt is visible again.
