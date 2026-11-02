import { InviteError, parseContactList, type ParsedContact } from './contact';

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

/** A prefilled mail (all addresses) or SMS link for the same invite. */
export function composerUrl(contacts: readonly ParsedContact[], request: InviteRequest): string {
  const host = request.hostName.trim() || 'Someone';
  const what = request.title?.trim() ? `"${request.title.trim()}"` : 'a Collab meeting';
  const text = `${host} invited you to ${what}. Join here: ${request.link}`;
  const emails = contacts.filter((c) => c.kind === 'email').map((c) => c.value);
  if (emails.length > 0) {
    const subject = `Join ${what} on Collab`;
    return `mailto:${emails.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(text)}`;
  }
  const phones = contacts.map((c) => c.value).join(',');
  return `sms:${phones}?&body=${encodeURIComponent(text)}`;
}

function openComposer(contacts: readonly ParsedContact[], request: InviteRequest): boolean {
  const target = globalThis as { location?: { href: string } };
  if (contacts.length === 0 || !target.location) {
    return false;
  }
  try {
    target.location.href = composerUrl(contacts, request);
    return true;
  } catch {
    return false;
  }
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
  const contacts = parseContactList(request.contact);
  if (contacts.length === 0) {
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

  if (response.status === 503 && openComposer(contacts, request)) {
    // No mail/SMS provider on the server: the invite goes out from the host's own app.
    return contacts[0];
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as InviteResponseBody;
    throw new InviteError(
      typeof body.error === 'string' ? body.error : 'The invite could not be sent.',
    );
  }
  return contacts[0];
}
