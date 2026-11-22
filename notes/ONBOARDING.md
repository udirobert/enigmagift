# Giver onboarding: making a little letter

Research and approved direction, 2026-11-22. This is the design reference for
the room pilot's giver experience. The user approved proceeding after the
research below. Implementation and release evidence belong in the
[tabletop README](../dog-gift-tabletop/README.md) and [operations log](OPS.md).

## The problem

The user described the first form as “very dry and cold” and like work a
colleague or boss had assigned. The previous People → Message → Clues → Review
flow improved navigation, validation and recovery, but still put a checklist
and fields in front of the emotional reason to make a gift.

The opening should let someone feel “I am making something for this person.”
The room and the evolving gift should dominate the composition. Each question
should belong to a recognizable act: addressing, writing, signing or sharing.
Changing labels and adding animation to the same questionnaire is insufficient.

## Research and what it supports

These are design guidance, documented product precedents and historical
accounts. They are not evidence of improved EnigmaGift conversion or emotional
impact. No uncoached giver–recipient research has been completed yet.

1. **Experience the appeal before investment.**
   [Apple's onboarding guidance](https://developer.apple.com/design/human-interface-guidelines/onboarding)
   and [Discoverable Design](https://developer.apple.com/videos/play/wwdc2021/10126/)
   favor brief, interactive learning within the actual task. A
   [2017 account from Duolingo's growth lead](https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker/)
   describes letting people try a lesson before registration. That historical
   experiment does not describe every current Duolingo flow.
   **Apply:** show the room and the possibility of leaving a note immediately.
   Avoid a mandatory explanatory tour before creation.

2. **Make the first contribution expressive.**
   [Finch's documented setup](https://help.finchcare.com/hc/en-us/articles/37779580853005-Creating-Your-Birb)
   starts with hatching and personalizing a companion. Its setup still contains
   several questions; the useful precedent is attachment through creation.
   [Paperless Post's card-making process](https://www.paperlesspost.com/design/cards)
   centers the card, text, envelope and stamp before adding guests. It does
   require an account; it is not evidence that all administration is postponed.
   **Apply:** put a recipient's name on the envelope and the giver's words on
   the paper. Let each contribution visibly change the actual gift.

3. **Support appearance, ease and personal meaning.**
   [NN/G's Three Pillars of User Delight](https://www.nngroup.com/articles/pillars-user-delight/)
   distinguishes visceral, behavioral and reflective delight.
   **Apply:** preserve the usability work while making the opening inviting and
   helping the giver recognize their own thoughtfulness in the result.
   Completion badges alone are not the emotional payoff.

4. **Offer cues without taking over authorship.**
   [NN/G on recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/)
   explains the value of visible cues over requiring everything to be recalled
   unaided.
   **Apply:** offer a few optional first-line ideas inside the writing surface.
   They are creative aids, not another required occasion/relationship quiz.
   Never silently replace someone's writing or imply an example is their note.

5. **A sequence of questions is not necessarily a conversation.**
   In a [2018 interview with Typeform's design leaders](https://recordings.designmatters.io/typeforms-ux-lead-and-chief-design-officer-on-conversational-uis-rebranding-and-brutalism/),
   they report a conversation-analysis expert describing their interfaces as
   more form-like than conversational.
   **Apply:** make answers produce meaningful visible changes. Avoid a scripted
   mascot interview or mandatory chat as a cosmetic substitute for a form.

6. **Motion should explain an action.**
   [Apple's motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion.md)
   favors purposeful, brief feedback that follows expectations.
   **Apply:** an envelope opening, a note taking shape, and a saved note folding
   away can explain what happened. Respect reduced motion and keep all actions
   immediately available. No praise for field completion, forced delays,
   autoplay sound, or success animation before a save is confirmed.

## Approved direction

Warm, tactile and quietly playful: an interactive little letter in the room.
The dog may be a small accomplice; the human message remains central.

- **Arrive:** “A little surprise, just for them.” Explain plainly that a note
  left in this room becomes something the recipient can discover.
- **Address:** one name on the envelope, with a visible result. The sender's
  name belongs at the signature, not in an initial pair of administrative fields.
- **Write:** the paper is the writing surface. Offer optional starting points
  such as an evening together, a thank-you, or the giver's own idea.
- **Sign:** collect the sender's name as part of finishing the letter.
- **Tuck away and share:** keep the room's working clues by default. Custom
  clues remain optional and reversible. Explain that saving creates a link
  for the giver to send; saving does not deliver a message automatically.

The dominant numbered checklist should give way to the changing gift itself.
Back navigation and direct editing must remain easy. The opening is actual
gift creation, not a new tutorial placed ahead of it.

## Requirements to preserve

- Native text inputs, persistent labels, keyboard access and clear focus.
  Paper styling must not become a canvas-only or drag-only editor.
- A comfortable phone layout, including short viewports and virtual keyboards.
  Do not let decoration crowd the writing surface or obscure primary actions.
- Names and messages render as text; paragraph breaks survive into the gift.
- Existing field limits, default clues, immutable saved editions and revocation.
- Drafts survive navigation, close/resume and the isolated recipient preview.
  Ordinary unsaved drafts currently live in page memory; do not claim durable
  saving across refresh unless that separately implemented behavior is verified.
- Only an explicit final save creates a recipient link. Preview never publishes.
  Freeze controls during saving; preserve text and retry identity on failure.
- The recipient link and private management link stay clearly distinguished.
  The pilot remains free, without checkout, email delivery or new accounts.

## What to learn from people

Compare the first 30–60 seconds of the letter-led opening with the earlier form,
varying which version people see first. Give a neutral task and do not name the
preferred design. Ask “What does this experience remind you of?”, “What do you
expect to happen next?” and “Would you want to continue? Why?”

Observe whether people understand the gift, willingly begin personalizing it,
can revise their choices, and feel ownership of the result. Follow with real
giver–recipient sessions to learn what the room adds to receiving the message.
Small sessions provide qualitative direction, not conversion-rate evidence.

## Implemented and published (2026-11-22, source `b839209`)

Post-release fixes shipped 2026-11-22 in source `cf498a4` (Worker
`7febf89f-d567-4994-a423-d04a6c0b0a67`): contextual "Look from here" /
clue hints no longer outlive their moment, the composer follows the
visual viewport so mobile keyboards and pinch zoom keep the footer
actions reachable, onboarding copy was shortened, and "Tuck it away"
became "Create gift link". Verified locally and by public asset smoke;
real-phone keyboard checks remain open. The personal-photo hunt that
grew from the same feedback is specified in `PHOTO-HUNT.md` and
implemented behind `?photo=1` (local verification only, not deployed).


The letter-led composer described above now exists in `dog-gift-tabletop`,
live at [the giver entry](https://enigmagift-room.trustfall.workers.dev/?make=1) (verified
2026-11-22): a transparent dialog over the dimmed room holds an envelope
(the recipient's name) and a lined letter (note + signature), routed
envelope → letter → gift with the clue trail as an optional detour.
Selecting an optional starter inserts an unfinished first line. It never
replaces user-edited text, and the giver must finish the line before
saving. The choices hide while they write and return if the field is
cleared. Verified live: new assets served, the envelope-first route and
Enter advance, starter insert/finish guidance, close/resume, preview with
preserved line breaks, and one create→recipient→revoke fixture.
Post-release fixes (pending release) renamed the primary action to
"Create gift link", moved the optional starters into the footer, made the
composer follow the visual viewport (compact under short heights, still
native zoomable), and ended the dog's contextual hints with their moment
instead of leaving them pinned after the player moves on. The
research questions above remain open. The creator has supplied
feedback from people using the pilot; the structured comparison above
remains outstanding. The new viewport behavior still needs verification
on the reporting phones, and nothing here claims the delight hypothesis
is proven.
