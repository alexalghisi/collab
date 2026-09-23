const UNLOCK_EVENTS = ['pointerdown', 'click', 'keydown', 'touchstart'] as const;
const PLAYBACK_KEY = '__collabPlayback';

function audioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return (
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

/** One context, resumed on the join click, so a remote voice can start later. */
function sharedPlaybackContext(): AudioContext | null {
  const AudioCtx = audioContextConstructor();
  if (!AudioCtx || typeof window === 'undefined') {
    return null;
  }
  const holder = window as typeof window & { [PLAYBACK_KEY]?: AudioContext };
  if (!holder[PLAYBACK_KEY] || holder[PLAYBACK_KEY].state === 'closed') {
    holder[PLAYBACK_KEY] = new AudioCtx();
  }
  return holder[PLAYBACK_KEY];
}

export function unlockAudioPlayback(): void {
  const context = sharedPlaybackContext();
  if (!context) {
    return;
  }
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
    if (element.tagName === 'AUDIO' && element.getAttribute?.('data-silent') !== '1') {
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
  const context = sharedPlaybackContext();
  let source: MediaStreamAudioSourceNode | null = null;
  if (context) {
    void context.resume();
    try {
      source = context.createMediaStreamSource(stream);
      source.connect(context.destination);
    } catch {
      source = null;
    }
  }

  // The element covers browsers without Web Audio. It stays muted when the
  // context is already playing the same stream, so the voice is not doubled.
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.muted = source !== null;
  if (source) {
    audio.setAttribute('data-silent', '1');
  }
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(audio);
  const detach = attachMediaStream(audio, stream);
  return () => {
    detach();
    audio.remove();
    source?.disconnect();
  };
}
