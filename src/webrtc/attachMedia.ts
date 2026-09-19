const UNLOCK_EVENTS = ['pointerdown', 'click', 'keydown', 'touchstart'] as const;

export function unlockAudioPlayback(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const AudioCtx =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return;
  }
  const context = new AudioCtx();
  void context.resume();
  const source = context.createBufferSource();
  source.buffer = context.createBuffer(1, 1, 22050);
  source.connect(context.destination);
  source.start();
}

export function attachMediaStream(
  element: HTMLMediaElement,
  stream: MediaStream | null,
): () => void {
  let resume: (() => void) | null = null;

  const stopResume = (): void => {
    if (!resume) {
      return;
    }
    for (const event of UNLOCK_EVENTS) {
      document.removeEventListener(event, resume);
    }
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
      for (const event of UNLOCK_EVENTS) {
        document.addEventListener(event, resume);
      }
    });
  };

  const bind = (force: boolean): void => {
    if (!stream) {
      element.srcObject = null;
      return;
    }
    const tracks = element.tagName === 'AUDIO' ? stream.getAudioTracks() : stream.getVideoTracks();
    const source = new MediaStream(tracks);
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

export function attachRemoteAudio(stream: MediaStream): () => void {
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(audio);
  const detach = attachMediaStream(audio, stream);
  return () => {
    detach();
    audio.remove();
  };
}
