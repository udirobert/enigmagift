---
assurance:
  id: t-3
  base: sha256:aaf06e882b3687da15899f7847979d0d4da60f4c5869d0d806c80d5563462859
---
# Device picker excludes non-JPEG photos

> Check that non-JPEG files cannot be selected from the creator's device picker.

## Step 1

Open {{start_url}} in a browser at the EnigmaGift photo-gift creator (?photo=1).

## Step 2 @verifies ac-5

From the creator's device-photo picker, attempt to select the non-JPEG fixture {{non_jpeg_photo}}, then assert the picker does not permit that file to be selected as the gift photo.
