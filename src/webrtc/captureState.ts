export function trackIsLive(track: MediaStreamTrack | undefined): boolean {
  return (
    track !== undefined && track.readyState === 'live' && track.enabled && track.muted !== true
  );
}

export function microphoneOn(stream: MediaStream | null | undefined): boolean {
  return trackIsLive(stream?.getAudioTracks()[0]);
}

export function cameraOn(stream: MediaStream | null | undefined): boolean {
  return trackIsLive(stream?.getVideoTracks()[0]);
}

export type CameraTogglePlan = 'stop' | 'enable' | 'reopen' | 'open';

/**
 * What Start/Stop video should do.
 *
 * A picture that is actually showing stops. A live track that is only disabled
 * turns back on, so we do not ask the browser for a second camera. A live track
 * the OS has muted still holds the device: opening another capture queues
 * behind it and the button never finishes, so that track is released first.
 */
export function cameraTogglePlan(
  track: { readyState: string; enabled: boolean; muted?: boolean } | undefined,
): CameraTogglePlan {
  if (!track || track.readyState !== 'live') {
    return 'open';
  }
  if (track.muted === true) {
    return 'reopen';
  }
  return track.enabled ? 'stop' : 'enable';
}

export function describeMediaFailure(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : '';
  const message = cause instanceof Error ? cause.message : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Camera and microphone permission was blocked. Allow them for this site and join again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera or microphone was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'The camera is in use by another app. Close it and try again.';
  }
  if (name === 'media-timeout' || message === 'media-timeout') {
    return 'The camera or microphone did not respond. Try again.';
  }
  return 'Camera or microphone access failed.';
}
