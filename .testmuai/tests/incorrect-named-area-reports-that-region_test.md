---
assurance:
  id: t-21
  base: sha256:67d41d3ed865cbc7ff2a1ce4c0f0e038f81f073357a9bc7f53ead21d0427c70f
---

# Incorrect named area reports that region

> Selecting a wrong region names the searched region in the miss feedback.

## Step 1 @verifies ac-35, ac-36

Open the recipient gift URL {{valid_gift_url}} in the EnigmaGift browser, then assert the gift photo and clue {{gift_clue}} appear.

## Step 2 @verifies ac-37, ac-38, ac-39

In the recipient photo hunt, assert A little hint, Open without searching, and Search by area with nine named regions are visible.

## Step 3 @verifies ac-41

In Search by area on the recipient photo hunt, search middle left, a region without this gift's hidden spot, then assert the miss feedback names middle left, such as Nothing in the middle left.
