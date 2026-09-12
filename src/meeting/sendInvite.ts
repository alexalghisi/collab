import { InviteError, parseContact, type ParsedContact } from './contact';

export interface InviteRequest {
  readonly contact: string;
  readonly roomId: string;
  readonly sessionId: string;
  readonly hostName: string;
  readonly link: string;
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
  const contact = parseContact(request.contact);
  if (!contact) {
    throw new InviteError('Enter an email address or a phone number.');
  }

  let response: Response;
  try {
    response = await fetch(inviteUrl(baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  return contact;
}
