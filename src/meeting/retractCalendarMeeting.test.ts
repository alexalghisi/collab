import { describe, expect, it, vi } from 'vitest';
import { retractCalendarMeeting } from './googleCalendar';
import type { Meeting } from './types';

const meeting: Meeting = {
  id: 'm1',
  title: 'Weekly sync',
  roomId: 'kqz-wrtm-pfa',
  startsAt: Date.parse('2026-09-16T09:00:00.000Z'),
  durationMinutes: 45,
  description: 'Agenda and notes',
  createdAt: 0,
  googleEventId: 'evt-1',
  fromGoogle: true,
};

const expired = Object.assign(new Error('Google Calendar access expired. Connect it again.'), {
  status: 401,
});

describe('retractCalendarMeeting', () => {
  it('skips Google when the meeting has no googleEventId', async () => {
    const requestConsentToken = vi.fn(async () => 'ya29.consent');
    const retractEvent = vi.fn(async () => undefined);

    await retractCalendarMeeting(
      { ...meeting, googleEventId: undefined, fromGoogle: false },
      'ya29.stored',
      requestConsentToken,
      retractEvent,
    );

    expect(requestConsentToken).not.toHaveBeenCalled();
    expect(retractEvent).not.toHaveBeenCalled();
  });

  it('uses the stored token and does not prompt', async () => {
    const requestConsentToken = vi.fn(async () => 'ya29.consent');
    const retractEvent = vi.fn(async () => undefined);

    await retractCalendarMeeting(meeting, 'ya29.stored', requestConsentToken, retractEvent);

    expect(requestConsentToken).not.toHaveBeenCalled();
    expect(retractEvent).toHaveBeenCalledOnce();
    expect(retractEvent).toHaveBeenCalledWith('ya29.stored', meeting);
  });

  it('asks for consent on the delete click when no token is stored', async () => {
    const requestConsentToken = vi.fn(async () => 'ya29.consent');
    const retractEvent = vi.fn(async () => undefined);

    await retractCalendarMeeting(meeting, null, requestConsentToken, retractEvent);

    expect(requestConsentToken).toHaveBeenCalledOnce();
    expect(retractEvent).toHaveBeenCalledWith('ya29.consent', meeting);
  });

  it('treats a 404 from Google as already gone', async () => {
    const requestConsentToken = vi.fn(async () => 'ya29.consent');
    const retractEvent = vi.fn(async () => undefined);

    await expect(
      retractCalendarMeeting(meeting, 'ya29.stored', requestConsentToken, retractEvent),
    ).resolves.toBeUndefined();
    expect(requestConsentToken).not.toHaveBeenCalled();
  });

  it('asks for consent after 401 then DELETEs with the new token', async () => {
    const requestConsentToken = vi.fn(async () => 'ya29.consent');
    const retractEvent = vi.fn().mockRejectedValueOnce(expired).mockResolvedValueOnce(undefined);

    await retractCalendarMeeting(meeting, 'ya29.stale', requestConsentToken, retractEvent);

    expect(requestConsentToken).toHaveBeenCalledOnce();
    expect(retractEvent).toHaveBeenNthCalledWith(1, 'ya29.stale', meeting);
    expect(retractEvent).toHaveBeenNthCalledWith(2, 'ya29.consent', meeting);
  });

  it('rethrows when Google still returns 401 after consent', async () => {
    const requestConsentToken = vi.fn(async () => 'ya29.consent');
    const retractEvent = vi.fn().mockRejectedValue(expired);

    await expect(
      retractCalendarMeeting(meeting, 'ya29.stale', requestConsentToken, retractEvent),
    ).rejects.toThrow('Google Calendar access expired. Connect it again.');
    expect(requestConsentToken).toHaveBeenCalledOnce();
    expect(retractEvent).toHaveBeenCalledTimes(2);
  });
});
