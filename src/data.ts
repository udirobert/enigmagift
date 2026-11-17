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
  { id: 'eg-2019-pub', year: '2019', note: 'the pub, march' },
  { id: 'eg-2021-hirecar', year: '2021', note: 'the hire car' },
  { id: 'eg-2023-cafe-oct', year: '2023', note: 'the café, october' },
  { id: 'eg-2024-cafe-oct', year: '2024', note: 'the same café' },
  { id: 'eg-2026-summer', year: '2026', note: 'this summer' },
  { id: 'eg-2020-kitchen', year: '2020', note: 'the kitchen' },
  { id: 'eg-2022-beach', year: '2022', note: 'the beach' },
  { id: 'eg-2025-station', year: '2025', note: 'the station' },
];

export const mockUrl = (p: MockPhoto, w = 800, h = 1000) =>
  `https://picsum.photos/seed/${p.id}/${w}/${h}`;

export const mockGallery = () => MOCK_PHOTOS.map((p) => mockUrl(p, 640, 800));

/* ------------------------------ reading ---------------------------- */

export const readSteps = (n: number) => [
  `i read ${n} photo${n === 1 ? '' : 's'}`,
  'i found 3 details you can see, and 2 i’m guessing at',
  'i found the pub carpet, a number plate, and the same table in october',
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
    text: 'the hire car’s number plate — readable in two separate years',
    kind: 'seen',
    photo: 1,
    zoom: 2.6,
    focus: '62% 56%',
  },
  {
    text: 'the same café, the same table, every october since 2019',
    kind: 'seen',
    photo: 2,
    zoom: 1.5,
    focus: '50% 62%',
  },
  {
    text: 'in every photo, she is the one standing on your left',
    kind: 'inferred',
    photo: 4,
    zoom: 1.35,
    focus: '34% 42%',
  },
];

/* ---------------------------- recipient ---------------------------- */

export const THROUGHLINE =
  'in every photo from 2019 to 2026, she stands on your left.';

export interface RoundConfig {
  kicker: string;
  question: string;
  options: string[];
  answer: number;
}

export const ROUND_1: RoundConfig = {
  kicker: 'round one — the detail',
  question: 'what is this?',
  options: ['a number plate', 'the pub carpet', 'a train ticket'],
  answer: 0,
};

export const ROUND_2: RoundConfig = {
  kicker: 'round two — the connection',
  question: 'what do these two days share?',
  options: ['both were in october', 'both were rainy', 'both were birthdays'],
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
