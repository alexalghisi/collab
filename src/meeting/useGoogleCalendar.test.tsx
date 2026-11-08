// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requestGoogleCalendarCode,
  requestGoogleCalendarToken,
  supportsCalendarOfflineGrant,
} from '../auth/googleWeb';
import {
  CALENDAR_NOT_CONNECTED,
  calendarServerStatus,
  connectCalendarOnServer,
  disconnectCalendarOnServer,
  refreshCalendarOnServer,
} from './calendarServer';
import { listGoogleEvents } from './googleCalendar';
import {
  readGoogleCalendarConnected,
  readGoogleCalendarGrant,
  writeGoogleCalendarConnected,
  writeGoogleCalendarGrant,
} from './googleCalendarStore';
import { useGoogleCalendar } from './useGoogleCalendar';
import type * as CalendarServer from './calendarServer';
import type * as GoogleCalendar from './googleCalendar';
import type { MeetingsState } from './useMeetings';

vi.mock('../auth/config', () => ({ readGoogleWebClientId: () => 'client-id' }));
vi.mock('../auth/googleWeb', () => ({
  requestGoogleCalendarCode: vi.fn(),
  requestGoogleCalendarToken: vi.fn(),
  supportsCalendarOfflineGrant: vi.fn(),
}));
vi.mock('./calendarServer', async (original) => ({
  ...(await original<typeof CalendarServer>()),
  calendarServerStatus: vi.fn(),
  connectCalendarOnServer: vi.fn(),
  disconnectCalendarOnServer: vi.fn(),
  refreshCalendarOnServer: vi.fn(),
}));
vi.mock('./googleCalendar', async (original) => ({
  ...(await original<typeof GoogleCalendar>()),
  listGoogleEvents: vi.fn(),
}));

const UID = 'user-1';
const ACCESS = { accessToken: 'access', expiresAt: Date.now() + 3_600_000, grant: 'renewed' };

const meetings: MeetingsState = {
  meetings: [],
  schedule: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  applyGoogle: vi.fn(async () => undefined),
  recordInstant: vi.fn(),
} as unknown as MeetingsState;

function expectNoGoogleWindow() {
  expect(requestGoogleCalendarCode).not.toHaveBeenCalled();
  expect(requestGoogleCalendarToken).not.toHaveBeenCalled();
}

async function mounted() {
  const hook = renderHook(() => useGoogleCalendar(UID, meetings));
  await waitFor(() => expect(calendarServerStatus).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
  return hook;
}

beforeEach(() => {
  localStorage.clear();
  writeGoogleCalendarConnected(UID, true);
  vi.mocked(supportsCalendarOfflineGrant).mockReturnValue(true);
  vi.mocked(calendarServerStatus).mockResolvedValue({ configured: true, connected: true });
  vi.mocked(refreshCalendarOnServer).mockResolvedValue(ACCESS);
  vi.mocked(disconnectCalendarOnServer).mockResolvedValue(undefined);
  vi.mocked(listGoogleEvents).mockResolvedValue({ events: [], nextSyncToken: 'next' });
});

afterEach(cleanup);

describe('useGoogleCalendar "Sync now"', () => {
  it('renews through the sealed grant, without any Google window', async () => {
    writeGoogleCalendarGrant(UID, 'sealed');
    const { result } = await mounted();

    await act(() => result.current.sync());

    expect(refreshCalendarOnServer).toHaveBeenCalledWith('sealed');
    expect(listGoogleEvents).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(readGoogleCalendarGrant(UID)).toBe('renewed');
    expectNoGoogleWindow();
  });

  it('stays connected and opens nothing when the server fails briefly', async () => {
    vi.mocked(refreshCalendarOnServer).mockRejectedValue(new Error('Google did not answer.'));
    const { result } = await mounted();

    await act(() => result.current.sync());

    expect(result.current.connected).toBe(true);
    expect(result.current.error).toMatch(/try again/i);
    expectNoGoogleWindow();
  });

  it('asks for a deliberate Connect, never a popup, when the grant is really gone', async () => {
    writeGoogleCalendarGrant(UID, 'revoked');
    vi.mocked(refreshCalendarOnServer).mockRejectedValue(new Error(CALENDAR_NOT_CONNECTED));
    const { result } = await mounted();

    await act(() => result.current.sync());

    expect(result.current.connected).toBe(false);
    expect(result.current.error).toMatch(/connect google calendar/i);
    expect(readGoogleCalendarConnected(UID)).toBe(false);
    expect(readGoogleCalendarGrant(UID)).toBeNull();
    expectNoGoogleWindow();
  });

  it('opens nothing while the server status is unknown', async () => {
    vi.mocked(calendarServerStatus).mockResolvedValue(null);
    const { result } = await mounted();

    await act(() => result.current.sync());

    expect(result.current.error).toMatch(/starting/i);
    expectNoGoogleWindow();
  });

  it('keeps the click-to-renew flow in the desktop shell, which has no offline grant', async () => {
    vi.mocked(supportsCalendarOfflineGrant).mockReturnValue(false);
    vi.mocked(requestGoogleCalendarToken).mockResolvedValue('desktop-token');
    const { result } = await mounted();

    await act(() => result.current.sync());

    expect(requestGoogleCalendarToken).toHaveBeenCalledWith('');
    expect(refreshCalendarOnServer).not.toHaveBeenCalled();
  });
});

describe('useGoogleCalendar connect and disconnect', () => {
  beforeEach(() => {
    writeGoogleCalendarConnected(UID, false);
    vi.mocked(calendarServerStatus).mockResolvedValue({ configured: true, connected: false });
  });

  it('keeps the sealed grant from the one-time consent', async () => {
    vi.mocked(requestGoogleCalendarCode).mockResolvedValue({
      code: 'code',
      redirectUri: 'postmessage',
    });
    vi.mocked(connectCalendarOnServer).mockResolvedValue({ ...ACCESS, grant: 'first' });
    const { result } = await mounted();

    await act(() => result.current.connect());

    expect(result.current.connected).toBe(true);
    expect(readGoogleCalendarGrant(UID)).toBe('first');
  });

  it('does not fall back to a short-lived connection while the status is unknown', async () => {
    vi.mocked(calendarServerStatus).mockResolvedValue(null);
    const { result } = await mounted();

    await act(() => result.current.connect());

    expect(result.current.connected).toBe(false);
    expect(result.current.error).toMatch(/starting/i);
    expectNoGoogleWindow();
  });

  it('sends the grant along on disconnect and forgets it', async () => {
    writeGoogleCalendarConnected(UID, true);
    writeGoogleCalendarGrant(UID, 'sealed');
    vi.mocked(refreshCalendarOnServer).mockResolvedValue({ ...ACCESS, grant: null });
    const { result } = await mounted();

    act(() => result.current.disconnect());

    expect(disconnectCalendarOnServer).toHaveBeenCalledWith('sealed');
    expect(readGoogleCalendarGrant(UID)).toBeNull();
  });
});
