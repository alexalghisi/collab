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

  it('sends an SMS reminder when the recipient is a phone number', async () => {
    const reminders = book(900_000);
    const sendSms = vi.fn(async () => undefined);
    reminders.schedule({
      to: '+40721123456',
      roomId: 'room-1',
      hostName: 'Ada',
      link: 'https://collab.example/?room=room-1',
      title: 'Standup',
      minutes: 15,
      startsAt: 900_000 + 15 * 60_000,
    });

    await expect(reminders.dispatch({ sendEmail: vi.fn(), sendSms })).resolves.toBe(1);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledWith(
      '+40721123456',
      expect.stringContaining('Ada invited you to a Collab call. Join:'),
    );
    expect(reminders.list()).toHaveLength(0);
  });

  it('queues three emails at 15, 10 and 5 minutes and sends each when due', async () => {
    const now = 100_000;
    const startsAt = now + 20 * 60_000;
    const reminders = book(now);
    expect(
      reminders.scheduleSeries({
        to: 'linus@example.com',
        roomId: 'room-1',
        hostName: 'Ada',
        link: 'https://collab.example/?room=room-1',
        title: 'Standup',
        startsAt,
      }),
    ).toHaveLength(3);
    expect(reminders.list().map((item) => item.minutes)).toEqual([15, 10, 5]);
    expect(reminders.list().map((item) => item.sendAt)).toEqual([
      startsAt - 15 * 60_000,
      startsAt - 10 * 60_000,
      startsAt - 5 * 60_000,
    ]);

    const sendEmail = vi.fn(async () => undefined);
    const transport = { sendEmail, sendSms: vi.fn() };
    await expect(reminders.dispatch(transport)).resolves.toBe(0);

    const later = new ReminderBook(join(dirs[0]!, 'reminders.json'), () => startsAt - 15 * 60_000);
    await expect(later.dispatch(transport)).resolves.toBe(1);
    expect(sendEmail).toHaveBeenLastCalledWith(
      'linus@example.com',
      'Standup starts in 15 minutes',
      expect.stringContaining('15 minutes'),
    );

    const mid = new ReminderBook(join(dirs[0]!, 'reminders.json'), () => startsAt - 10 * 60_000);
    await expect(mid.dispatch(transport)).resolves.toBe(1);
    expect(sendEmail).toHaveBeenLastCalledWith(
      'linus@example.com',
      'Standup starts in 10 minutes',
      expect.stringContaining('10 minutes'),
    );

    const last = new ReminderBook(join(dirs[0]!, 'reminders.json'), () => startsAt - 5 * 60_000);
    await expect(last.dispatch(transport)).resolves.toBe(1);
    expect(sendEmail).toHaveBeenLastCalledWith(
      'linus@example.com',
      'Standup starts in 5 minutes',
      expect.stringContaining('5 minutes'),
    );
    expect(last.list()).toHaveLength(0);
  });
});
