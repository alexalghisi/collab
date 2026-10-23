import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ICE_SERVERS } from './config';
import { loadIceServers } from './loadIceServers';

describe('loadIceServers', () => {
  it('uses the hosted TURN list from /ice', async () => {
    const iceServers = [{ urls: 'turn:example', username: 'u', credential: 'p' }];
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ iceServers }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof fetch;

    await expect(loadIceServers('https://signal.example', fetchImpl)).resolves.toEqual(iceServers);
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe('https://signal.example/ice');
  });

  it('does not call a third-party TURN host from the browser', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 404 })) as typeof fetch;

    await expect(
      loadIceServers('https://collab-signaling.onrender.com', fetchImpl),
    ).resolves.toEqual(DEFAULT_ICE_SERVERS);

    const urls = vi.mocked(fetchImpl).mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual(['https://collab-signaling.onrender.com/ice']);
    expect(urls.some((url) => url.includes('turn.elixir-webrtc.org'))).toBe(false);
  });
});
