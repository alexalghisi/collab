import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReminderBook, reminderSendAt } from './reminders';

describe('ReminderBook', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const book = (now: number) => {
    const dir = mkdtempSync(join(tmpdir(), 'collab-reminders-'));
    dirs.push(dir);
    return new ReminderBook(join(dir, 'reminders.json'), () => now);
  };

  it('queues a reminder 15 minutes before start and not after the meeting has begun', () => {
    expect(reminderSendAt(1_000_000, 15, 100_000)).toBe(1_000_000 - 15 * 60_000);
    expect(reminderSendAt(1_000_000, 15, 900_000)).toBe(900_000);
    expect(reminderSendAt(1_000_000, 15, 2_000_000)).toBeNull();
  });

  it('mails everyone who is due and leaves later reminders alone', async () => {
    const reminders = book(900_000);
    const sendEmail = vi.fn(async () => undefined);
    reminders.schedule({
      to: 'ada@example.com',
      roomId: 'room-1',
      hostName: 'Ada',
      link: 'https://collab.example/?room=room-1',
      title: 'Standup',
      minutes: 15,
      startsAt: 900_000 + 15 * 60_000,
    });
    reminders.schedule({
      to: 'linus@example.com',
      roomId: 'room-1',
      hostName: 'Ada',
      link: 'https://collab.example/?room=room-1',
      title: 'Standup',
      minutes: 30,
      startsAt: 900_000 + 40 * 60_000,
    });

    await expect(reminders.dispatch({ sendEmail, sendSms: vi.fn() })).resolves.toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      'ada@example.com',
      'Standup starts in 15 minutes',
      expect.stringContaining('Join:'),
    );
    expect(reminders.list()).toHaveLength(1);
    expect(reminders.list()[0]?.to).toBe('linus@example.com');
  });
});
