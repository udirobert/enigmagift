---
assurance:
  id: t-1
  base: sha256:9a24e892322fa1cc13dc4f9cf86efd15a105fd20544665dbc316e573a3c25666
---
# Editing creates a new link without changing the earlier gift

> Save a photo gift, edit its content from Make changes, obtain a new link, and compare the original gift at the earlier link.

## Step 1

Open {{start_url}} in a browser at the EnigmaGift photo-gift creator (?photo=1).

## Step 2

From the creator, choose {{jpeg_photo}}, position the hiding spot, write To 'Ada', message 'First gift', and From 'Eli', then review and create the gift link.

## Step 3 @verifies ac-19, ac-20

On the ready screen, locate the share link and Make changes, record the earlier link's URL for comparison, then assert Link to share and Make changes are displayed.

## Step 4 @verifies ac-1

From Make changes on this saved gift, change the note message to 'Revised gift', review and create the edited gift link, then assert the new share link differs from the recorded earlier link.

## Step 5 @verifies ac-2

Open the recorded earlier share link in the browser, then assert it still presents the original gift with 'First gift' rather than the edited 'Revised gift'.
