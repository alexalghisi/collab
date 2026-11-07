/**
 * RNNoise runs on the page's main thread, so a busy page (the code editor, live
 * sync) delays audio frames and the voice breaks up. The browser's own noise
 * suppression (getUserMedia constraints) runs off the main thread and is always
 * on, so the extra RNNoise pass starts off and stays opt-in.
 */
export const RNNOISE_ON_BY_DEFAULT = false;

interface RunningSuppression {
  readonly track: MediaStreamTrack;
  readonly stop: () => void;
}

/**
 * Chrome (including Android Chrome) can run RNNoise on the outgoing mic.
 * The processed track is what peers receive. Nothing here connects that
 * track to a speaker, so the caller does not hear their own voice.
 */
export function noiseSuppressionSupported(): boolean {
  const host = globalThis as {
    MediaStreamTrackProcessor?: unknown;
    MediaStreamTrackGenerator?: unknown;
  };
  return (
    host.MediaStreamTrackProcessor !== undefined && host.MediaStreamTrackGenerator !== undefined
  );
}

export async function openNoiseSuppression(
  track: MediaStreamTrack,
): Promise<RunningSuppression | null> {
  if (!noiseSuppressionSupported()) {
    console.info('[collab] noise suppression unavailable');
    return null;
  }
  try {
    const { NoiseSuppressionProcessor } = await import('@shiguredo/noise-suppression');
    const processor = new NoiseSuppressionProcessor();
    const processed = await processor.startProcessing(
      track as Parameters<typeof processor.startProcessing>[0],
    );
    console.info('[collab] noise suppression on', { input: track.id, output: processed.id });
    return {
      track: processed,
      stop: () => {
        processor.stopProcessing();
        console.info('[collab] noise suppression stopped');
      },
    };
  } catch (cause) {
    console.info('[collab] noise suppression failed', cause);
    return null;
  }
}
