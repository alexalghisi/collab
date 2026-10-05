import { onAppResumed } from './appFocus';

export type CaptureKind = 'audio' | 'video';

export interface CaptureSource {
  /** Whether this device should be live at all right now. */
  readonly wanted: () => boolean;
  /** Opens the device again. */
  readonly open: () => Promise<MediaStreamTrack>;
  /** Puts a fresh track in the local stream and on every peer connection. */
  readonly adopt: (track: MediaStreamTrack) => Promise<void>;
  /** The participant's own switch, so a device comes back as they left it. */
  readonly enabled: () => boolean;
}

export interface CaptureWatchOptions {
  readonly stream: MediaStream;
  readonly microphone: CaptureSource;
  readonly camera?: CaptureSource;
  readonly onRestored?: (kind: CaptureKind) => void;
  readonly onFailed?: (kind: CaptureKind) => void;
  /** Where "the app came back" comes from. The tests supply their own. */
  readonly onResume?: (listener: () => void) => () => void;
}

/**
 * A track that goes quiet without ending usually comes back by itself — a
 * notification chime borrowing the microphone for a moment. This is how long
 * to let it try before taking it as lost.
 */
export const MUTE_GRACE_MS = 1_500;

/** Another app may still be holding the device. Do not fight it in a loop. */
export const REOPEN_INTERVAL_MS = 4_000;

const KINDS: readonly CaptureKind[] = ['audio', 'video'];

/**
 * Keeps the local camera and microphone alive across a trip to another app.
 *
 * A phone takes capture away from an app the moment it leaves the screen, and
 * another app that wants the microphone — a call in a messenger — takes it even
 * while this one is in front. Neither gives it back: the track ends, or goes
 * silent for good, and the rest of the room hears nothing until the call is
 * rejoined. This notices and reopens the device, so leaving the app is no
 * longer the same thing as leaving the call. Only hanging up is.
 *
 * A device is only ever reopened if its track is already in the local stream.
 * Someone who joined without a microphone is not asked for one behind their
 * back, and a participant who turned their own camera off keeps it off.
 */
export function watchCapture(options: CaptureWatchOptions): () => void {
  const { stream, onRestored, onFailed } = options;
  const listenTo = options.onResume ?? onAppResumed;
  const detachers = new Map<CaptureKind, () => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const reopening = new Set<CaptureKind>();
  const lastReopen = new Map<CaptureKind, number>();
  let disposed = false;

  const sourceOf = (kind: CaptureKind): CaptureSource | undefined =>
    kind === 'audio' ? options.microphone : options.camera;

  const trackOf = (kind: CaptureKind): MediaStreamTrack | undefined =>
    (kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks())[0];

  const later = (run: () => void, ms: number): void => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) {
        run();
      }
    }, ms);
    timers.add(timer);
  };

  const reopen = async (kind: CaptureKind): Promise<void> => {
    const source = sourceOf(kind);
    const lost = trackOf(kind);
    if (disposed || !source || !lost || reopening.has(kind) || !source.wanted()) {
      return;
    }
    if (lost.readyState !== 'ended' && !lost.muted) {
      return;
    }
    const since = Date.now() - (lastReopen.get(kind) ?? 0);
    if (since < REOPEN_INTERVAL_MS) {
      return;
    }
    reopening.add(kind);
    lastReopen.set(kind, Date.now());
    try {
      const track = await source.open();
      if (disposed || !source.wanted()) {
        track.stop();
        return;
      }
      track.enabled = source.enabled();
      await source.adopt(track);
      listen(kind);
      onRestored?.(kind);
    } catch {
      onFailed?.(kind);
    } finally {
      reopening.delete(kind);
    }
  };

  const inspect = (kind: CaptureKind): void => {
    const track = trackOf(kind);
    if (!track || !sourceOf(kind)?.wanted()) {
      return;
    }
    if (track.readyState === 'ended') {
      void reopen(kind);
      return;
    }
    if (track.muted) {
      later(() => {
        const still = trackOf(kind);
        if (still === track && still.muted) {
          void reopen(kind);
        }
      }, MUTE_GRACE_MS);
    }
  };

  const listen = (kind: CaptureKind): void => {
    detachers.get(kind)?.();
    detachers.delete(kind);
    const track = trackOf(kind);
    if (!track || typeof track.addEventListener !== 'function') {
      return;
    }
    const onEnded = (): void => inspect(kind);
    const onMute = (): void => inspect(kind);
    track.addEventListener('ended', onEnded);
    track.addEventListener('mute', onMute);
    detachers.set(kind, () => {
      track.removeEventListener('ended', onEnded);
      track.removeEventListener('mute', onMute);
    });
  };

  for (const kind of KINDS) {
    listen(kind);
  }

  const stopListening = listenTo(() => {
    for (const kind of KINDS) {
      inspect(kind);
    }
  });

  return () => {
    disposed = true;
    stopListening();
    for (const detach of detachers.values()) {
      detach();
    }
    detachers.clear();
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
  };
}
