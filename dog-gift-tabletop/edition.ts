/**
 * One room, many small editions. The world geometry is fixed; an edition is
 * only the words the hunt speaks. Draft previews stay in tab; explicit
 * creation saves an immutable edition to API.
 */

export const ROOM = {
  id: 'dog-dining-room',
  revision: '44124720',
  allowRemix: true,
} as const;

export interface GiftEdition {
  roomId: string;
  revision: string;
  to: string;
  from: string;
  /** what the dog says when tapped */
  dog: string;
  /** what a chair says when tapped */
  chair: string;
  /** the rear postcard's clue toward the dog */
  postcard: string;
  /** the rear ribbon/bookmark's keepsake line */
  memory: string;
  /** the unfolded invitation */
  invitation: string;
}

/** The shipping words — identical to the reviewed tabletop cut. */
export const CANONICAL: Readonly<GiftEdition> = Object.freeze({
  roomId: ROOM.id,
  revision: ROOM.revision,
  to: '',
  from: '',
  dog: 'From down here I can see a little paper edge. Want to look?',
  chair: 'A seat for you. Whoever’s keeping watch prefers the floor.',
  postcard: 'Look for the one who always keeps watch at floor level.',
  memory: 'A little keepsake, just for stopping to look.',
  invitation: 'Dinner for two. You choose the evening. I’ll take care of the rest.',
});

/**
 * Neutral starter for a giver's own draft. Deliberately empty names and a
 * plain reward — nothing from the canonical gift is carried across.
 */
export const makeDraft = (): GiftEdition => ({
  roomId: ROOM.id,
  revision: ROOM.revision,
  to: '',
  from: '',
  dog: 'From down here something pale is peeking over the table lip. Want to look?',
  chair: 'A seat saved for someone.',
  postcard: 'Look for the one who keeps watch at floor level.',
  memory: 'A little keepsake, just for stopping to look.',
  invitation: 'A gift, hidden where you can find it.',
});
