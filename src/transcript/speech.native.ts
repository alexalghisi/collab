import type { SpeechCapture, SpeechErrorListener, SpeechListener } from './speech';

const UNAVAILABLE =
  'Live captions use the browser speech recognizer and are not available on this device.';

/**
 * Native builds have no Web Speech API. The panel still opens and shows
 * everyone else's turns; this participant just cannot contribute captions
 * until a hosted recognizer is wired into `createSpeechCapture`.
 */
export function createSpeechCapture(): SpeechCapture {
  return {
    available: false,
    start(_onFinal: SpeechListener, onError?: SpeechErrorListener) {
      onError?.(UNAVAILABLE);
    },
    stop() {
      /* nothing to halt */
    },
  };
}
