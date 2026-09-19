import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { reminderCopy, reminderSubject } from '../../../src/meeting/contact';
import type { InviteTransport } from './senders';

export interface MeetingReminder {
  readonly id: string;
  readonly to: string;
  readonly roomId: string;
  readonly hostName: string;
  readonly link: string;
  readonly title: string;
  readonly minutes: 15 | 30;
  readonly sendAt: number;
}

export function reminderSendAt(startsAt: number, minutes: number, now = Date.now()): number | null {
  if (startsAt <= now) {
    return null;
  }
  return Math.max(now, startsAt - minutes * 60_000);
}

export class ReminderBook {
  private items: MeetingReminder[];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now,
  ) {
    this.items = this.load();
  }

  list(): readonly MeetingReminder[] {
    return this.items;
  }

  schedule(
    input: Omit<MeetingReminder, 'id' | 'sendAt'> & { readonly startsAt: number },
  ): MeetingReminder | null {
    const sendAt = reminderSendAt(input.startsAt, input.minutes, this.now());
    if (sendAt === null) {
      return null;
    }
    const existing = this.items.find(
      (item) => item.to === input.to && item.roomId === input.roomId && item.sendAt === sendAt,
    );
    if (existing) {
      return existing;
    }
    const reminder: MeetingReminder = {
      id: `${input.roomId}:${input.to}:${sendAt}`,
      to: input.to,
      roomId: input.roomId,
      hostName: input.hostName,
      link: input.link,
      title: input.title,
      minutes: input.minutes,
      sendAt,
    };
    this.items = [...this.items, reminder];
    this.write();
    return reminder;
  }

  async dispatch(transport: InviteTransport): Promise<number> {
    const due = this.items.filter((item) => item.sendAt <= this.now());
    let sent = 0;
    for (const item of due) {
      try {
        await transport.sendEmail(
          item.to,
          reminderSubject(item.title, item.minutes),
          reminderCopy({
            title: item.title,
            hostName: item.hostName,
            link: item.link,
            minutes: item.minutes,
          }),
        );
        this.items = this.items.filter((entry) => entry.id !== item.id);
        sent += 1;
      } catch {
        continue;
      }
    }
    if (sent > 0) {
      this.write();
    }
    return sent;
  }

  start(transport: InviteTransport, everyMs = 15_000): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.dispatch(transport);
    }, everyMs);
    void this.dispatch(transport);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private load(): MeetingReminder[] {
    if (!existsSync(this.path)) {
      return [];
    }
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as {
        reminders?: MeetingReminder[];
      };
      return Array.isArray(parsed.reminders) ? parsed.reminders : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify({ reminders: this.items }, null, 2)}\n`);
  }
}
