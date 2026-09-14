import { Router } from 'express';
import type { AccountStore } from '../accounts/AccountStore';
import { requireAccount } from '../accounts/router';
import type { MeetingStore } from './MeetingStore';

export interface MeetingsRouterOptions {
  readonly accounts: AccountStore;
  readonly meetings: MeetingStore;
}

const INVALID = 'That meeting needs a title, a room and a start time.';
const NOT_YOURS = 'Only the organiser can cancel this meeting.';
const UNKNOWN = 'That meeting no longer exists.';

/**
 * The shared calendar. Every answer is scoped to the caller's own account:
 * you see what you organise or were invited to, and nothing else.
 */
export function meetingsRouter({ accounts, meetings }: MeetingsRouterOptions): Router {
  const router = Router();

  router.get('/meetings', (request, response) => {
    const account = requireAccount(accounts, request, response);
    if (account) {
      response.json({ meetings: meetings.forAccount(account.id) });
    }
  });

  router.post('/meetings', (request, response) => {
    const account = requireAccount(accounts, request, response);
    if (!account) {
      return;
    }
    const result = meetings.schedule(account, request.body);
    if (!result.ok) {
      response.status(400).json({ error: INVALID });
      return;
    }
    response.status(201).json({ meeting: result.meeting });
  });

  router.delete('/meetings/:id', (request, response) => {
    const account = requireAccount(accounts, request, response);
    if (!account) {
      return;
    }
    switch (meetings.cancel(account.id, request.params.id)) {
      case 'cancelled':
        response.status(204).end();
        return;
      case 'not-organizer':
        response.status(403).json({ error: NOT_YOURS });
        return;
      default:
        response.status(404).json({ error: UNKNOWN });
    }
  });

  return router;
}
