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

On the original gift's ready screen, assert Link to share and Make changes are displayed.

## Step 4

From Make changes on this saved gift, change the note message to 'Revised gift', review and create the edited gift link, then assert the edited gift ready screen is shown.

## Step 5

Go back in the browser to the original saved gift page. On that original gift page, use See what they see, then use Open without searching to open the letter.

## Step 6 @verifies ac-1, ac-2

On the opened original gift letter, assert the message text is 'First gift'.
