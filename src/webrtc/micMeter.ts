export function levelFromSamples(samples: Uint8Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of samples) {
    const centered = (value - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 3);
}

export interface MicLevel {
  readonly sample: () => number;
  readonly resume: () => Promise<void>;
  readonly stop: () => void;
}

export function openMicLevel(track: MediaStreamTrack): MicLevel | null {
  const AudioCtx =
    typeof window === 'undefined'
      ? null
      : (window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
  if (!AudioCtx || typeof MediaStream === 'undefined') {
    return null;
  }
  const context = new AudioCtx();
  void context.resume().catch((cause) => {
    console.info('[collab] microphone meter resume failed', cause);
  });
  const source = context.createMediaStreamSource(new MediaStream([track]));
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  console.info('[collab] microphone meter', { track: track.id });
  return {
    sample: () => {
      analyser.getByteTimeDomainData(samples);
      return levelFromSamples(samples);
    },
    resume: () => context.resume().then(() => undefined),
    stop: () => {
      source.disconnect();
      void context.close().catch(() => undefined);
    },
  };
}
