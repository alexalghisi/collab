import { InviteError, parseContact, parseEmailList, type ParsedContact } from './contact';

export interface InviteRequest {
  readonly contact: string;
  readonly roomId: string;
  readonly sessionId: string;
  readonly hostName: string;
  readonly link: string;
  readonly token?: string;
  readonly title?: string;
  readonly startsAt?: number;
  readonly reminderMinutes?: 15 | 30;
}

interface InviteResponseBody {
  readonly error?: unknown;
}

function inviteUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/invite`;
}

/**
 * Asks the signaling server to deliver the invite. The server is what talks to
 * the SMS / mail provider — the client only types the number.
 */
export async function sendContactInvite(
  baseUrl: string,
  request: InviteRequest,
): Promise<ParsedContact> {
  const emails = parseEmailList(request.contact);
  const contact = emails.length === 0 ? parseContact(request.contact) : null;
  if (emails.length === 0 && !contact) {
    throw new InviteError('Enter an email address or a phone number.');
  }

  let response: Response;
  try {
    response = await fetch(inviteUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(request.token ? { Authorization: `Bearer ${request.token}` } : {}),
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new InviteError('Could not reach the invite service.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as InviteResponseBody;
    throw new InviteError(
      typeof body.error === 'string' ? body.error : 'The invite could not be sent.',
    );
  }
  if (contact) {
    return contact;
  }
  return { kind: 'email', value: emails[0] ?? '' };
}
