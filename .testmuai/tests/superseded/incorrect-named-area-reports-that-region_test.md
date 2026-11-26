---
assurance:
  id: t-14
  base: sha256:f95ab1e3eb95cb66b2940be8bca105d5620e6964e0fd685e176655a7bfc8b575
---
# Incorrect named area reports that region

> Selecting a wrong region names the searched region in the miss feedback.

## Step 1 @verifies ac-35, ac-36, ac-37, ac-38, ac-39

Open the recipient gift URL {{valid_gift_url}} in the EnigmaGift browser, then assert the gift photo and clue {{gift_clue}} appear, A little hint and Open without searching are available, and Search by area offers nine named regions.

## Step 2 @verifies ac-41

In Search by area on the recipient photo hunt, search middle left, a region without this gift's hidden spot, then assert the miss feedback names middle left, such as Nothing in the middle left.
