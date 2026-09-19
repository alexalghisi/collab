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
    if (force || element.srcObject !== stream) {
      element.srcObject = stream;
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
    if (element.srcObject === stream) {
      element.srcObject = null;
    }
  };
}
