---
assurance:
  id: t-13
  base: sha256:c07cc9e4cc38fa6ef3b1ba46773b510ae23eb7992467d9244029281cfb35452b
---
# Find, read and replay a recipient photo gift

> A correct photo tap reveals the folded marker; recipient reads the personalized letter and re-hides it by replaying.

## Step 1 @verifies ac-35, ac-36, ac-37, ac-38, ac-39

Open the recipient gift URL {{valid_gift_url}} in the EnigmaGift browser, then assert the gift photo and clue {{gift_clue}} appear, A little hint and Open without searching are available, and Search by area offers nine named regions.

## Step 2 @verifies ac-42, ac-45

On the recipient photo hunt, find the hiding spot at {{hiding_spot_location}}, then assert a folded-note marker and Open the note are offered.

## Step 3 @verifies ac-46, ac-47, ac-48, ac-49, ac-50, ac-51

From the revealed folded note, open the note, then assert the letter shows For {{recipient_name}}, {{gift_message}}, and — {{sender_name}}, with Back to photo, Replay hunt, and Copy note available.

## Step 4

capture baseline: note open on the recipient letter screen

## Step 5 @verifies ac-52

On the open recipient letter, use Replay hunt, then assert the note is hidden for another search.
