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

  it('sends a signed-in calendar invite for several addresses', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendContactInvite('http://signaling.example', {
      contact: 'ada@example.com, linus@example.com',
      roomId: 'room-1',
      sessionId: '',
      hostName: 'Ada',
      link: 'https://collab.example/?room=room-1',
      token: 'host-token',
      title: 'Standup',
      startsAt: 1_700_000_000_000,
      reminderMinutes: 30,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://signaling.example/invite',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer host-token' }),
        body: expect.stringContaining('reminderMinutes'),
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
