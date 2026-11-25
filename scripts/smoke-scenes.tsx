/**
 * Scene smoke test — renders the scenes that carry the flow (door, editor,
 * seal) with react-dom/server and asserts the structure the flow depends on:
 * the editor opens on the review card (not the authoring grid), there is
 * exactly one affirmative control, and the door shows one active tier with
 * the others behind the expander. Catches the JSX/state slips that `tsc` and
 * a build both wave through.
 *
 *   npm run smoke:scenes
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Door } from '../src/scenes/Door';
import { Editor } from '../src/scenes/Editor';
import { Seal } from '../src/scenes/Seal';
import type { Gift } from '../src/lib/types';

const noop = () => {};

const gift: Gift = {
  id: 'g1',
  status: 'ready',
  photoCount: 3,
  clues: [
    { id: 'c1', text: 'a green door, paint blistering at the base', kind: 'seen', photoIndex: 0, bbox: [0.1, 0.2, 0.5, 0.8] },
    { id: 'c2', text: 'a bench facing the water', kind: 'inferred', photoIndex: 1 },
  ],
  hideSpots: [
    { id: 'h1', description: 'under the bench, against the left leg' },
    { id: 'h2', description: 'behind the loose stone by the door' },
  ],
};

const cases: Array<[string, () => string]> = [
  ['Editor · demo', () => renderToString(createElement(Editor, { demo: true, gift: null, mode: 'digital', onSeal: noop }))],
  ['Editor · real digital', () => renderToString(createElement(Editor, { demo: false, gift, mode: 'digital', onSeal: noop }))],
  ['Editor · real physical', () => renderToString(createElement(Editor, { demo: false, gift, mode: 'physical', onSeal: noop }))],
  ['Door · trail', () => renderToString(createElement(Door, { onPhotos: noop, onWatch: noop, direction: 'someone', onDirection: noop, tier: 'trail', onTier: noop }))],
  ['Door · hide', () => renderToString(createElement(Door, { onPhotos: noop, onWatch: noop, direction: 'someone', onDirection: noop, tier: 'hide', onTier: noop }))],
  ['Door · set', () => renderToString(createElement(Door, { onPhotos: noop, onWatch: noop, direction: 'me', onDirection: noop, tier: 'set', onTier: noop, initialSection: 'start' }))],
  ['Seal · trail (demo)', () => renderToString(createElement(Seal, { demo: true, giftId: null, kept: 3, tier: 'trail', mode: 'digital', onSend: noop }))],
  ['Seal · hide', () => renderToString(createElement(Seal, { demo: false, giftId: 'g1', kept: 3, tier: 'hide', mode: 'physical', onSend: noop, onTier: noop }))],
  ['Seal · set', () => renderToString(createElement(Seal, { demo: false, giftId: 'g1', kept: 3, tier: 'set', mode: 'physical', onSend: noop, onTier: noop }))],
  ['Seal · pack-owned', () => renderToString(createElement(Seal, { demo: false, giftId: 'g1', kept: 3, tier: 'trail', mode: 'digital', onSend: noop, onTier: noop, packOwned: true }))],
];

let failed = 0;
const checks: string[] = [];
for (const [name, run] of cases) {
  try {
    const html = run();
    checks.push(`${name}: ${html.length} bytes`);

    if (name === 'Editor · real digital') {
      if (!html.includes('clue-review-list')) throw new Error('review card missing');
      if (!html.includes('a green door')) throw new Error('review card does not list the clues');
      if (html.includes('clue-grid')) throw new Error('workbench open by default');
      if (html.includes('which photo becomes the world?')) throw new Error('world picker open by default');
      if (!html.includes('look closer')) throw new Error('no exception link');
      if (!html.includes('not quite right')) throw new Error('no reclue link');
      const primaries = html.split('looks right — continue').length - 1;
      if (primaries !== 1) throw new Error(`expected one primary, found ${primaries}`);
    }
    if (name === 'Editor · demo') {
      // demo has no live gift: the review card renders, the reclue link does not
      if (!html.includes('clue-review-list')) throw new Error('review card missing in demo');
      if (html.includes('not quite right')) throw new Error('reclue offered with no live gift');
    }
    if (name.startsWith('Door · ')) {
      const tierSeg = html.slice(html.indexOf('aria-label="which gift"'));
      const active = (tierSeg.match(/is-active/g) ?? []).length;
      if (active !== 1) throw new Error(`expected 1 active tier button, found ${active}`);
      const pressed = (tierSeg.match(/aria-pressed="true"/g) ?? []).length;
      if (pressed !== 1) throw new Error(`expected 1 pressed tier, found ${pressed}`);
      const otherWaysOpen = html.includes('the hide · £9.99');
      if (name === 'Door · trail' && otherWaysOpen) throw new Error('second-tier row visible by default');
      if (name !== 'Door · trail' && !otherWaysOpen) throw new Error('other-ways row missing when tier != trail');
    }
    if (name === 'Seal · trail (demo)') {
      if (html.includes('seal-pay')) throw new Error('demo should not show the live till');
    }
    if (name.startsWith('Seal · ') && name !== 'Seal · trail (demo)') {
      if (!html.includes('seal-order')) throw new Error('order summary missing');
      // SSR splits interpolated text with comment markers, so read the row as
      // markup: how many tier buttons are in the group, and is one pressed
      const group = html.match(/<div class="seg dock-seg seal-tier"[\s\S]*?<\/div>/)?.[0];
      if (!group) throw new Error('tier selector missing at the live till');
      const buttons = (group.match(/<button/g) ?? []).length;
      const pressed = (group.match(/aria-pressed="true"/g) ?? []).length;
      if (pressed !== 1) throw new Error(`expected 1 pressed tier, found ${pressed}`);
      if (name === 'Seal · pack-owned') {
        // a hunt that came out of a pack cannot be sold a pack
        if (buttons !== 2) throw new Error(`pack-owned hunt offered ${buttons} tiers, want 2`);
        if (html.includes('£19')) throw new Error('a pack-owned hunt was offered a set');
      } else {
        if (buttons !== 3) throw new Error(`till offered ${buttons} tiers, want 3 (a set can be sold here)`);
      }
    }
  } catch (e) {
    failed += 1;
    checks.push(`${name}: FAILED — ${(e as Error).message}`);
  }
}
console.log(checks.join('\n'));
if (failed) {
  console.error(`\n${failed} smoke case(s) failed`);
  process.exit(1);
}
console.log('\nall smoke cases rendered');
