export interface MediaConstraintsOptions {
  readonly video: boolean;
  readonly audio: boolean;
}

const CAMERA_CONSTRAINTS: MediaTrackConstraints = { facingMode: 'user' };

/**
 * Ask the capture stack to clean the mic: echo from speakers, fan/keyboard
 * noise, and wild gain swings. Browsers ignore keys they do not implement.
 */
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function acquireLocalStream(options: MediaConstraintsOptions): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: options.video ? CAMERA_CONSTRAINTS : false,
    audio: options.audio ? AUDIO_CONSTRAINTS : false,
  });
}

export async function acquireCameraTrack(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: CAMERA_CONSTRAINTS });
  return stream.getVideoTracks()[0];
}

export async function acquireScreenTrack(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
  return stream.getVideoTracks()[0];
}

export function toggleTrack(stream: MediaStream, kind: 'audio' | 'video', enabled: boolean): void {
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
  for (const track of tracks) {
    track.enabled = enabled;
  }
}
