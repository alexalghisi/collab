export function attachMediaStream(
  element: HTMLMediaElement,
  stream: MediaStream | null,
): () => void {
  let resume: (() => void) | null = null;

  const stopResume = (): void => {
    if (!resume) {
      return;
    }
    document.removeEventListener('pointerdown', resume);
    resume = null;
  };

  const play = (): void => {
    if (element.tagName === 'AUDIO') {
      element.muted = false;
      element.volume = 1;
    }
    void element.play().catch(() => {
      if (resume || typeof document === 'undefined') {
        return;
      }
      resume = () => {
        stopResume();
        void element.play().catch(() => undefined);
      };
      document.addEventListener('pointerdown', resume);
    });
  };

  const bind = (force: boolean): void => {
    if (!stream) {
      element.srcObject = null;
      return;
    }
    const source = element.tagName === 'AUDIO' ? new MediaStream(stream.getAudioTracks()) : stream;
    if (force || element.srcObject !== source) {
      element.srcObject = source;
    }
    play();
  };

  bind(false);
  if (!stream) {
    return () => {
      stopResume();
      element.srcObject = null;
    };
  }

  const onChange = (): void => bind(true);
  stream.addEventListener('addtrack', onChange);
  stream.addEventListener('removetrack', onChange);
  return () => {
    stopResume();
    stream.removeEventListener('addtrack', onChange);
    stream.removeEventListener('removetrack', onChange);
    element.srcObject = null;
  };
}
