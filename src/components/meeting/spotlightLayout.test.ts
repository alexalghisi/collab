import { describe, expect, it } from 'vitest';
import { INITIAL_PEER_STATE } from '../../signaling/events';
import {
  SHARE_HEIGHT_SHARE,
  activeScreenSharer,
  screenShareFirst,
  sharedScreenWidth,
  spotlightAfterShareChange,
  withoutSpotlit,
} from './spotlightLayout';

const camera = (peerId: string) => ({ peerId, state: INITIAL_PEER_STATE });
const sharing = (peerId: string) => ({
  peerId,
  state: { ...INITIAL_PEER_STATE, screenSharing: true },
});

describe('activeScreenSharer', () => {
  it('finds the participant presenting a screen', () => {
    expect(activeScreenSharer([camera('a'), sharing('b')])).toBe('b');
  });

  it('is null when everyone is on camera', () => {
    expect(activeScreenSharer([camera('a')])).toBeNull();
  });
});

describe('sharedScreenWidth', () => {
  it('is far wider than the 180px strip thumbnail on a laptop beside the editor', () => {
    expect(sharedScreenWidth(1000, 900, SHARE_HEIGHT_SHARE.strip)).toBeGreaterThanOrEqual(480);
  });

  it('keeps the height within its share of the window so the editor stays usable', () => {
    const width = sharedScreenWidth(4000, 900, SHARE_HEIGHT_SHARE.strip);

    expect((width * 9) / 16).toBeCloseTo(900 * SHARE_HEIGHT_SHARE.strip, 5);
  });

  it('never overflows the column it sits in', () => {
    expect(sharedScreenWidth(340, 900, SHARE_HEIGHT_SHARE.grid)).toBe(340);
  });

  it('dominates the room when there is no editor to make space for', () => {
    expect(sharedScreenWidth(1416, 900, SHARE_HEIGHT_SHARE.grid)).toBeGreaterThan(1000);
  });
});

describe('screenShareFirst', () => {
  const tiles: Array<[string, string]> = [
    ['self', 'S'],
    ['a', 'A'],
    ['b', 'B'],
  ];

  it('moves the presenter to the front', () => {
    expect(screenShareFirst(tiles, 'b').map(([key]) => key)).toEqual(['b', 'self', 'a']);
  });

  it('leaves the order alone when nobody presents', () => {
    expect(screenShareFirst(tiles, null)).toEqual(tiles);
  });
});

describe('withoutSpotlit', () => {
  it('drops the expanded tile: two players on one stream would echo its audio', () => {
    const tiles: Array<[string, string]> = [
      ['self', 'S'],
      ['a', 'A'],
    ];

    expect(withoutSpotlit(tiles, 'a').map(([key]) => key)).toEqual(['self']);
  });

  it('keeps every tile when nothing is expanded', () => {
    const tiles: Array<[string, string]> = [['self', 'S']];

    expect(withoutSpotlit(tiles, null)).toEqual(tiles);
  });
});

describe('spotlightAfterShareChange', () => {
  it('closes when the expanded presenter stops sharing', () => {
    expect(spotlightAfterShareChange('a', 'a', null)).toBeNull();
  });

  it('stays open while the presenter keeps sharing', () => {
    expect(spotlightAfterShareChange('a', 'a', 'a')).toBe('a');
  });

  it('stays open on a camera someone expanded while another person stops sharing', () => {
    expect(spotlightAfterShareChange('a', 'b', null)).toBe('a');
  });

  it('never opens on its own', () => {
    expect(spotlightAfterShareChange(null, null, 'a')).toBeNull();
  });
});
