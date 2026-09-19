/**
 * Binds a media element to a stream and keeps audio alive as tracks arrive.
 * Browsers often ignore `autoplay` on unmuted remote video; `play()` after
 * `srcObject` is what actually starts the other person's microphone.
 */
export function attachMediaStream(
  element: HTMLMediaElement,
  stream: MediaStream | null,
): () => void {
  const bind = (): void => {
    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }
    if (stream && element.paused) {
      void element.play().catch(() => undefined);
    }
  };
  bind();
  if (!stream) {
    return () => {
      element.srcObject = null;
    };
  }
  stream.addEventListener('addtrack', bind);
  stream.addEventListener('removetrack', bind);
  return () => {
    stream.removeEventListener('addtrack', bind);
    stream.removeEventListener('removetrack', bind);
    if (element.srcObject === stream) {
      element.srcObject = null;
    }
  };
}
