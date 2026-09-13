import { afterEach, describe, expect, it, vi } from 'vitest';
import { InviteError } from './contact';
import { sendContactInvite } from './sendInvite';

describe('sendContactInvite', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a phone invite to the signaling server', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const contact = await sendContactInvite('http://signaling.example', {
      contact: '+40 721 123 456',
      roomId: 'room-1',
      sessionId: 'session-1',
      hostName: 'Ada',
      link: 'https://collab.example/?room=room-1',
    });

    expect(contact).toEqual({ kind: 'phone', value: '+40721123456' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://signaling.example/invite',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('+40 721 123 456'),
      }),
    );
  });

  it('refuses garbage before calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      sendContactInvite('http://signaling.example', {
        contact: 'nope',
        roomId: 'room-1',
        sessionId: 'session-1',
        hostName: 'Ada',
        link: 'https://collab.example/?room=room-1',
      }),
    ).rejects.toBeInstanceOf(InviteError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the server error when delivery fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'The SMS could not be delivered.' }), {
            status: 502,
          }),
      ),
    );
    await expect(
      sendContactInvite('http://signaling.example', {
        contact: '+40721123456',
        roomId: 'room-1',
        sessionId: 'session-1',
        hostName: 'Ada',
        link: 'https://collab.example/?room=room-1',
      }),
    ).rejects.toThrow(/could not be delivered/i);
  });
});
