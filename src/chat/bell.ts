import { playbackAudioContext, unlockAudioPlayback } from '../webrtc/attachMedia';

/** A message already on screen, or older than this, does not ring again. */
export const CHAT_BELL_MAX_AGE_MS = 20_000;

const CHIME_GAP_MS = 700;

export interface RingableMessage {
  readonly id: string;
  readonly peerId: string;
  readonly sentAt: number;
  readonly deletedAt?: number;
}

/**
 * Messages that just arrived from somebody else. History loaded with the room,
 * the sender's own copy, and edits of a message already shown are left out.
 */
export function messagesToRing(
  previous: readonly { readonly id: string }[],
  incoming: readonly RingableMessage[],
  selfIds: readonly (string | null | undefined)[],
  now: number,
): RingableMessage[] {
  const known = new Set(previous.map((item) => item.id));
  const self = new Set(selfIds.filter((id): id is string => Boolean(id)));
  return incoming.filter((message) => {
    if (known.has(message.id) || message.deletedAt || self.has(message.peerId)) {
      return false;
    }
    const age = now - message.sentAt;
    return age >= -5_000 && age <= CHAT_BELL_MAX_AGE_MS;
  });
}

let lastChimeAt = 0;
let armed = false;

function armChime(): void {
  if (armed || typeof document === 'undefined') {
    return;
  }
  armed = true;
  const resume = (): void => {
    unlockAudioPlayback();
  };
  document.addEventListener('pointerdown', resume);
  document.addEventListener('keydown', resume);
  document.addEventListener('touchstart', resume);
}

/** Two short tones on this device's speakers. Silent when audio is unavailable. */
export function playChatBell(now = Date.now()): void {
  armChime();
  if (now - lastChimeAt < CHIME_GAP_MS) {
    return;
  }
  const context = playbackAudioContext();
  if (!context) {
    return;
  }
  lastChimeAt = now;
  void context.resume();
  const start = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
  master.connect(context.destination);
  chime(context, master, start, 1318.5, 0, 0.16);
  chime(context, master, start, 1975.5, 0.11, 0.26);
}

armChime();

function chime(
  context: AudioContext,
  master: GainNode,
  origin: number,
  frequency: number,
  offset: number,
  duration: number,
): void {
  const tone = context.createOscillator();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(frequency, origin + offset);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, origin + offset);
  gain.gain.exponentialRampToValueAtTime(0.9, origin + offset + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, origin + offset + duration);
  tone.connect(gain);
  gain.connect(master);
  tone.start(origin + offset);
  tone.stop(origin + offset + duration + 0.02);
}
