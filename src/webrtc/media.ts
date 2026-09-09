export interface MediaConstraintsOptions {
  readonly video: boolean;
  readonly audio: boolean;
}

export function acquireLocalStream(options: MediaConstraintsOptions): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: options.video ? { facingMode: 'user' } : false,
    audio: options.audio,
  });
}

export function toggleTrack(stream: MediaStream, kind: 'audio' | 'video', enabled: boolean): void {
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
  for (const track of tracks) {
    track.enabled = enabled;
  }
}
