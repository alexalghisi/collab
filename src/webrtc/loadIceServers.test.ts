import { describe, expect, it } from 'vitest';
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

  it('falls back to the bundled servers when /ice is missing', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 404 })) as typeof fetch;

    await expect(loadIceServers('https://signal.example', fetchImpl)).resolves.toEqual(
      DEFAULT_ICE_SERVERS,
    );
  });
});
