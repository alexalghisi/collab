import { describe, expect, it } from 'vitest';
import { DEFAULT_ICE_SERVERS } from '../../src/webrtc/config';
import { resolveIceServers } from './ice';

describe('resolveIceServers', () => {
  it('returns the bundled list when Twilio is not configured and the relay is quiet', async () => {
    const fetchImpl = (async () => new Response('no', { status: 404 })) as typeof fetch;
    await expect(resolveIceServers({}, fetchImpl)).resolves.toEqual([...DEFAULT_ICE_SERVERS]);
  });

  it('adds a TURN relay fetched on the server, including TCP', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          uris: ['turn:203.0.113.8:3478?transport=udp'],
          username: 'u',
          password: 'p',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    await expect(resolveIceServers({}, fetchImpl)).resolves.toEqual([
      ...DEFAULT_ICE_SERVERS,
      {
        urls: ['turn:203.0.113.8:3478?transport=udp', 'turn:203.0.113.8:3478?transport=tcp'],
        username: 'u',
        credential: 'p',
      },
    ]);
  });

  it('maps a Twilio token into RTC iceServers', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          ice_servers: [
            { urls: 'stun:global.stun.twilio.com:3478' },
            {
              urls: 'turn:global.turn.twilio.com:3478',
              username: 'ada',
              credential: 'secret',
            },
          ],
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    await expect(
      resolveIceServers(
        { TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', TWILIO_AUTH_TOKEN: 'token' },
        fetchImpl,
      ),
    ).resolves.toEqual([
      { urls: 'stun:global.stun.twilio.com:3478', username: undefined, credential: undefined },
      {
        urls: 'turn:global.turn.twilio.com:3478',
        username: 'ada',
        credential: 'secret',
      },
    ]);
  });
});
