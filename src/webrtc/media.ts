export interface MediaConstraintsOptions {
  readonly video: boolean;
  readonly audio: boolean;
}

const CAMERA_CONSTRAINTS: MediaTrackConstraints = { facingMode: 'user' };

export function acquireLocalStream(options: MediaConstraintsOptions): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: options.video ? CAMERA_CONSTRAINTS : false,
    audio: options.audio,
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
