/* ------------------------------------------------------------------ */
/*  Mock data — everything on screen is placeholder until a backend   */
/*  exists. Photos resolve to picsum seeds so crops stay consistent.   */
/* ------------------------------------------------------------------ */

export interface MockPhoto {
  id: string;
  year: string;
  note: string;
}

export const MOCK_PHOTOS: MockPhoto[] = [
  { id: 'eg-2019-pub', year: '2019', note: 'the pub on the corner' },
  { id: 'eg-2021-hirecar', year: '2021', note: 'the car park' },
  { id: 'eg-2023-cafe-oct', year: '2023', note: 'the café, october' },
  { id: 'eg-2024-cafe-oct', year: '2024', note: 'the same café' },
  { id: 'eg-2026-summer', year: '2026', note: 'the view from the bench' },
  { id: 'eg-2020-kitchen', year: '2020', note: 'the back door' },
  { id: 'eg-2022-beach', year: '2022', note: 'the beach hut' },
  { id: 'eg-2025-station', year: '2025', note: 'the station approach' },
];

export const mockUrl = (p: MockPhoto, w = 800, h = 1000) =>
  `https://picsum.photos/seed/${p.id}/${w}/${h}`;

export const mockGallery = () => MOCK_PHOTOS.map((p) => mockUrl(p, 640, 800));

/* ------------------------------ reading ---------------------------- */

export const readSteps = (n: number) => [
  `i read ${n} photo${n === 1 ? '' : 's'}`,
  'i found 3 details you can see, and 2 i’m guessing at',
  'i found the blue door, the chalkboard, and the same table in october',
  'i found one thing that runs through all of them',
  'i built the chain',
];

/* ------------------------------ editor ----------------------------- */

export type ClueKind = 'seen' | 'inferred';

export interface Clue {
  text: string;
  kind: ClueKind;
  photo: number; // index into the gallery
  zoom: number;
  focus: string; // object-position / transform-origin
}

export const CLUES: Clue[] = [
  {
    text: 'the blue door — the same shade in every photo since 2019',
    kind: 'seen',
    photo: 0,
    zoom: 2.6,
    focus: '62% 56%',
  },
  {
    text: 'the same table by the window, every october',
    kind: 'seen',
    photo: 2,
    zoom: 1.5,
    focus: '50% 62%',
  },
  {
    text: 'the light is warmest on the left — that’s where the good seats are',
    kind: 'inferred',
    photo: 4,
    zoom: 1.35,
    focus: '34% 42%',
  },
];

/* ---------------------------- recipient ---------------------------- */

export const THROUGHLINE =
  'every photograph was taken within a hundred metres of the blue door.';

export interface RoundConfig {
  kicker: string;
  question: string;
  options: string[];
  answer: number;
}

export const ROUND_1: RoundConfig = {
  kicker: 'round one — the detail',
  question: 'what is this?',
  options: ['the blue door', 'a chalkboard', 'a street sign'],
  answer: 0,
};

export const ROUND_2: RoundConfig = {
  kicker: 'round two — the connection',
  question: 'what do these two shots share?',
  options: ['both face the same corner', 'both were in october', 'both were rainy'],
  answer: 0,
};

export const NUDGES = [
  'not quite — look a little closer',
  'still warm — try once more',
  'one more look, then it opens anyway',
];

/* ------------------------------- seal ------------------------------ */

export const SEAL_LINK = 'enigmagift.link/ember-7f2a';
export const SEAL_CODE = 'ember';
