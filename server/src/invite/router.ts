import { Router, type Request, type Response } from 'express';
import {
  inviteCopy,
  inviteSubject,
  parseContactList,
  resolveInviteLink,
  smsInviteCopy,
} from '../../../src/meeting/contact';
import { verifyToken } from '../auth/tokens';
import { RateLimiter } from '../execution/RateLimiter';
import type { ReminderBook } from './reminders';
import { isUnconfigured, type InviteTransport } from './senders';

export type Membership = (roomId: string, sessionId: string) => boolean;

export interface InviteRouterOptions {
  readonly membership: Membership;
  readonly transport: InviteTransport;
  readonly limiter?: RateLimiter;
  readonly publicAppUrl?: string;
  readonly reminders?: ReminderBook;
}

const DEFAULT_LIMITER = () => new RateLimiter({ burst: 3, refillMs: 20_000 });

const field = (request: Request, name: string): string => {
  const value = (request.body as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : '';
};

/**
 * Delivers a meeting invite by SMS or email. The body is always our own copy —
 * the client cannot send an arbitrary message through this door.
 */
function bearerToken(request: Request): string {
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return field(request, 'token');
}

function reminderMinutes(request: Request): 15 | 30 {
  const value = Number((request.body as Record<string, unknown> | undefined)?.reminderMinutes);
  return value === 30 ? 30 : 15;
}

function startsAt(request: Request): number | null {
  const value = (request.body as Record<string, unknown> | undefined)?.startsAt;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function inviteRouter({
  membership,
  transport,
  limiter = DEFAULT_LIMITER(),
  publicAppUrl = process.env.PUBLIC_APP_URL,
  reminders,
}: InviteRouterOptions): Router {
  const router = Router();

  router.post('/invite', async (request: Request, response: Response) => {
    const contactInput = field(request, 'contact');
    const roomId = field(request, 'roomId');
    const sessionId = field(request, 'sessionId');
    const hostName = field(request, 'hostName');
    const clientLink = field(request, 'link');
    const title = field(request, 'title');
    const signedIn = verifyToken(bearerToken(request));

    if (roomId === '' || (!signedIn && (sessionId === '' || !membership(roomId, sessionId)))) {
      response.status(403).json({ error: 'You are no longer in this meeting.' });
      return;
    }

    const contacts = parseContactList(contactInput);
    if (contacts.length === 0) {
      response.status(400).json({ error: 'Enter an email address or a phone number.' });
      return;
    }

    const limitKey = signedIn?.uid ?? sessionId;
    if (!limiter.take([`invite:room:${roomId}`, `invite:session:${limitKey}`])) {
      response.status(429).json({ error: 'Wait a moment before sending another invite.' });
      return;
    }

    const link = resolveInviteLink(roomId, clientLink, publicAppUrl);
    const minutes = reminderMinutes(request);
    const when = startsAt(request);
    try {
      const emailRecipients: string[] = [];
      const phoneRecipients: string[] = [];

      for (const item of contacts) {
        if (item.kind === 'phone') {
          await transport.sendSms(item.value, smsInviteCopy(roomId, hostName, link));
          phoneRecipients.push(item.value);
        } else {
          await transport.sendEmail(
            item.value,
            inviteSubject(roomId),
            inviteCopy(roomId, hostName, link),
          );
          emailRecipients.push(item.value);
        }
        if (reminders && when !== null) {
          reminders.schedule({
            to: item.value,
            roomId,
            hostName,
            link,
            title,
            minutes,
            startsAt: when,
          });
        }
      }

      if (contacts.length === 1 && contacts[0].kind === 'phone') {
        response.json({ ok: true, kind: 'phone', to: contacts[0].value });
        return;
      }

      response.json({
        ok: true,
        kind: emailRecipients.length > 0 ? 'email' : 'phone',
        to: contacts[0]?.value,
        recipients: contacts.map((c) => c.value),
        count: contacts.length,
      });
    } catch (cause) {
      const status = isUnconfigured(cause) ? 503 : 502;
      response.status(status).json({
        error: cause instanceof Error ? cause.message : 'The invite could not be sent.',
      });
    }
  });

  return router;
}
