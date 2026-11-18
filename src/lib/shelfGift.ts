/* shelfGift — pure data and view math for the /studio/world shelf slice.
   Anchors, draft shape and every visible-word/outcome decision live here
   so the canvas, the no-WebGL path and the tests can never disagree. */

export type Item = 'bear' | 'frog' | 'pot' | 'box';
export type Hiding = Exclude<Item, 'bear'>;

export interface ShelfDraft {
  to: string;
  from: string;
  /** the bear's one line — the only guided nudge */
  line: string;
  memories: Record<Item, string>;
  /** the message inside the gift */
  gift: string;
  hiding: Hiding;
}

/* the Middlebury Teddy frame — both poster and stage share this exactly */
export const W = 450;
export const H = 375;
export const F = 400; // focal length, px
export const CX = 225;
export const CY = 187.5;

export const ITEMS: Record<Item, { name: string; openable: boolean }> = {
  bear: { name: 'the pink bear', openable: false },
  frog: { name: 'the frog', openable: true },
  pot: { name: 'the flowerpot', openable: true },
  box: { name: 'the slanted wooden box', openable: true },
};

/* approximate centres in the LEFT photo (im2), measured in px */
export const ANCHORS: Record<Item, { x: number; y: number }> = {
  bear: { x: 365, y: 75 },
  frog: { x: 176, y: 295 },
  pot: { x: 416, y: 307 },
  box: { x: 317, y: 189 },
};

export const SAMPLE_DRAFT: ShelfDraft = {
  to: 'Max',
  from: 'Jo',
  line: 'Come round my side. I put a little heart on the edge of the one you want.',
  memories: {
    bear: 'I have watched every hunt from up here. This time I left you a sign.',
    frog: 'You made him a paper passport so he could come on holiday.',
    pot: 'The cutting you swore would die. It outlived three flats.',
    box: 'Where the birthday stash always hid — badly.',
  },
  gift: 'Breakfast at our old spot on Sunday? My treat.',
  hiding: 'box',
};

/** pin projection: a left-photo pixel shifts left by its disparity as t→1 */
export function pinX(leftX: number, dispPx: number, t: number): number {
  return leftX - t * dispPx;
}

/** depth of a left-photo pixel in the stage's world units */
export function anchorDepth(dispGray: number): number {
  const d = dispGray / 4;
  return 400 / d;
}

/** triangle winding for one grid quad — x-right, y-up world needs
 *  (v00,v11,v10)/(v00,v01,v11) so faces look back at the camera (+Z) */
export function quadTris(v00: number, v10: number, v01: number, v11: number): [number, number, number][] {
  return [
    [v00, v11, v10],
    [v00, v01, v11],
  ];
}

/** what a labelled description may honestly say from each end —
 *  the heart is only visible from the bear's side */
export function describeView(t: number, hiding: Hiding): string {
  if (t >= 0.6) {
    return `From the bear's side a tiny painted heart marks the edge of ${ITEMS[hiding].name}.`;
  }
  return 'From here the shelf faces you; no marks are visible on the fronts.';
}

export interface InspectResult {
  memory: string;
  correct: boolean;
  nudge: string | null;
}

/** inspecting is always free and never tips the answer — only an
 *  explicit completed Open says whether the gift was there */
export function inspectItem(item: Item, draft: ShelfDraft): InspectResult {
  const memory = draft.memories[item];
  if (item === 'bear') {
    return { memory, correct: false, nudge: draft.line };
  }
  return { memory, correct: item === draft.hiding, nudge: null };
}

export const emptyDraft = (): ShelfDraft => ({
  to: '',
  from: '',
  line: SAMPLE_DRAFT.line,
  memories: { bear: '', frog: '', pot: '', box: '' },
  gift: '',
  hiding: 'box',
});

export function validateDraft(d: ShelfDraft): string[] {
  const errors: string[] = [];
  if (!d.to.trim()) errors.push('who it is for');
  if (!d.from.trim()) errors.push('who it is from');
  if (!d.gift.trim()) errors.push('the message inside the gift');
  if (!d.line.trim()) errors.push("the bear's line");
  if (!d.memories[d.hiding].trim()) errors.push(`a memory for ${ITEMS[d.hiding].name}`);
  return errors;
}
