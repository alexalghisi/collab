import { describe, expect, it } from 'vitest';
import { cameraOn, describeMediaFailure, microphoneOn, trackIsLive } from './captureState';

function track(readyState: MediaStreamTrackState, enabled: boolean): MediaStreamTrack {
  return { readyState, enabled } as MediaStreamTrack;
}

describe('trackIsLive', () => {
  it('is on only while the track is live and enabled', () => {
    expect(trackIsLive(track('live', true))).toBe(true);
    expect(trackIsLive(track('live', false))).toBe(false);
    expect(trackIsLive(track('ended', true))).toBe(false);
    expect(
      trackIsLive({ readyState: 'live', enabled: true, muted: true } as MediaStreamTrack),
    ).toBe(false);
    expect(trackIsLive(undefined)).toBe(false);
  });

  it('reads the microphone and camera from the first track of each kind', () => {
    const stream = {
      getAudioTracks: () => [track('live', true)],
      getVideoTracks: () => [track('live', false)],
    } as unknown as MediaStream;

    expect(microphoneOn(stream)).toBe(true);
    expect(cameraOn(stream)).toBe(false);
    expect(microphoneOn(null)).toBe(false);
  });
});

describe('describeMediaFailure', () => {
  it('names a blocked permission, a missing device, and a camera held by another app', () => {
    expect(describeMediaFailure(new DOMException('no', 'NotAllowedError'))).toMatch(/permission/i);
    expect(describeMediaFailure(new DOMException('no', 'NotFoundError'))).toMatch(/no camera/i);
    expect(describeMediaFailure(new DOMException('no', 'NotReadableError'))).toMatch(
      /another app/i,
    );
    expect(describeMediaFailure(new Error('media-timeout'))).toMatch(/did not respond/i);
  });
});
