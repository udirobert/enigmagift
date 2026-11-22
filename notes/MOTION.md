# Motion for EnigmaGift

Research and design recommendations, 2026-11-22. These are recommendations,
not implemented behavior or evidence of improved conversion.

## The request

The giver should be able to look over and change a gift before sending
it. The user suggested “See what they see” in place of “Open recipient
link”, and asked for more approachable, less verbose language plus
research into delightful motion and transitions.

The accompanying implementation adds preview/edit actions to the saved
gift screen. Editing creates a new saved link; existing links remain
unchanged. This document covers the subsequent motion direction.

## Sources and what they support

- [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion.md)
  — purposeful, brief, precise feedback; movement consistent
  with the gesture and its reverse; optional motion; cancellation rather
  than making people wait. Apple cautions against unnecessary motion on
  frequently repeated interactions.
- [NN/G: The Role of Animation and Motion in UX](https://www.nngroup.com/articles/animation-purpose-ux/)
  — motion attracts attention and can distract. Its strongest use
  is explaining state, relationships and feedback, rather than filling
  time between screens.
- [NN/G: Animation for Attention and Comprehension](https://www.nngroup.com/articles/animation-usability/)
  — consider the user’s current focus, what the movement communicates,
  how often it repeats, and whether the user triggered it.
- [NN/G: Executing UX Animations](https://www.nngroup.com/articles/animation-duration/)
  — frequency affects the appropriate subtlety and duration; movement,
  scale and easing need to fit the action rather than follow one global
  animation preset.
- [Material 3: How motion works](https://m3.material.io/styles/motion/overview/how-it-works)
  — the current guidance describes the M3 Expressive spring system
  introduced in May 2025: stiffness, damping and initial velocity, with
  expressive and standard schemes. A spring is a way to maintain
  responsive continuity; it does not require visible bouncing.
- [Material 3: Easing and duration](https://m3.material.io/styles/motion/easing-and-duration)
  — explicitly marked as superseded by the physics system for updated
  products. Do not present its older timing table as a universal optimum.
- [web.dev: SPA view transitions](https://web.dev/learn/css/view-transitions-spas)
  — shared visual continuity during DOM replacement; feature detection
  and an immediate fallback are necessary.
- [web.dev: Reduced motion](https://web.dev/articles/prefers-reduced-motion)
  and [Animation and motion accessibility](https://web.dev/learn/accessibility/motion)
  — support the OS preference and preserve meaning without movement.

These are design and engineering guidelines. They do not demonstrate
that animation will make this particular gift more meaningful.

## Direction: paper you can handle

Keep the photograph and note as continuous objects while the giver works.
The room or photo is the setting; the letter is the thing being made.
Keep the surrounding controls still. Let movement explain the giver’s
action, then stop so their own words receive the attention.

Recommended moments:

1. **Choose the photo.** Once decoding succeeds, the chosen image settles
   into the existing paper mount. Retain the mount rather than replacing
   the whole page with an unrelated panel. Never fake loading progress.
2. **Place the note.** The note responds at the chosen spot immediately,
   with a small settling motion. Repositioning travels from the previous
   spot. No dragging requirement: taps and keyboard placement remain.
3. **Move from spot to clue.** The same photo reduces into the context
   image beside the clue. Keep the selected spot attached to the actual
   photo coordinates. This explains what the clue is for.
4. **Write the letter.** Give the paper one short arrival. Keep names,
   lines, caret, counters and footer steady during typing. Keyboard,
   visual-viewport and orientation adjustments happen without animation.
5. **Save successfully.** Only after the server confirms the save, allow
   the letter to fold or settle into the ready view. Show “See what they
   see” and “Make changes” immediately; no animation should gate them.
   Keep the original paper visible during the request, and on failure.
   A soft fold should still look reopenable; a final-looking seal would
   work against the invitation to make changes.
6. **Discover and open.** Finding the correct spot reveals a folded note.
   Opening gives that note a short unfolding gesture, then presents the
   readable letter. Avoid zooming the whole photograph toward the viewer.
7. **Return and revise.** Reverse the visual relationship where useful.
   Returning to the same draft should not replay the welcome sequence.

The two moments worth the most expression are placing the note and
opening it. Ordinary navigation, copy feedback and repeat editing should
stay restrained. Do not pulse the share button or add confetti merely
because someone completed fields.

## Proposed starting values

These are EnigmaGift prototype choices to test, not measured findings:

| Use | Starting range | Behavior |
| --- | --- | --- |
| Press/selection feedback | 80–140 ms | Immediate response, small change |
| Step/content transition | 160–240 ms | Short displacement, soft arrival |
| Note fold/unfold | 280–360 ms | One readable gesture, interruptible |

Use deceleration on arrival, faster departures, and consistent origins.
If a spring is used, start highly damped. Avoid bounce on writing fields
or reading surfaces. Repeated input should retarget or finish the current
movement, never queue a sequence of overdue animations.

## Small details that matter

- **Keep the setting stable.** Photo → hiding spot can keep the image at
  the same size; the tap itself supplies the feedback. Hide → clue can
  move that image into a smaller context view, because it is no longer
  the active placement surface.
- **Keep the letter readable.** A folded corner relaxing and a slight
  settling of the paper can suggest opening without enlarging a tiny
  marker into a full-screen zoom. The words should appear together,
  with stable line wrapping, rather than being typed out theatrically.
- **Keep the controls dependable.** Buttons, Back, and the typing caret
  should never chase a moving panel. Cancel an active transition when
  keyboard or viewport changes would invalidate its geometry.
- **Give secondary motion a reason.** A small change in the paper’s
  shadow can support a lifting corner. Staggering every field and button
  simply prolongs the wait. Controls should be usable from the start.
- **Respect repetition.** First discovery can receive a slightly fuller
  gesture; replay, corrections and Back should use shorter motion or
  the settled state. Keep a still, accessible equivalent for every cue.
- **Keep clues contextual.** A clue can appear beside the object it
  refers to and leave when that interaction ends. Motion should not
  resurrect a spent clue or pin it somewhere unrelated.
- **Make misses gentle.** A short nudge is enough when someone tries the
  wrong spot. Avoid a shaking error treatment that makes exploring feel
  like a failed form submission.

## Implementation considerations

- The photo app replaces `#phStage` content in `renderStep`; a small
  transition wrapper or progressive View Transition enhancement can
  connect those states. Keep the header/footer outside that transition.
- Prefer transforms and opacity for decorative layers. Preserve the
  authoritative layout and hit geometry; do not derive the hiding spot
  from an in-flight visual transform.
- Existing GSAP in the React app can support its transitions. The
  lightweight photo app does not need a new animation framework.
- Inspect existing React entrances before adding more. `Seal.tsx` uses
  0.9-second staggered entrances and a separate 1.1-second seal arrival;
  its preview action also includes a seal animation and delayed navigation.
  These can make repeated actions feel slower. No timings have changed in
  the copy pass.
- With reduced motion, change state immediately and retain visible text,
  focus, selected states and success/error messages. Do not depend on an
  animation-end event for application correctness.
- No blanket `transition: all`, animation of viewport fitting, movement
  on every keystroke, hover-only cues, decorative looping, or new sound
  or haptic assumptions.

## Before implementation

Next, prototype one connected sequence:
photo → chosen spot → clue → note → ready → recipient reveal.
Compare it with the current flow using genuine gifts and real phones.
Observe whether people know what changed, can interrupt/backtrack, keep
their writing focus, and want to continue. Ask what felt personal and what
felt slow or distracting. A visually attractive recording alone does not
prove usability or emotional delight.
