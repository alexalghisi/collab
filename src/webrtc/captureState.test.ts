import { describe, expect, it } from 'vitest';
import {
  cameraOn,
  cameraTogglePlan,
  describeMediaFailure,
  microphoneOn,
  microphoneUnmuted,
  trackIsLive,
} from './captureState';

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

  it('treats a live enabled microphone as unmuted even when the browser marks it muted', () => {
    const stream = {
      getAudioTracks: () => [{ readyState: 'live', enabled: true, muted: true }],
    } as unknown as MediaStream;

    expect(microphoneOn(stream)).toBe(false);
    expect(microphoneUnmuted(stream)).toBe(true);
    expect(microphoneUnmuted(null)).toBe(false);
  });
});

describe('cameraTogglePlan', () => {
  it('stops a camera that is showing and turns a disabled one back on', () => {
    expect(cameraTogglePlan({ readyState: 'live', enabled: true, muted: false })).toBe('stop');
    expect(cameraTogglePlan({ readyState: 'live', enabled: false, muted: false })).toBe('enable');
  });

  it('releases a muted camera before opening another, so Start does not hang', () => {
    expect(cameraTogglePlan({ readyState: 'live', enabled: true, muted: true })).toBe('reopen');
    expect(cameraTogglePlan({ readyState: 'live', enabled: false, muted: true })).toBe('reopen');
  });

  it('opens a camera when the track is missing or already ended', () => {
    expect(cameraTogglePlan(undefined)).toBe('open');
    expect(cameraTogglePlan({ readyState: 'ended', enabled: false })).toBe('open');
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
