---
assurance:
  id: t-15
  base: sha256:a78b564688b6075293bf9c53d68984624a01b838893fe34bc7d0bb3365244337
---
# Wrong photo tap gives gentle miss feedback

> Tapping the gift photo outside its hiding spot yields the gentle Not quite there feedback.

## Step 1 @verifies ac-35, ac-36, ac-37, ac-38, ac-39

Open the recipient gift URL {{valid_gift_url}} in the EnigmaGift browser, then assert the gift photo and clue {{gift_clue}} appear, A little hint and Open without searching are available, and Search by area offers nine named regions.

## Step 2 @verifies ac-40

On the recipient photo hunt, tap the photo at {{outside_spot_location}}, outside this gift's hiding spot, then assert Not quite there appears.
