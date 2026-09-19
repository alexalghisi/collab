import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ICE_SERVERS } from './config';
import { loadIceServers } from './loadIceServers';

describe('loadIceServers', () => {
  it('uses the hosted TURN list when the signaling process has one', async () => {
    const iceServers = [{ urls: 'turn:example', username: 'u', credential: 'p' }];
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ iceServers }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    await expect(loadIceServers('https://signal.example', fetchImpl)).resolves.toEqual(iceServers);
  });

  it('asks a public relay when /ice is missing', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/ice')) {
        return new Response('nope', { status: 404 });
      }
      return new Response(
        JSON.stringify({
          uris: ['turn:203.0.113.8:3478?transport=udp'],
          username: 'u',
          password: 'p',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    await expect(loadIceServers('https://signal.example', fetchImpl)).resolves.toEqual([
      ...DEFAULT_ICE_SERVERS,
      {
        urls: ['turn:203.0.113.8:3478?transport=udp'],
        username: 'u',
        credential: 'p',
      },
    ]);
  });

  it('keeps STUN when the public relay is quiet too', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 404 })) as typeof fetch;

    await expect(loadIceServers('https://signal.example', fetchImpl)).resolves.toEqual(
      DEFAULT_ICE_SERVERS,
    );
  });
});
