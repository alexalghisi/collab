export type ContactKind = 'email' | 'phone';

export interface ParsedContact {
  readonly kind: ContactKind;
  /** Canonical form used in mailto / SMS (email as typed, phone as +digits). */
  readonly value: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS = /[^\d+]/g;
const LOCAL_HOST = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])\b/i;

/**
 * Reads whatever the host typed and decides email vs phone. Anything else is
 * rejected so we do not hand a carrier or a mailbox garbage.
 */
export function parseContact(input: string): ParsedContact | null {
  const trimmed = input.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.includes('@')) {
    return EMAIL.test(trimmed) ? { kind: 'email', value: trimmed } : null;
  }
  const compact = trimmed.replace(PHONE_CHARS, '');
  const digits = compact.replace(/\+/g, '');
  if (digits.length < 8 || digits.length > 15 || !/^\+?\d+$/.test(compact)) {
    return null;
  }
  return { kind: 'phone', value: compact.startsWith('+') ? compact : `+${digits}` };
}

export function parseEmailList(input: string): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of input.split(/[,;\s]+/)) {
    const parsed = parseContact(part);
    if (parsed?.kind !== 'email') {
      continue;
    }
    const value = parsed.value.toLowerCase();
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    emails.push(value);
  }
  return emails;
}

export function parseContactList(input: string): ParsedContact[] {
  const seen = new Set<string>();
  const contacts: ParsedContact[] = [];
  for (const part of input.split(/[,;\n\r]+/)) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = parseContact(trimmed);
    if (!parsed) {
      continue;
    }
    const key = `${parsed.kind}:${parsed.value.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    contacts.push(parsed);
  }
  return contacts;
}

/**
 * Prefers a configured public origin so a phone does not receive a localhost
 * link the recipient cannot open. The client's own URL is used when it is
 * already reachable from the outside.
 */
export function resolveInviteLink(roomId: string, clientLink: string, publicBase = ''): string {
  const base = publicBase.trim();
  if (base !== '') {
    try {
      const url = new URL(base.includes('://') ? base : `https://${base}`);
      url.search = new URLSearchParams({ room: roomId }).toString();
      return url.toString();
    } catch {
      // Fall through to whatever the client sent.
    }
  }
  if (/^https?:\/\//i.test(clientLink) && !LOCAL_HOST.test(clientLink)) {
    return clientLink;
  }
  return /^https?:\/\//i.test(clientLink) ? clientLink : '';
}

export function inviteCopy(roomId: string, hostName: string, link: string): string {
  const host = hostName.trim() || 'Someone';
  if (/^https?:\/\//i.test(link)) {
    return `${host} invited you to a Collab meeting.\n\nJoin: ${link}`;
  }
  return `${host} invited you to a Collab meeting. Open Collab and join with ID ${roomId}.`;
}

/** One SMS segment when the host name is short; carriers concatenate if not. */
export function smsInviteCopy(roomId: string, hostName: string, link: string): string {
  const host = hostName.trim() || 'Someone';
  if (/^https?:\/\//i.test(link)) {
    return `${host} invited you to a Collab call. Join: ${link}`;
  }
  return `${host} invited you to a Collab call. Open Collab and join with ID ${roomId}`;
}

export function inviteSubject(roomId: string): string {
  return `Join my Collab meeting (${roomId})`;
}

export function reminderSubject(title: string, minutes: 15 | 30): string {
  const name = title.trim() || 'Your Collab meeting';
  return `${name} starts in ${minutes} minutes`;
}

export function reminderCopy(input: {
  readonly title: string;
  readonly hostName: string;
  readonly link: string;
  readonly minutes: 15 | 30;
}): string {
  const host = input.hostName.trim() || 'Someone';
  const name = input.title.trim() || 'a Collab meeting';
  return `${host} is starting ${name} in ${input.minutes} minutes.\n\nJoin: ${input.link}`;
}

export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteError';
  }
}
