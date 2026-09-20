import { describe, expect, it } from 'vitest';
import { INITIAL_PEER_STATE } from '../signaling/events';
import { videoPresentation } from './videoPresentation';

describe('videoPresentation', () => {
  it('crops a camera to the tile, which is what keeps a face filling it', () => {
    expect(videoPresentation(INITIAL_PEER_STATE, false)).toEqual({ fit: 'cover', mirror: false });
  });

  it('mirrors the local camera so the preview matches the person in front of it', () => {
    expect(videoPresentation(INITIAL_PEER_STATE, true)).toEqual({ fit: 'cover', mirror: true });
  });

  it('shows a shared screen whole rather than cropping part of it away', () => {
    const sharing = { ...INITIAL_PEER_STATE, screenSharing: true };

    expect(videoPresentation(sharing, false)).toEqual({ fit: 'contain', mirror: false });
  });

  it('never mirrors a shared screen, which would reverse its text', () => {
    const sharing = { ...INITIAL_PEER_STATE, screenSharing: true };

    expect(videoPresentation(sharing, true)).toEqual({ fit: 'contain', mirror: false });
  });
});
