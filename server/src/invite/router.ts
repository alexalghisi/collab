import { Router, type Request, type Response } from 'express';
import {
  inviteCopy,
  inviteSubject,
  parseContact,
  parseEmailList,
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

    const emails = parseEmailList(contactInput);
    const contact = emails.length === 0 ? parseContact(contactInput) : null;
    if (emails.length === 0 && !contact) {
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
      if (contact?.kind === 'phone') {
        await transport.sendSms(contact.value, smsInviteCopy(roomId, hostName, link));
        response.json({ ok: true, kind: contact.kind, to: contact.value });
        return;
      }
      const recipients = emails.length > 0 ? emails : [contact?.value ?? ''];
      for (const to of recipients) {
        await transport.sendEmail(to, inviteSubject(roomId), inviteCopy(roomId, hostName, link));
        if (reminders && when !== null) {
          reminders.schedule({
            to,
            roomId,
            hostName,
            link,
            title,
            minutes,
            startsAt: when,
          });
        }
      }
      response.json({
        ok: true,
        kind: 'email',
        to: recipients[0],
        recipients,
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
