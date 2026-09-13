import { Router, type Request, type Response } from 'express';
import {
  inviteCopy,
  inviteSubject,
  parseContact,
  resolveInviteLink,
  smsInviteCopy,
} from '../../../src/meeting/contact';
import { RateLimiter } from '../execution/RateLimiter';
import { isUnconfigured, type InviteTransport } from './senders';

export type Membership = (roomId: string, sessionId: string) => boolean;

export interface InviteRouterOptions {
  readonly membership: Membership;
  readonly transport: InviteTransport;
  readonly limiter?: RateLimiter;
  readonly publicAppUrl?: string;
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
export function inviteRouter({
  membership,
  transport,
  limiter = DEFAULT_LIMITER(),
  publicAppUrl = process.env.PUBLIC_APP_URL,
}: InviteRouterOptions): Router {
  const router = Router();

  router.post('/invite', async (request: Request, response: Response) => {
    const contactInput = field(request, 'contact');
    const roomId = field(request, 'roomId');
    const sessionId = field(request, 'sessionId');
    const hostName = field(request, 'hostName');
    const clientLink = field(request, 'link');

    if (roomId === '' || sessionId === '' || !membership(roomId, sessionId)) {
      response.status(403).json({ error: 'You are no longer in this meeting.' });
      return;
    }

    const contact = parseContact(contactInput);
    if (!contact) {
      response.status(400).json({ error: 'Enter an email address or a phone number.' });
      return;
    }

    if (!limiter.take([`invite:room:${roomId}`, `invite:session:${sessionId}`])) {
      response.status(429).json({ error: 'Wait a moment before sending another invite.' });
      return;
    }

    const link = resolveInviteLink(roomId, clientLink, publicAppUrl);
    try {
      if (contact.kind === 'phone') {
        await transport.sendSms(contact.value, smsInviteCopy(roomId, hostName, link));
      } else {
        await transport.sendEmail(
          contact.value,
          inviteSubject(roomId),
          inviteCopy(roomId, hostName, link),
        );
      }
    } catch (cause) {
      const status = isUnconfigured(cause) ? 503 : 502;
      response.status(status).json({
        error: cause instanceof Error ? cause.message : 'The invite could not be sent.',
      });
      return;
    }

    response.json({ ok: true, kind: contact.kind, to: contact.value });
  });

  return router;
}
