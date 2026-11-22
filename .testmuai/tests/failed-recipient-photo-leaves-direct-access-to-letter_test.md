---
assurance:
  id: t-12
  base: sha256:bf1d7687f1f18408f900b6c9004e6eb827a9bbe3d33c9f5a27e4bae7593118a2
---
# Failed recipient photo leaves direct access to letter

> A recipient with a photo that fails to load sees honest failure feedback, retry, and direct access to the letter.

## Step 1 @verifies ac-32, ac-33

Open the recipient gift URL {{broken_photo_gift_url}} in the EnigmaGift browser, with its photo unable to load, then assert an honest photo-load failure message and a Try again control appear.

## Step 2 @verifies ac-34, ac-46, ac-47, ac-48, ac-49, ac-50, ac-51

From the photo-load failure state, open the note directly, then assert the letter is accessible and shows For {{recipient_name}}, {{gift_message}}, and — {{sender_name}}, with Back to photo, Replay hunt, and Copy note available.
