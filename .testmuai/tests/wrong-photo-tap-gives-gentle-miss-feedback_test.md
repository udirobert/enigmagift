---
assurance:
  id: t-22
  base: sha256:9c967170b817abd40ee1b72e10b971b4f7cfe9a482c507cc8a5cd566c3cfedc2
---

# Wrong photo tap gives gentle miss feedback

> Tapping the gift photo outside its hiding spot yields the gentle Not quite there feedback.

## Step 1 @verifies ac-35, ac-36

Open the recipient gift URL {{valid_gift_url}} in the EnigmaGift browser, then assert the gift photo and clue {{gift_clue}} appear.

## Step 2 @verifies ac-37, ac-38, ac-39

In the recipient photo hunt, assert A little hint, Open without searching, and Search by area with nine named regions are visible.

## Step 3 @verifies ac-40

On the recipient photo hunt, tap the photo at {{outside_spot_location}}, outside this gift's hiding spot, then assert Not quite there appears.
