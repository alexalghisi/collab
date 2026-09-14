export interface MediaConstraintsOptions {
  readonly video: boolean;
  readonly audio: boolean;
}

const CAMERA_CONSTRAINTS: MediaTrackConstraints = { facingMode: 'user' };

/**
 * Asks the platform for a cleaned-up microphone: without these, a laptop in a
 * room with its speakers on sends back its own output as a hum, and a fan or an
 * air conditioner is carried into the call at full level.
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

export async function acquireScreenTrack(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  return stream.getVideoTracks()[0];
}

export function toggleTrack(stream: MediaStream, kind: 'audio' | 'video', enabled: boolean): void {
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
  for (const track of tracks) {
    track.enabled = enabled;
  }
}
