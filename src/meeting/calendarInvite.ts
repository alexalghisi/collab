import { InviteError, type ParsedContact } from './contact';
import { sendContactInvite, type InviteRequest } from './sendInvite';
import { INITIAL_PEER_STATE } from '../signaling/events';
import { createSocketSignaling } from '../signaling/SocketSignaling';
import { AdmissionDeniedError, SignalingUnavailableError } from '../signaling/SignalingChannel';

const EMAIL_UNAVAILABLE = 'Email invites are not configured on the server.';

export async function sendMeetingInvite(
  baseUrl: string,
  request: InviteRequest,
): Promise<ParsedContact> {
  if (request.sessionId !== '') {
    return sendContactInvite(baseUrl, request);
  }

  const sessionId = crypto.randomUUID();
  const channel = createSocketSignaling(baseUrl)({
    sessionId,
    roomId: request.roomId,
    displayName: request.hostName,
    state: { ...INITIAL_PEER_STATE, audioMuted: true, videoOff: true },
  });
  try {
    await channel.connect();
    return await sendContactInvite(baseUrl, { ...request, sessionId });
  } catch (cause) {
    if (cause instanceof SignalingUnavailableError) {
      throw new InviteError('Could not reach the invite service.');
    }
    if (cause instanceof AdmissionDeniedError) {
      throw new InviteError('You are no longer in this meeting.');
    }
    throw cause;
  } finally {
    channel.disconnect();
  }
}

export async function deliverMeetingGuests(input: {
  send: () => Promise<unknown>;
  mailThroughCalendar: () => Promise<void>;
}): Promise<'server' | 'calendar'> {
  try {
    await input.send();
    return 'server';
  } catch (cause) {
    if (!(cause instanceof InviteError) || cause.message !== EMAIL_UNAVAILABLE) {
      throw cause;
    }
    try {
      await input.mailThroughCalendar();
    } catch (calendarCause) {
      if (calendarCause instanceof Error && calendarCause.message.includes('not configured')) {
        throw cause;
      }
      throw calendarCause;
    }
    return 'calendar';
  }
}
