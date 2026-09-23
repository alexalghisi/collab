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

/** How long we wait for the permission prompt before joining without that device. */
export const MEDIA_WAIT_MS = 8_000;

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function emptyStream(): MediaStream {
  return typeof MediaStream === 'undefined'
    ? ({
        getTracks: () => [],
        getVideoTracks: () => [],
        getAudioTracks: () => [],
      } as unknown as MediaStream)
    : new MediaStream();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('media-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

async function openUserMedia(
  video: boolean | MediaTrackConstraints,
  audio: boolean | MediaTrackConstraints,
  timeoutMs: number,
): Promise<MediaStream> {
  const pending = navigator.mediaDevices.getUserMedia({
    video,
    audio,
  });
  let stream: MediaStream;
  try {
    stream = await withTimeout(pending, timeoutMs);
  } catch (cause) {
    // Permission may still land after we gave up; do not keep that capture.
    void pending.then(stopTracks).catch(() => undefined);
    throw cause;
  }
  for (const track of stream.getAudioTracks()) {
    hintContent(track, 'speech');
  }
  for (const track of stream.getVideoTracks()) {
    hintContent(track, 'motion');
  }
  return stream;
}

function isMediaTimeout(cause: unknown): boolean {
  return cause instanceof Error && cause.message === 'media-timeout';
}

function isOverconstrained(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'OverconstrainedError';
}

async function openDevices(
  video: boolean | MediaTrackConstraints,
  audio: boolean,
  timeoutMs: number,
): Promise<MediaStream> {
  try {
    return await openUserMedia(video, audio ? AUDIO_CONSTRAINTS : false, timeoutMs);
  } catch (cause) {
    // Only loosen the microphone once the camera ask is already the loose one.
    // A strict camera failure must stay a camera failure, or the retry loop
    // asks for the same camera again.
    if (
      !audio ||
      isMediaTimeout(cause) ||
      !isOverconstrained(cause) ||
      (video !== false && video !== true)
    ) {
      throw cause;
    }
    return openUserMedia(video, true, timeoutMs);
  }
}

async function openCamera(audio: boolean, timeoutMs: number): Promise<MediaStream> {
  try {
    return await openDevices(CAMERA_CONSTRAINTS, audio, timeoutMs);
  } catch (cause) {
    // A stuck prompt is still open; a second getUserMedia would wait on it too.
    if (isMediaTimeout(cause)) {
      throw cause;
    }
    return openDevices(true, audio, timeoutMs);
  }
}

export async function acquireLocalStream(
  options: MediaConstraintsOptions,
  timeoutMs = MEDIA_WAIT_MS,
): Promise<MediaStream> {
  if (!options.video) {
    return openDevices(false, options.audio, timeoutMs);
  }
  return openCamera(options.audio, timeoutMs);
}

export async function acquireMicrophoneTrack(): Promise<MediaStreamTrack> {
  const stream = await openDevices(false, true, MEDIA_WAIT_MS);
  const track = stream.getAudioTracks()[0];
  if (!track) {
    throw new Error('no-microphone');
  }
  return track;
}

/**
 * Never blocks joining on a stuck permission prompt. Prefer camera+mic, then
 * mic only, then an empty stream the meeting controls can fill later.
 */
export async function acquireJoinStream(
  video: boolean,
  timeoutMs = MEDIA_WAIT_MS,
): Promise<MediaStream> {
  try {
    return await acquireLocalStream({ video, audio: true }, timeoutMs);
  } catch (cause) {
    if (isMediaTimeout(cause) || !video) {
      return emptyStream();
    }
    try {
      return await acquireLocalStream({ video: false, audio: true }, Math.min(timeoutMs, 2_000));
    } catch {
      return emptyStream();
    }
  }
}

export async function acquireCameraTrack(): Promise<MediaStreamTrack> {
  const stream = await openCamera(false, MEDIA_WAIT_MS);
  return stream.getVideoTracks()[0];
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
