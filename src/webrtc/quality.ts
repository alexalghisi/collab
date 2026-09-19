/**
 * Transport-side quality: how much bandwidth each track may use, what the
 * encoder should sacrifice first when the link gets tight, and what Opus is
 * asked to do with the voice. Capture-side quality lives in `media.ts`.
 *
 * Every call here is best effort. Older WebRTC stacks expose no sender
 * parameters at all, and a browser that does not understand an SDP parameter
 * ignores it, so a failure never costs the call.
 */

export type VideoContent = 'camera' | 'screen';

/** Well above a phone messenger: enough for a sharp 720p face or legible text. */
const VIDEO_MAX_BITRATE_BPS: Record<VideoContent, number> = {
  camera: 2_500_000,
  screen: 4_000_000,
};

const VIDEO_MAX_FRAMERATE: Record<VideoContent, number> = {
  camera: 30,
  screen: 15,
};

/**
 * A moving face stays watchable at a lower resolution, while shared text is
 * unreadable the moment it is scaled down.
 */
const VIDEO_DEGRADATION: Record<VideoContent, RTCDegradationPreference> = {
  camera: 'maintain-framerate',
  screen: 'maintain-resolution',
};

/** Fullband Opus. Messengers commonly sit near 20 kbps; speech is clean at 64. */
export const AUDIO_MAX_BITRATE_BPS = 64_000;

/**
 * Voice settings we ask both sides to honour: full 48 kHz band, in-band
 * forward error correction so a lost packet does not become a gap, and no
 * discontinuous transmission, which is what clips the first word after a
 * pause. Mono, because stereo would spend the same bitrate on a second copy
 * of one speaker.
 */
const OPUS_PARAMETERS: Readonly<Record<string, string | number>> = {
  maxaveragebitrate: AUDIO_MAX_BITRATE_BPS,
  maxplaybackrate: 48_000,
  'sprop-maxcapturerate': 48_000,
  stereo: 0,
  'sprop-stereo': 0,
  useinbandfec: 1,
  usedtx: 0,
};

interface TunableSender {
  getParameters?: () => RTCRtpSendParameters;
  setParameters?: (parameters: RTCRtpSendParameters) => Promise<void>;
}

async function applyEncodings(
  sender: RTCRtpSender | undefined,
  encoding: Partial<RTCRtpEncodingParameters>,
  degradationPreference?: RTCDegradationPreference,
): Promise<void> {
  const tunable = sender as TunableSender | undefined;
  if (typeof tunable?.getParameters !== 'function' || typeof tunable.setParameters !== 'function') {
    return;
  }
  try {
    const parameters = tunable.getParameters();
    const encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    const next: RTCRtpSendParameters = {
      ...parameters,
      encodings: encodings.map((current) => ({ ...current, ...encoding })),
    };
    if (degradationPreference) {
      next.degradationPreference = degradationPreference;
    }
    await tunable.setParameters(next);
  } catch {
    // The stack refused the parameters; the default encoding still works.
  }
}

export function tuneVideoSender(
  sender: RTCRtpSender | undefined,
  content: VideoContent,
): Promise<void> {
  return applyEncodings(
    sender,
    {
      maxBitrate: VIDEO_MAX_BITRATE_BPS[content],
      maxFramerate: VIDEO_MAX_FRAMERATE[content],
      scaleResolutionDownBy: 1,
      networkPriority: 'medium',
    },
    VIDEO_DEGRADATION[content],
  );
}

/** Voice outranks picture: it is what a meeting cannot survive losing. */
export function tuneAudioSender(sender: RTCRtpSender | undefined): Promise<void> {
  return applyEncodings(sender, {
    maxBitrate: AUDIO_MAX_BITRATE_BPS,
    networkPriority: 'high',
  });
}

/** Reads the content this track carries, as labelled by `media.ts`. */
export function videoContentOf(track: MediaStreamTrack | null): VideoContent {
  return track?.contentHint === 'detail' || track?.contentHint === 'text' ? 'screen' : 'camera';
}

function formatOpusParameters(): string {
  return Object.entries(OPUS_PARAMETERS)
    .map(([key, value]) => `${key}=${value}`)
    .join(';');
}

/**
 * Rewrites the Opus parameters of a description we are about to make our local
 * one. These are receive preferences, so tuning our own offer or answer is what
 * makes the *other* side send us clean audio.
 */
export function withClearAudio(description: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
  const sdp = description.sdp;
  if (!sdp) {
    return description;
  }
  const opusPayloadTypes = [...sdp.matchAll(/^a=rtpmap:(\d+) opus\/48000/gim)].map(
    (match) => match[1],
  );
  if (opusPayloadTypes.length === 0) {
    return description;
  }

  const wanted = formatOpusParameters();
  const lines = sdp.split(/(?<=\r?\n)/);
  const described = new Set(
    lines
      .map((line) => /^a=fmtp:(\d+) /.exec(line)?.[1])
      .filter((payloadType): payloadType is string => opusPayloadTypes.includes(payloadType ?? '')),
  );
  const patched: string[] = [];

  for (const line of lines) {
    const fmtp = /^a=fmtp:(\d+) ([^\r\n]*)(\r?\n)?$/.exec(line);
    if (fmtp && opusPayloadTypes.includes(fmtp[1])) {
      patched.push(`a=fmtp:${fmtp[1]} ${mergeParameters(fmtp[2], wanted)}${fmtp[3] ?? ''}`);
      continue;
    }
    patched.push(line);
    const rtpmap = /^a=rtpmap:(\d+) opus\/48000[^\r\n]*(\r?\n)?$/i.exec(line);
    if (rtpmap && !described.has(rtpmap[1])) {
      patched.push(`a=fmtp:${rtpmap[1]} ${wanted}${rtpmap[2] ?? '\r\n'}`);
    }
  }

  return { ...description, sdp: patched.join('') };
}

/** Our values win; anything else the stack negotiated is kept. */
function mergeParameters(existing: string, wanted: string): string {
  const merged = new Map<string, string>();
  for (const part of `${existing};${wanted}`.split(';')) {
    const [key, value] = part.split('=');
    if (key?.trim()) {
      merged.set(key.trim(), value ?? '');
    }
  }
  return [...merged].map(([key, value]) => (value === '' ? key : `${key}=${value}`)).join(';');
}
