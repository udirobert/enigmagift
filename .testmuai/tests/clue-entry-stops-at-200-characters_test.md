---
assurance:
  id: t-5
  base: sha256:2c21febe16ab9385fa2da46159fc4afca40e4378d82452baeba830ea29ac053c
---
# Clue entry stops at 200 characters

> Enter 200 characters into the optional clue and attempt a 201st; only 200 can be typed.

## Step 1

Open {{start_url}} in a browser at the EnigmaGift photo-gift creator (?photo=1).

## Step 2

In the creator, select the JPEG {{jpeg_photo}} and position its hiding spot to reach the optional clue input.

## Step 3 @verifies ac-12

In the clue input, type 199 repetitions of 'A', append one more 'A', and then attempt to type one further 'A', then assert the input contains only 200 'A' characters and does not accept character 201.
