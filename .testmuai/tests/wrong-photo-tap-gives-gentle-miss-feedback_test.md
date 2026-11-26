---
assurance:
  id: t-22
  base: sha256:9c967170b817abd40ee1b72e10b971b4f7cfe9a482c507cc8a5cd566c3cfedc2
---

# Wrong photo tap gives gentle miss feedback

> Tapping the gift photo outside its hiding spot yields the gentle Not quite there feedback.

## Step 1

Open the recipient gift URL {{valid_gift_url}} in the EnigmaGift browser.

## Step 2 @verifies ac-40

On the recipient photo hunt, tap the photo at {{outside_spot_location}}, outside this gift's hiding spot, then assert the feedback text is 'Not quite there — keep looking.'
