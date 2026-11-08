import type { PeerState } from '../../signaling/events';

const SCREEN_ASPECT = 16 / 9;

/** How much of the window height a shared screen may take, by what shares the stage with it. */
export const SHARE_HEIGHT_SHARE = { strip: 0.3, grid: 0.7 } as const;

type Keyed<T> = readonly [string, T];

export function activeScreenSharer(
  participants: ReadonlyArray<{ peerId: string; state: PeerState }>,
): string | null {
  return participants.find(({ state }) => state.screenSharing)?.peerId ?? null;
}

/** Widest a 16:9 shared screen can be without leaving its column or its share of the height. */
export function sharedScreenWidth(
  availableWidth: number,
  windowHeight: number,
  heightShare: number,
): number {
  return Math.min(availableWidth, windowHeight * heightShare * SCREEN_ASPECT);
}

export function screenShareFirst<T>(
  tiles: ReadonlyArray<Keyed<T>>,
  sharer: string | null,
): ReadonlyArray<Keyed<T>> {
  const presenter = tiles.find(([key]) => key === sharer);
  return presenter ? [presenter, ...tiles.filter((tile) => tile !== presenter)] : tiles;
}

/** A participant's stream carries audio, so it must only ever be attached to one player. */
export function withoutSpotlit<T>(
  tiles: ReadonlyArray<Keyed<T>>,
  spotlit: string | null,
): ReadonlyArray<Keyed<T>> {
  return tiles.filter(([key]) => key !== spotlit);
}

/** An expanded screen has nothing left to show once its presenter stops sharing. */
export function spotlightAfterShareChange(
  spotlit: string | null,
  previousSharer: string | null,
  sharer: string | null,
): string | null {
  return spotlit !== null && spotlit === previousSharer && sharer !== spotlit ? null : spotlit;
}
