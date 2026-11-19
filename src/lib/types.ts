/* ------------------------------------------------------------------ */
/*  API types — mirror the backend contract (server/index.js           */
/*  giftPayload / trailPayload / pipeline.js round shape).             */
/* ------------------------------------------------------------------ */

export type GiftStatus = 'reading' | 'ready' | 'sealed' | 'paid' | string;

export type GiftDirection = 'someone' | 'me';

/** One located thing inside a photo (inside an observation row). */
export interface ObsItem {
  description?: string;
  category?: string;
  bbox?: [number, number, number, number]; // x, y, w, h — normalised 0..1
  confidence?: number;
  hideSpotPotential?: boolean;
}

/**
 * One observation row per uploaded photo: {photoIndex, placeType,
 * observations: ObsItem[]}. Only present once status !== 'reading'.
 */
export interface ApiObservation {
  photoIndex: number;
  placeType?: string;
  observations?: ObsItem[];
}

/**
 * A clue the agent proposed. The server spreads clue meta flat onto the
 * row, so real payloads carry photoIndex / bbox / basis alongside id+text.
 */
export interface Clue {
  id: string;
  text: string;
  kind?: 'seen' | 'inferred';
  photoIndex?: number;
  bbox?: [number, number, number, number];
  category?: string;
  confidence?: number;
  basis?: string;
}

export type ApiClue = Clue;

/** A proposed place to physically hide the thing. */
export interface HideSpot {
  id: string;
  description: string;
  /** index into the uploaded photos (sorted order), or null */
  basedOnObservation?: number | null;
  confidence?: number;
}

export type WorldStatus = 'pending' | 'worlding' | 'ready' | 'failed' | string;

export interface Gift {
  id: string;
  status: GiftStatus;
  direction?: GiftDirection;
  photoCount: number;
  /** how many photos have been read — live while status is 'reading' */
  photosObserved?: number;
  observations?: ApiObservation[];
  clues?: Clue[];
  hideSpots?: HideSpot[];
  throughline?: string | null;
  placeGuess?: string | null;
  paid?: boolean;
  worldStatus?: WorldStatus;
  createdAt?: string;
}

export interface CreateGiftResult {
  giftId: string;
  status: 'reading';
}

/* ------------------------------ trail ------------------------------ */

/** One round of the recipient trail — shape from pipeline.buildRounds. */
export interface TrailRound {
  kicker: string;
  question: string;
  options: string[];
  /** index into options — the server-side answer key */
  correct: number;
  cropPhotoIndex?: number;
  crop?: [number, number, number, number];
  cropPhotoIndex2?: number;
  crop2?: [number, number, number, number];
}

export interface Trail {
  token: string;
  rounds: TrailRound[];
  throughline: string | null;
  placeGuess: string | null;
  unlocked: boolean;
  /** /api/photo/:giftId/:i urls in upload order, when the server provides them */
  photoUrls?: string[];
  /** the 3D world of the place — 'worlding' while it's being generated */
  worldStatus?: WorldStatus;
  /** /api/trail/:token/world — streams the GLB once the world is ready */
  worldUrl?: string | null;
  /** the keepsake portrait — 'painting' while it's being drawn */
  portraitStatus?: string;
  /** /api/trail/:token/portrait — streams the painted portrait once ready */
  portraitUrl?: string | null;
}

export interface SealResult {
  trailToken: string;
  trailUrl: string;
  /** the code the buyer writes into the hidden thing (server extension) */
  unlockCode?: string;
}
