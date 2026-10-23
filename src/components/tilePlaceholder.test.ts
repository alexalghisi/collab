import { describe, expect, it } from 'vitest';
import { INITIAL_PEER_STATE, type PeerState } from '../signaling/events';
import { showsPlaceholder } from './tilePlaceholder';

function streamWith(video: Partial<MediaStreamTrack> | null): MediaStream {
  return {
    getVideoTracks: () => (video ? [video as MediaStreamTrack] : []),
  } as unknown as MediaStream;
}

function state(patch: Partial<PeerState> = {}): PeerState {
  return { ...INITIAL_PEER_STATE, ...patch };
}

describe('showsPlaceholder', () => {
  it('hides the avatar only while a camera track is live and enabled', () => {
    const live = streamWith({ readyState: 'live', enabled: true, muted: false });
    expect(showsPlaceholder(state(), live)).toBe(false);
    expect(showsPlaceholder(state(), streamWith({ readyState: 'live', enabled: false }))).toBe(
      true,
    );
    expect(showsPlaceholder(state(), streamWith({ readyState: 'ended', enabled: true }))).toBe(
      true,
    );
    expect(showsPlaceholder(state(), streamWith(null))).toBe(true);
  });

  it('keeps a shared screen visible even when the camera flag is off', () => {
    expect(showsPlaceholder(state({ screenSharing: true, videoOff: true }), streamWith(null))).toBe(
      false,
    );
  });
});
