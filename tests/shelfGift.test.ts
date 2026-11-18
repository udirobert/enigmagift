import assert from 'node:assert/strict';
import {
  ANCHORS,
  ITEMS,
  SAMPLE_DRAFT,
  describeView,
  inspectItem,
  pinX,
  quadTris,
  anchorDepth,
  validateDraft,
  type Item,
} from '../src/lib/shelfGift.ts';

let n = 0;
const ok = (cond: boolean, name: string) => {
  assert.ok(cond, name);
  n++;
};

/* projection: t=0 is exactly the original photo pixel */
for (const it of Object.keys(ANCHORS) as Item[]) {
  const a = ANCHORS[it];
  ok(pinX(a.x, 37.5, 0) === a.x, `pinX t=0 is photo pixel for ${it}`);
  ok(pinX(a.x, 37.5, 1) === a.x - 37.5, `pinX t=1 shifts by disparity for ${it}`);
  ok(pinX(a.x, 37.5, 0.5) === a.x - 18.75, `pinX midpoint for ${it}`);
}

/* hiding change retargets the right-side observation; left never names it */
ok(describeView(1, 'box').includes(ITEMS.box.name), 'right view names the hiding object');
ok(!describeView(1, 'box').includes(ITEMS.frog.name), 'right view names only the hiding object');
ok(!describeView(1, 'frog').includes(ITEMS.box.name), 'changing hiding changes the mark');
ok(!describeView(0.4, 'box').includes('heart'), 'left view does not reveal the heart');
ok(!describeView(0.4, 'frog').includes('heart'), 'left view never names an answer');

/* inspection never opens the gift; wrong objects stay wrong forever */
for (const it of ['frog', 'pot'] as Item[]) {
  const r = inspectItem(it, SAMPLE_DRAFT);
  ok(!r.correct, `inspecting ${it} never grants the gift`);
  ok(r.memory.length > 0, `${it} still gives its memory`);
}
ok(inspectItem('box', SAMPLE_DRAFT).correct, 'hiding object marks correct');
ok(inspectItem('bear', SAMPLE_DRAFT).nudge === SAMPLE_DRAFT.line, 'bear gives its line, not the answer');
for (const it of ['frog', 'pot', 'box'] as Item[]) {
  ok(inspectItem(it, SAMPLE_DRAFT).nudge === null, `inspecting ${it} never tips right or wrong`);
}

/* a different hiding flips the outcome automatically */
const moved = { ...SAMPLE_DRAFT, hiding: 'frog' as const };
ok(inspectItem('frog', moved).correct, 'hiding=frog marks frog correct');
ok(!inspectItem('box', moved).correct, 'hiding=frog unmarks box');

/* sample draft validates */
ok(validateDraft(SAMPLE_DRAFT).length === 0, 'sample draft is valid');
ok(validateDraft({ ...SAMPLE_DRAFT, gift: ' ' }).includes('the message inside the gift'), 'empty gift is caught');
ok(validateDraft({ ...SAMPLE_DRAFT, line: '  ' }).includes("the bear's line"), 'edited witness line is required');

/* mesh winding: x-right, y-up quads must face the camera (+Z) —
 * regression for the back-facing triangle bug */
{
  // one quad in world space: v00 top-left, v10 right, v01 below (y down on
  // the photo = -Y in world), all at z = -5; camera sits at origin
  const p = [[0, 0, -5], [1, 0, -5], [0, -1, -5], [1, -1, -5]];
  const verts = (idx: number[]) => idx.map((i) => p[i] as number[]);
  for (const tri of quadTris(0, 1, 2, 3)) {
    const [a, b, c] = verts(tri);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nz = u[0] * v[1] - u[1] * v[0];
    ok(nz > 0, `triangle ${tri} faces the camera`);
  }
}

/* every emitted position stays finite — no NaN leaks into bounds */
for (const it of Object.keys(ANCHORS) as Item[]) {
  for (const gray of [0, 4, 40, 255]) {
    const z = gray === 0 ? NaN : anchorDepth(gray);
    ok(gray === 0 ? !Number.isFinite(z) : Number.isFinite(z) && z > 0,
      `depth stays sane at gray=${gray}`);
  }
  ok(Number.isFinite(pinX(ANCHORS[it].x, 20, 0.5)), `${it} pin stays finite`);
}

console.log(`${n} shelfGift assertions passed`);
