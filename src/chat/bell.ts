import { playbackAudioContext, unlockAudioPlayback } from '../webrtc/attachMedia';

export const CHAT_BELL_MAX_AGE_MS = 20_000;

const CHIME_GAP_MS = 700;

export const CHAT_BELL_VOLUME = 0.9;

export interface RingableMessage {
  readonly id: string;
  readonly peerId: string;
  readonly sentAt: number;
  readonly deletedAt?: number;
}

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
  master.gain.exponentialRampToValueAtTime(CHAT_BELL_VOLUME, start + 0.015);
  master.gain.exponentialRampToValueAtTime(CHAT_BELL_VOLUME * 0.6, start + 0.55);
  master.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
  master.connect(context.destination);
  chime(context, master, start, 880, 0, 0.3);
  chime(context, master, start, 1318.5, 0.14, 0.34);
  chime(context, master, start, 1760, 0.3, 0.75);
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
  tone.type = 'triangle';
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
