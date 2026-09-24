import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { Server } from 'socket.io';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inviteRouter } from '../../server/src/invite/router';
import {
  isAdmitted,
  registerSignalingHandlers,
  type CollabServer,
} from '../../server/src/SignalingServer';
import { InviteError } from './contact';
import { deliverMeetingGuests, sendCallInvite, sendMeetingInvite } from './calendarInvite';

const sent: string[] = [];
let stopServer: (() => Promise<void>) | null = null;

async function startInviteDoor(): Promise<string> {
  sent.length = 0;
  const app = express();
  app.use(express.json());
  app.use(
    inviteRouter({
      membership: isAdmitted,
      transport: {
        async sendSms(to) {
          sent.push(to);
        },
        async sendEmail(to) {
          sent.push(to);
        },
      },
    }),
  );
  const httpServer = createServer(app);
  const io: CollabServer = new Server(httpServer);
  registerSignalingHandlers(io);
  httpServer.listen(0);
  await once(httpServer, 'listening');
  const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  stopServer = async () => {
    await io.close();
    if (httpServer.listening) {
      httpServer.close();
      await once(httpServer, 'close');
    }
  };
  return url;
}

afterEach(async () => {
  await stopServer?.();
  stopServer = null;
});

describe('sendMeetingInvite', () => {
  it('takes a seat before mailing a guest from the calendar', async () => {
    const url = await startInviteDoor();

    const contact = await sendMeetingInvite(url, {
      contact: 'guest@example.com',
      roomId: 'fyc-bcbd-qvt',
      sessionId: '',
      hostName: 'Alex',
      link: 'https://alexalghisi.github.io/collab/?room=fyc-bcbd-qvt',
    });

    expect(contact).toEqual({ kind: 'email', value: 'guest@example.com' });
    expect(sent).toEqual(['guest@example.com']);
  });
});

describe('sendCallInvite', () => {
  it('returns the contact when the server accepts the invite', async () => {
    const mail = vi.fn(async () => undefined);

    await expect(
      sendCallInvite(
        'ada@example.com',
        async () => ({ kind: 'email', value: 'ada@example.com' }),
        mail,
      ),
    ).resolves.toEqual({ kind: 'email', value: 'ada@example.com' });
    expect(mail).not.toHaveBeenCalled();
  });

  it('mails the guest through the calendar when the server cannot send email', async () => {
    const mail = vi.fn(async () => undefined);

    await expect(
      sendCallInvite(
        'ada@example.com',
        async () => {
          throw new InviteError('Email invites are not configured on the server.');
        },
        mail,
      ),
    ).resolves.toEqual({ kind: 'email', value: 'ada@example.com' });
    expect(mail).toHaveBeenCalledWith(['ada@example.com']);
  });
});

describe('deliverMeetingGuests', () => {
  it('keeps the server delivery when the invite is accepted', async () => {
    const mailThroughCalendar = vi.fn(async () => undefined);

    const outcome = await deliverMeetingGuests({
      send: async () => 'sent',
      mailThroughCalendar,
    });

    expect(outcome).toBe('server');
    expect(mailThroughCalendar).not.toHaveBeenCalled();
  });

  it('mails through Google Calendar when the server has no email transport', async () => {
    const mailThroughCalendar = vi.fn(async () => undefined);

    const outcome = await deliverMeetingGuests({
      send: async () => {
        throw new InviteError('Email invites are not configured on the server.');
      },
      mailThroughCalendar,
    });

    expect(outcome).toBe('calendar');
    expect(mailThroughCalendar).toHaveBeenCalledTimes(1);
  });

  it('leaves other invite failures alone', async () => {
    const mailThroughCalendar = vi.fn(async () => undefined);

    await expect(
      deliverMeetingGuests({
        send: async () => {
          throw new InviteError('You are no longer in this meeting.');
        },
        mailThroughCalendar,
      }),
    ).rejects.toThrow('You are no longer in this meeting.');
    expect(mailThroughCalendar).not.toHaveBeenCalled();
  });
});
