export interface MediaConstraintsOptions {
  readonly video: boolean;
  readonly audio: boolean;
}

const CAMERA_CONSTRAINTS: MediaTrackConstraints = { facingMode: 'user' };

/**
 * The microphone is asked for with the browser's own cleanup switched on
 * rather than left to whatever the default happens to be. Without it a laptop
 * carries its fan, the mains hum and the other participants coming back out of
 * its speakers into the room as a constant background buzz.
 */
export const MICROPHONE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function acquireLocalStream(options: MediaConstraintsOptions): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: options.video ? CAMERA_CONSTRAINTS : false,
    audio: options.audio ? MICROPHONE_CONSTRAINTS : false,
  });
}

export async function acquireCameraTrack(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: CAMERA_CONSTRAINTS });
  return stream.getVideoTracks()[0];
}

/** Video only: capturing the screen's audio too would put the call back into itself. */
export async function acquireScreenTrack(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  return stream.getVideoTracks()[0];
}

export function toggleTrack(stream: MediaStream, kind: 'audio' | 'video', enabled: boolean): void {
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
  for (const track of tracks) {
    track.enabled = enabled;
  }
}
