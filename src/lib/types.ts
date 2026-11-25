/* ------------------------------------------------------------------ */
/*  API types — mirror the backend contract (server/index.js           */
/*  giftPayload / trailPayload / pipeline.js round shape).             */
/* ------------------------------------------------------------------ */

export type GiftStatus = 'reading' | 'ready' | 'sealed' | 'paid' | string;

export type GiftDirection = 'someone' | 'me';

/** digital (The Trail, default) = no physical hide, no code; physical (The Hide) = code gate */
export type GiftMode = 'digital' | 'physical';

/** commercial tiers: trail £4.99 · hide £9.99 · set £19 (pack of 3) */
export type Tier = 'trail' | 'hide' | 'set';

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
  /** the giver's own words, read at the reveal — null until they write them */
  message?: string | null;
  signature?: string | null;
  paid?: boolean;
  worldStatus?: WorldStatus;
  worldSource?: number | null;
  mode?: GiftMode;
  tier?: Tier | null;
  packId?: string | null;
  reclueCount?: number;
  createdAt?: string;
}

export interface CreateGiftResult {
  giftId: string;
  status: 'reading';
}

/* ------------------------- giver dashboard ------------------------- */

/** GET /api/gifts/:id/overview — status, recipient link, derived stats, events.
 *  Never carries clues/rounds/answers/unlock hashes. */
export interface GiftOverview {
  gift: {
    id: string;
    status: GiftStatus;
    direction?: GiftDirection;
    tier: Tier | null;
    mode: GiftMode;
    paid: boolean;
    photoCount: number;
    worldStatus: WorldStatus;
    portraitStatus: string;
    packId: string | null;
    hasLetter?: boolean;
    createdAt?: string;
  };
  trail: {
    token: string;
    url: string;
    unlocked: boolean;
    expiresAt: string | null;
    createdAt?: string;
  } | null;
  pack: { id: string; creditsLeft: number } | null;
  stats: {
    opened: number;
    picks: { round: number; correct: boolean; attempts: number }[];
    sharedBack: boolean;
    looks: number | null;
    mins: number | null;
    unlocked: boolean;
  };
  events: { name: string; data: Record<string, unknown>; at?: string }[];
}

/* ------------------------------ trail ------------------------------ */

/** One round of the recipient trail — shape from pipeline.buildRounds. */
export interface TrailRound {
  kicker: string;
  question: string;
  options: string[];
  /** index into options — the answer key. Stripped from the client payload;
   * the server checks answers in POST /api/trail/:token/answer, so this is
   * only ever present on the scripted demo rounds. */
  correct?: number;
  cropPhotoIndex?: number;
  crop?: [number, number, number, number];
  cropPhotoIndex2?: number;
  crop2?: [number, number, number, number];
}

export interface Trail {
  token: string;
  rounds: TrailRound[];
  /** Hide tier only — where the giver hid the thing ("behind the third stair") */
  hideHint?: string | null;
  throughline: string | null;
  placeGuess: string | null;
  /** the giver's own letter — digital gifts only; The Hide receives it on unlock */
  message?: string | null;
  signature?: string | null;
  unlocked: boolean;
  /** false for digital gifts (The Trail) — the keepsake opens without a code */
  requiresCode?: boolean;
  mode?: GiftMode;
  tier?: Tier | null;
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
  /** ISO date the link opens (scheduled send, Phase 1b) */
  sendAt?: string | null;
  /** Hide fallback — after this date the keepsake opens without the code */
  fallbackAt?: string | null;
}
