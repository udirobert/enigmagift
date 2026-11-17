# EnigmaGift — craft references

Mined from Codrops hub (page 3, Aug 2026) + prior portfolio patterns.
Each Codrops demo ships source on GitHub — clone/tap as needed.

## Directly relevant demos

| Demo | Repo | Why it matters for us |
|---|---|---|
| **Scroll-Driven 3D Gallery Along Blender Path** (Three.js + GSAP) | github.com/GaspardHedde (linked from demo) | Camera travelling *through* imagery on a path — this is the flythrough grammar for the paid world/reveal |
| **Page Transitions with WebGPU and VanillaJS** (Ben Paine) | crnacura workers demo; source on Codrops article | Page-to-page transitions — our flow is upload → reading → editor → seal → reveal; each boundary needs a transition, not a cut |
| **3D Image Rotations on Scroll** (Manoela Ilic) | linked demo | Photos physically turning/revealing on scroll — the "step into the photo" beat |
| **Infinite Parallax Scroll with GSAP & Lenis** (Joe Ben Taylor) | linked demo | Lenis smooth-scroll baseline for the whole site |
| **Infinite Scroll Gallery with Page Transitions using GSAP** (Surya Aditya) | linked demo | Gallery grid + transitions — clue editor surface |
| **EaseReverseClipMenu** (Development) | tympanus.net/Development/EaseReverseClipMenu | Clip-path menu/button animations — the seal/unlock moment |
| **Thumbnail Flow Animation with GSAP MotionPath** (Iqbal Muthahhary) | madewithgsap.com/codrops | MotionPath for thumbnails → could drive clue crops |
| **HTML-in-Canvas Examples** (Vittorio Retrivi) | html-in-canvas.vercel.app | DOM-in-canvas distortion — experimental layer for the reveal |
| **Threejs-Punk Drive** / cursor-tiles-distortion | various vercel demos | Cursor-reactive distortion — use sparingly on hero |

## Baseline stack decision

- **Vite + React + TS**
- **GSAP + ScrollTrigger + MotionPath** (free since Webflow acquisition) — the Codrops workhorse
- **Lenis** for smooth scroll
- Plain CSS custom properties + keyframes for the art-directed layer
- Three.js / react-three-fiber only where DOM can't do it (photo-into-world later)
- LTX + Atlas are *backend* generation — the UI just needs to frame "your gift is being built" theatre well

## Art direction (draft — refine with first build)

- Warm dark field (deep ink/umber), cream paper text, single rust/amber accent — "keepsake box", not SaaS dashboard
- Serif display (Fraunces or similar) + humanist sans; second person, minimal copy
- Film grain overlay; photos get physicality — slight rotation, shadow, tape edge
- The seal = circular wax-seal motif that *breaks* on unlock
- Motion grammar: everything arrives like a letter being placed on a table, not a UI appearing
