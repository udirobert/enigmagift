---
assurance:
  id: t-11
  base: sha256:b6e3165ce5eb22ee5126642bf32fee2eaf1c8b47c0c13797677ca7af03787b70
---
# Closed recipient links never show the hunt

> A revoked or unknown recipient link shows the closed-gift message instead of a hunt.

## Step 1 @verifies ac-30, ac-31

Open the revoked recipient gift URL {{revoked_gift_url}} in the EnigmaGift browser, then assert a closed-gift message appears and the recipient hunt is absent.

## Step 2 @verifies ac-30, ac-31

Open the unknown recipient gift URL {{unknown_gift_url}} in the EnigmaGift browser, then assert a closed-gift message appears and the recipient hunt is absent.
