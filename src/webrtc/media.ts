export interface MediaConstraintsOptions {
  readonly video: boolean;
  readonly audio: boolean;
}

/**
 * Ask for a real 720p picture (1080p when the camera and the machine can give
 * it) at a smooth 30 fps, instead of whatever low default the platform picks.
 * `ideal` rather than `exact` so a weaker webcam still opens.
 */
export const CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'user',
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
};

/**
 * Ask the capture stack to clean the mic: echo from speakers, fan/keyboard
 * noise, and wild gain swings. `voiceIsolation` is the stronger, newer filter
 * that keeps the voice and drops the room; browsers ignore keys they do not
 * implement. The full 48 kHz band is what makes a voice sound present rather
 * than telephone-thin.
 */
export const AUDIO_CONSTRAINTS: MediaTrackConstraints & { voiceIsolation?: boolean } = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceIsolation: true,
  channelCount: 1,
  sampleRate: 48000,
};

/** Shared text has to stay legible, so resolution beats frame rate here. */
const SCREEN_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1920, max: 2560 },
  height: { ideal: 1080, max: 1440 },
  frameRate: { ideal: 15, max: 30 },
};

/**
 * Tells the encoder what it is looking at, so it spends bits the way this kind
 * of picture needs: sharpness for shared text, smoothness for a face.
 */
function hintContent(track: MediaStreamTrack, hint: 'motion' | 'detail' | 'speech'): void {
  try {
    track.contentHint = hint;
  } catch {
    // Not implemented on this stack; the encoder keeps its own guess.
  }
}

export async function acquireLocalStream(options: MediaConstraintsOptions): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: options.video ? CAMERA_CONSTRAINTS : false,
    audio: options.audio ? AUDIO_CONSTRAINTS : false,
  });
  for (const track of stream.getAudioTracks()) {
    hintContent(track, 'speech');
  }
  for (const track of stream.getVideoTracks()) {
    hintContent(track, 'motion');
  }
  return stream;
}

export async function acquireCameraTrack(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: CAMERA_CONSTRAINTS });
  const track = stream.getVideoTracks()[0];
  hintContent(track, 'motion');
  return track;
}

export async function acquireScreenTrack(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: SCREEN_CONSTRAINTS,
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  hintContent(track, 'detail');
  return track;
}

export function toggleTrack(stream: MediaStream, kind: 'audio' | 'video', enabled: boolean): void {
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
  for (const track of tracks) {
    track.enabled = enabled;
  }
}
