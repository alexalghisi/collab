import { describe, expect, it, vi } from 'vitest';
import { createSpeechCapture, type SpeechRecognitionLike } from './speech';

function fakeRecognition(): {
  recognition: SpeechRecognitionLike;
  create: () => SpeechRecognitionLike;
} {
  const recognition: SpeechRecognitionLike = {
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
  };
  return { recognition, create: () => recognition };
}

describe('createSpeechCapture', () => {
  it('reports unavailable when the browser has no recognizer', () => {
    const errors: string[] = [];
    const capture = createSpeechCapture();

    expect(capture.available).toBe(false);
    capture.start(
      () => undefined,
      (message) => errors.push(message),
    );
    expect(errors[0]).toMatch(/not available/i);
  });

  it('emits only final turns and ignores interim text', () => {
    const { recognition, create } = fakeRecognition();
    const heard: string[] = [];
    const capture = createSpeechCapture(create);

    capture.start((text) => heard.push(text));
    recognition.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: false, 0: { transcript: 'let us' } },
        { isFinal: true, 0: { transcript: '  Let us ship it.  ' } },
      ],
    });

    expect(heard).toEqual(['Let us ship it.']);
  });

  it('does not treat a pause or an abort as a failure', () => {
    const { recognition, create } = fakeRecognition();
    const errors: string[] = [];
    const capture = createSpeechCapture(create);

    capture.start(
      () => undefined,
      (message) => errors.push(message),
    );
    recognition.onerror?.({ error: 'no-speech' });
    recognition.onerror?.({ error: 'aborted' });

    expect(errors).toEqual([]);
  });

  it('restarts after the recognizer ends on its own, and not after stop()', () => {
    const { recognition, create } = fakeRecognition();
    const capture = createSpeechCapture(create);

    capture.start(() => undefined);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    recognition.onend?.();
    expect(recognition.start).toHaveBeenCalledTimes(2);

    capture.stop();
    recognition.onend?.();
    expect(recognition.start).toHaveBeenCalledTimes(2);
    expect(recognition.stop).toHaveBeenCalledTimes(1);
  });
});
