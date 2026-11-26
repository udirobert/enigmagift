---
assurance:
  id: t-2
  base: sha256:04cf3bb24141da72eeedcdbc7374b92ae09a6f943d8bee876dee9cf6ebf1b48d
---
# Blocked local storage keeps the gift draft in this tab

> With browser local storage blocked, compose in the same tab and observe a usable draft and the in-tab notice.

## Step 1

Open {{start_url}} in a browser at the EnigmaGift photo-gift creator (?photo=1).

## Step 2

In this browser tab, block local storage for the app, and return to the creator in the same tab.

## Step 3 @verifies ac-3

In the creator, select {{jpeg_photo}}, place a hiding spot, write To 'Ada', message 'A note for you', and From 'Eli', then proceed within the same tab, then assert the draft remains usable for composition despite blocked local storage.

## Step 4 @verifies ac-4

On the creator in that same blocked-storage tab, inspect the draft guidance, then assert a notice says the draft stays in this tab.
