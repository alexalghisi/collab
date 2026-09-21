import { describe, expect, it, vi } from 'vitest';
import { deleteMeeting } from './deleteMeeting';
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

describe('deleteMeeting sequence', () => {
  it('does not remove the local row when retract fails', async () => {
    const retract = vi
      .fn()
      .mockRejectedValue(new Error('Google Calendar access expired. Connect it again.'));
    const remove = vi.fn().mockResolvedValue(undefined);

    await expect(deleteMeeting(meeting, retract, remove)).rejects.toThrow(
      'Google Calendar access expired. Connect it again.',
    );

    expect(retract).toHaveBeenCalledOnce();
    expect(retract).toHaveBeenCalledWith(meeting);
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes the local row only after retract succeeds', async () => {
    const order: string[] = [];
    const retract = vi.fn(async () => {
      order.push('retract');
    });
    const remove = vi.fn(async (id: string) => {
      order.push(`remove:${id}`);
    });

    await deleteMeeting(meeting, retract, remove);

    expect(order).toEqual(['retract', 'remove:m1']);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('m1');
  });
});
