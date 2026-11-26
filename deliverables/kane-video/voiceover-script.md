# EnigmaGift KaneCLI demo voiceover

## 01-title
EnigmaGift is a small live product with a deliberately strict deployment rule: the photo gift surface does not ship unless KaneCLI has just replayed it in a browser and produced evidence.

## 02-product-loop
It turns a meaningful photograph into a private treasure hunt. The giver chooses the photo, hides a folded note in one precise spot, writes a letter, and shares a link. The recipient hunts through the photograph, uses hints if they want them, finds the marker, and opens the note. For the hackathon the verified claim is intentionally narrow: this free single-photo journey, not the entire paid product.

## 03-creation
Here is the real creator flow in the deployed product. I choose a photograph, position the paper marker, add a clue and the private letter, review exactly what the recipient will see, and create the gift link. This is the same kind of user journey Kane is asked to replay: real Chrome, real controls, real upload normalization, and a real API-backed save. No mock interface and no idealized demo path.

## 04-recipient
The recipient receives only the link. They can tap the wrong place, search a named area, or ask for a hint. When they find the hiding spot, a folded note appears and the letter can be opened. The hunt can then be replayed. That small loop gives Kane meaningful behaviour to verify: visibility before and after discovery, gentle miss feedback, note contents, and controls that should not appear too early.

## 05-verification-design
The verification design starts in spec slash photo gift dot markdown. The requirements describe creation, preview, recipient discovery, resilience, and what is explicitly out of scope. The Kane suite turns that into thirteen committed browser tests, with forty-eight acceptance-criteria references on individual steps. That matters because a passing test is not just a vibe; it is tied back to a written product claim. Just as important, the claim does not pretend that Stripe, paid trails, generated worlds, or private management revocation are covered by this suite.

## 06-gate
The deploy gate is scripts slash verify room dot m j s. It serves the exact built room distribution locally, proxies the API in the same shape as production, regenerates fixture URLs for that origin, stages copies of the committed Kane tests, and replays them in headless Chrome. While Kane runs, the script validates the NDJSON event stream. It then writes verify report dot json: a machine-readable digest that either allows deployment to continue or blocks it. This is the key difference from a demo that merely says tests exist. Release authority is wired into the pipeline.

## 07-evidence
Kane's output is evidence, not vibes. The repository's evidence index links each fresh run row to a public Test Manager share. Green rows cover marker placement, clue limits, creation and review, and closed recipient links. The red rows are also visible. On deadline day Kane caught drift between the requirements, generated tests, and shipped UX: image-format wording, persistent-storage wording, an ambiguous control assertion, and an editing test whose final composite assertion referenced unresolved extracted booleans even after the browser reached the original gift. That failure is not hidden, because hiding it would destroy the point of the gate.

## 08-agent-loop
This is the repair loop that makes Kane useful to an AI coding agent. A change is made, Kane replays the browser, failures are reduced to a structured digest, and the agent can decide whether the product, the written requirement, or the generated test is wrong. Sometimes the right fix is product code. Sometimes it is correcting stale requirements. Sometimes it is repairing test extraction. The important part is that red evidence remains part of the public record while it is being triaged. Deployment is not a matter of confidence; it is a consequence of fresh, complete evidence.

## 09-close
So the submission is deliberately honest: one meaningful production surface, verified end-to-end, with public green and red evidence. EnigmaGift does not claim that the whole product is fully verified. It proves that a real browser journey can be placed behind a KaneCLI deployment gate, and that an AI agent can use Kane's output as a repair loop rather than as a decorative test report. The live demo and repository are public, and the verified scope requires no credentials.
