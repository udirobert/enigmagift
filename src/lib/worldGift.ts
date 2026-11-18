/* worldGift — pure data for the /studio/world prototype.
   Owns the draft shape, copy and puzzle independently of any renderer or
   provider, so the clue and the answer can never disagree. */

export type Page = 'cover' | 'play' | 'edit' | 'reveal';

export interface Draft {
  to: string;
  from: string;
  /** optional — one shared memory the giver adds */
  memory: string;
  /** the message waiting inside the gift */
  invitation: string;
  /** the word or phrase only the two of them know — the lock on the gift */
  secret: string;
}

export const LIMITS = { name: 40, memory: 140, invitation: 220, secret: 60 } as const;
export const MAX_CHANCES = 2;

export const SAMPLE_DRAFT: Draft = {
  to: 'Max',
  from: 'Jo',
  memory: 'Fish and chips on the wall here, that day the fog ate the bridge.',
  invitation: 'Same spot, same order, first Saturday of next month. My treat.',
  secret: 'fish and chips',
};

export const GULL_LINE =
  'You can’t miss what you already know. It is the thing we always ordered — say it, and the gift is yours.';

/* decoys frame the secret as a choice, never naming it */
export const PUZZLE_DECOYS = ['warm sourdough', 'ice cream'] as const;

/** the three guesses, in a stable order — correct sits between the decoys */
export function puzzleOptions(draft: Draft): string[] {
  return [PUZZLE_DECOYS[0], draft.secret, PUZZLE_DECOYS[1]];
}

export function missNudge(misses: number): string {
  if (misses === 1) return 'Not it. The memory holds the answer — read it again.';
  return 'Both wrong. I can show you — or open the gift whenever you like.';
}

export function validateDraft(d: Draft): string[] {
  const errors: string[] = [];
  if (!d.to.trim()) errors.push('who it is for');
  if (!d.from.trim()) errors.push('who it is from');
  if (!d.invitation.trim()) errors.push('the message inside the gift');
  if (!d.secret.trim()) errors.push('the secret word to guess');
  return errors;
}

export const emptyDraft = (): Draft => ({ to: '', from: '', memory: '', invitation: '', secret: '' });
