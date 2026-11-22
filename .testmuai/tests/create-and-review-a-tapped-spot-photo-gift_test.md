---
assurance:
  id: t-4
  base: sha256:9c00c6dcc69250431fa1bb5eb52f438046b48a80d9146e2db7b73b130ad96d4e
---
# Create and review a tapped-spot photo gift

> Choose JPEG, place marker by tap, enter a clue and note, review the full letter, and save to the ready screen.

## Step 1

Open {{start_url}} in a browser at the EnigmaGift photo-gift creator (?photo=1).

## Step 2 @verifies ac-6

In the creator, select the device JPEG {{jpeg_photo}}, then assert that selected JPEG appears as the gift photo.

## Step 3 @verifies ac-7, ac-10

On the selected photo, place the hiding spot by tapping a point away from the centre, then assert the hiding spot is at the tapped point with a paper marker at that point.

## Step 4

In the clue and note composer, enter clue 'Find the note', To 'Ada', message 'You found the note!', and From 'Eli'.

## Step 5 @verifies ac-13, ac-14, ac-15, ac-16, ac-17

Use Look it over to reach the review, then assert the selected photo still has its paper marker and the full letter shows To 'Ada', 'You found the note!', and From 'Eli'.

## Step 6 @verifies ac-18, ac-19, ac-20, ac-21

From review, create the gift link and reach the ready screen, then assert See what they see, Make changes, Link to share, and Copy link are present.

## Step 7 @verifies ac-22

On the ready screen, open its private-controls disclosure, then assert the private controls are inside that disclosure.
