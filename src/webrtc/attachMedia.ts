const UNLOCK_EVENTS = ['pointerdown', 'click', 'keydown', 'touchstart'] as const;
const PLAYBACK_KEY = '__collabPlayback';
const BOUND_TRACKS = '__collabBoundTracks';

function boundTracks(element: HTMLMediaElement): readonly MediaStreamTrack[] | undefined {
  return (element as HTMLMediaElement & { [BOUND_TRACKS]?: readonly MediaStreamTrack[] })[
    BOUND_TRACKS
  ];
}

function rememberTracks(element: HTMLMediaElement, tracks: readonly MediaStreamTrack[]): void {
  (element as HTMLMediaElement & { [BOUND_TRACKS]?: readonly MediaStreamTrack[] })[BOUND_TRACKS] =
    tracks;
}

function sameTracks(element: HTMLMediaElement, tracks: readonly MediaStreamTrack[]): boolean {
  const current = boundTracks(element);
  return (
    current !== undefined &&
    current.length === tracks.length &&
    current.every((track, index) => track === tracks[index])
  );
}

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

/** Everything currently bound to a stream, so playback can be started again. */
const bound = new Set<HTMLMediaElement>();
let speakerId = '';

/**
 * Starts the sound again after a trip to another app. A phone pauses every
 * media element when something else takes the audio session, and hands it back
 * without resuming anything, so the room stays silent until each element is
 * played again.
 */
export function resumePlayback(): void {
  const context = sharedPlaybackContext();
  if (context && context.state !== 'running') {
    void context.resume();
  }
  for (const element of bound) {
    if (element.paused !== false) {
      void element.play().catch(() => undefined);
    }
  }
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
    void element.play().catch((cause) => {
      console.info('[collab] media play is waiting for a gesture', {
        tag: element.tagName,
        cause,
      });
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

  const bind = (): void => {
    if (!stream) {
      element.srcObject = null;
      rememberTracks(element, []);
      return;
    }
    const tracks = element.tagName === 'AUDIO' ? stream.getAudioTracks() : stream.getVideoTracks();
    if (!sameTracks(element, tracks)) {
      element.srcObject = new MediaStream(tracks);
      rememberTracks(element, tracks);
    }
    if (tracks.length > 0) {
      play();
    }
  };

  bind();
  if (!stream) {
    return () => {
      stopResume();
      element.srcObject = null;
    };
  }

  bound.add(element);
  const onChange = (): void => bind();
  stream.addEventListener('addtrack', onChange);
  stream.addEventListener('removetrack', onChange);
  return () => {
    stopResume();
    bound.delete(element);
    stream.removeEventListener('addtrack', onChange);
    stream.removeEventListener('removetrack', onChange);
    element.srcObject = null;
    rememberTracks(element, []);
  };
}

export async function retargetSpeakers(deviceId: string): Promise<void> {
  speakerId = deviceId;
  console.info('[collab] speaker', deviceId || 'default');
  for (const element of bound) {
    const sink = element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
    if (!sink.setSinkId) {
      continue;
    }
    try {
      await sink.setSinkId(deviceId);
    } catch (cause) {
      console.info('[collab] setSinkId failed', cause);
    }
  }
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
  const sink = audio as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
  if (speakerId && sink.setSinkId) {
    void sink.setSinkId(speakerId).catch((cause) => {
      console.info('[collab] setSinkId failed', cause);
    });
  }
  audio.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(audio);
  const detach = attachMediaStream(audio, stream);

  // A context the browser suspends or interrupts (another app took the audio
  // session, a headset was unplugged, the tab slept) goes silent without an
  // error, and the element is muted behind it, so the voice just vanishes.
  // Let the element speak whenever the context is not actually playing.
  const followContext = (): void => {
    if (!context || !source) {
      return;
    }
    const contextPlays = context.state === 'running';
    if (contextPlays) {
      audio.setAttribute('data-silent', '1');
    } else {
      audio.removeAttribute('data-silent');
    }
    audio.muted = contextPlays;
    if (!contextPlays && audio.paused !== false) {
      void audio.play().catch(() => undefined);
    }
  };
  followContext();
  context?.addEventListener?.('statechange', followContext);

  return () => {
    context?.removeEventListener?.('statechange', followContext);
    detach();
    audio.remove();
    source?.disconnect();
  };
}
