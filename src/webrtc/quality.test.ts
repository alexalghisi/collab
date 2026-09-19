import { describe, expect, it, vi } from 'vitest';
import {
  AUDIO_MAX_BITRATE_BPS,
  tuneAudioSender,
  tuneVideoSender,
  videoContentOf,
  withClearAudio,
} from './quality';

function fakeSender(encodings: RTCRtpEncodingParameters[] = [{}]) {
  const parameters = { encodings } as RTCRtpSendParameters;
  const applied: RTCRtpSendParameters[] = [];
  return {
    applied,
    getParameters: vi.fn(() => parameters),
    setParameters: vi.fn(async (next: RTCRtpSendParameters) => {
      applied.push(next);
    }),
  };
}

function appliedBy(sender: ReturnType<typeof fakeSender>): {
  degradationPreference?: RTCDegradationPreference;
  encodings: RTCRtpEncodingParameters[];
} {
  const parameters = sender.applied[0];
  if (!parameters) {
    throw new Error('the sender was never tuned');
  }
  return {
    degradationPreference: parameters.degradationPreference,
    encodings: parameters.encodings ?? [],
  };
}

const OFFER_SDP = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:63 red/48000/2',
  'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'a=rtpmap:96 VP8/90000',
  '',
].join('\r\n');

describe('sender tuning', () => {
  it('gives the camera a real bitrate and keeps motion smooth', async () => {
    const sender = fakeSender();

    await tuneVideoSender(sender as unknown as RTCRtpSender, 'camera');

    const { degradationPreference, encodings } = appliedBy(sender);
    expect(degradationPreference).toBe('maintain-framerate');
    expect(encodings[0]).toMatchObject({
      maxBitrate: 2_500_000,
      maxFramerate: 30,
      scaleResolutionDownBy: 1,
    });
  });

  it('keeps a shared screen sharp instead of smooth', async () => {
    const sender = fakeSender();

    await tuneVideoSender(sender as unknown as RTCRtpSender, 'screen');

    const { degradationPreference, encodings } = appliedBy(sender);
    expect(degradationPreference).toBe('maintain-resolution');
    expect(encodings[0]?.maxBitrate).toBe(4_000_000);
  });

  it('puts voice ahead of picture on a tight link', async () => {
    const sender = fakeSender();

    await tuneAudioSender(sender as unknown as RTCRtpSender);

    const { encodings } = appliedBy(sender);
    expect(encodings[0]).toMatchObject({
      maxBitrate: AUDIO_MAX_BITRATE_BPS,
      networkPriority: 'high',
    });
  });

  it('keeps every simulcast layer the stack already set up', async () => {
    const sender = fakeSender([{ rid: 'low' }, { rid: 'high' }]);

    await tuneVideoSender(sender as unknown as RTCRtpSender, 'camera');

    const { encodings } = appliedBy(sender);
    expect(encodings.map((encoding) => encoding.rid)).toEqual(['low', 'high']);
  });

  it('survives a stack that exposes no sender parameters', async () => {
    await expect(tuneAudioSender(undefined)).resolves.toBeUndefined();
    await expect(tuneVideoSender({} as RTCRtpSender, 'camera')).resolves.toBeUndefined();
  });

  it('does not fail the call when the stack refuses the parameters', async () => {
    const sender = {
      getParameters: vi.fn(() => ({ encodings: [{}] }) as RTCRtpSendParameters),
      setParameters: vi.fn(async () => {
        throw new Error('nope');
      }),
    };

    await expect(tuneAudioSender(sender as unknown as RTCRtpSender)).resolves.toBeUndefined();
  });

  it('reads the content a track carries from its hint', () => {
    expect(videoContentOf({ contentHint: 'detail' } as MediaStreamTrack)).toBe('screen');
    expect(videoContentOf({ contentHint: 'motion' } as MediaStreamTrack)).toBe('camera');
    expect(videoContentOf(null)).toBe('camera');
  });
});

describe('withClearAudio', () => {
  it('asks Opus for fullband speech with loss recovery and no gating', () => {
    const { sdp } = withClearAudio({ type: 'offer', sdp: OFFER_SDP });
    const fmtp = sdp?.split('\r\n').filter((line) => line.startsWith('a=fmtp:111 ')) ?? [];

    expect(fmtp).toHaveLength(1);
    expect(fmtp[0]).toContain('maxaveragebitrate=64000');
    expect(fmtp[0]).toContain('maxplaybackrate=48000');
    expect(fmtp[0]).toContain('useinbandfec=1');
    expect(fmtp[0]).toContain('usedtx=0');
    expect(fmtp[0]).toContain('stereo=0');
    // Whatever the stack negotiated for itself is kept.
    expect(fmtp[0]).toContain('minptime=10');
  });

  it('describes Opus even when the stack sent no parameters for it', () => {
    const sdp = ['v=0', 'a=rtpmap:111 opus/48000/2', ''].join('\r\n');

    const tuned = withClearAudio({ type: 'answer', sdp });

    expect(tuned.sdp).toContain('a=rtpmap:111 opus/48000/2\r\na=fmtp:111 maxaveragebitrate=64000');
  });

  it('leaves the video payloads and the line endings alone', () => {
    const { sdp } = withClearAudio({ type: 'offer', sdp: OFFER_SDP });

    expect(sdp).toContain('a=rtpmap:96 VP8/90000');
    expect(sdp).not.toContain('a=fmtp:96');
    expect(sdp?.split('\r\n').length).toBe(OFFER_SDP.split('\r\n').length);
  });

  it('passes through a description without audio', () => {
    const description = { type: 'offer' as const, sdp: 'v=0\r\n' };

    expect(withClearAudio(description)).toBe(description);
    expect(withClearAudio({ type: 'offer' })).toEqual({ type: 'offer' });
  });
});
