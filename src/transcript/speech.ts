/**
 * Speech-to-text for one local participant. The first pass uses the browser's
 * built-in recognizer (Web Speech API). A hosted provider can replace
 * `createSpeechCapture` later without touching the room or the panel — the
 * rest of the app only sees final turns with a time span.
 */

export interface SpeechSpan {
  readonly startedAt: number;
  readonly endedAt: number;
}

export type SpeechListener = (text: string, span: SpeechSpan) => void;
export type SpeechErrorListener = (message: string) => void;

export interface SpeechCapture {
  readonly available: boolean;
  start(onFinal: SpeechListener, onError?: SpeechErrorListener): void;
  stop(): void;
}

export interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly 0?: { readonly transcript: string };
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechResultLike>;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export type RecognitionFactory = () => SpeechRecognitionLike;

const RecognitionCtor =
  (
    globalThis as typeof globalThis & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }
  ).SpeechRecognition ??
  (
    globalThis as typeof globalThis & {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }
  ).webkitSpeechRecognition;

const UNAVAILABLE = 'Live captions are not available in this browser.';

export function createSpeechCapture(createRecognition?: RecognitionFactory): SpeechCapture {
  const factory = createRecognition ?? (RecognitionCtor ? () => new RecognitionCtor() : undefined);
  if (!factory) {
    return {
      available: false,
      start(_onFinal, onError) {
        onError?.(UNAVAILABLE);
      },
      stop() {
        /* nothing to halt */
      },
    };
  }

  let recognition: SpeechRecognitionLike | null = null;
  let running = false;
  let turnStartedAt = 0;

  return {
    available: true,
    start(onFinal, onError) {
      if (running) {
        return;
      }
      running = true;
      const session = factory();
      recognition = session;
      session.continuous = true;
      session.interimResults = true;
      session.lang = 'en-US';
      session.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result?.[0]?.transcript?.trim() ?? '';
          if (!text) {
            continue;
          }
          if (!turnStartedAt) {
            turnStartedAt = Date.now();
          }
          if (!result?.isFinal) {
            continue;
          }
          const endedAt = Date.now();
          const startedAt = turnStartedAt;
          turnStartedAt = 0;
          onFinal(text, { startedAt, endedAt });
        }
      };
      session.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        onError?.(
          event.error === 'not-allowed'
            ? 'Microphone access for captions was denied.'
            : 'Live captions stopped unexpectedly.',
        );
      };
      session.onend = () => {
        if (!running) {
          return;
        }
        // Chrome ends a continuous session after a pause; keep listening
        // for the rest of the meeting unless we were asked to stop.
        try {
          session.start();
        } catch {
          running = false;
        }
      };
      turnStartedAt = Date.now();
      session.start();
    },
    stop() {
      running = false;
      recognition?.stop();
      recognition = null;
    },
  };
}
