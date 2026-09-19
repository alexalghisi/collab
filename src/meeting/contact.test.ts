import { describe, expect, it } from 'vitest';
import {
  inviteCopy,
  parseContact,
  parseEmailList,
  reminderCopy,
  reminderSubject,
  resolveInviteLink,
  smsInviteCopy,
} from './contact';

describe('parseContact', () => {
  it('accepts an email and a phone, including common separators', () => {
    expect(parseContact('ada@example.com')).toEqual({
      kind: 'email',
      value: 'ada@example.com',
    });
    expect(parseContact('  +40 721 123 456  ')).toEqual({ kind: 'phone', value: '+40721123456' });
    expect(parseContact('0721-123-456')).toEqual({ kind: 'phone', value: '+0721123456' });
  });

  it('splits a pasted list of addresses and drops junk', () => {
    expect(parseEmailList('Ada@Example.com, linus@kernel.org; not-an-email  tom@collab.dev')).toEqual(
      ['ada@example.com', 'linus@kernel.org', 'tom@collab.dev'],
    );
  });

  it('rejects an empty field, a broken email, or too few digits', () => {
    expect(parseContact('   ')).toBeNull();
    expect(parseContact('ada@')).toBeNull();
    expect(parseContact('12345')).toBeNull();
    expect(parseContact('not a contact')).toBeNull();
  });
});

describe('invite copy', () => {
  it('puts the join link in the mail and a shorter line in the SMS', () => {
    const link = 'https://collab.example/?room=kqz-wrtm-pfa';
    expect(inviteCopy('kqz-wrtm-pfa', 'Ada', link)).toContain('Ada invited you');
    expect(inviteCopy('kqz-wrtm-pfa', 'Ada', link)).toContain(link);
    expect(smsInviteCopy('kqz-wrtm-pfa', 'Ada', link)).toBe(
      'Ada invited you to a Collab call. Join: https://collab.example/?room=kqz-wrtm-pfa',
    );
  });

  it('falls back to the meeting id when there is no https link', () => {
    expect(inviteCopy('kqz-wrtm-pfa', 'Ada', '')).toContain('join with ID kqz-wrtm-pfa');
    expect(smsInviteCopy('kqz-wrtm-pfa', 'Ada', '')).toContain('join with ID kqz-wrtm-pfa');
  });
});

describe('resolveInviteLink', () => {
  it('rewrites a localhost client link when a public origin is configured', () => {
    expect(
      resolveInviteLink(
        'kqz-wrtm-pfa',
        'http://localhost:8082/?room=kqz-wrtm-pfa',
        'https://collab.example',
      ),
    ).toBe('https://collab.example/?room=kqz-wrtm-pfa');
  });

  it('writes a reminder that names the meeting and the join link', () => {
    expect(reminderSubject('Standup', 15)).toBe('Standup starts in 15 minutes');
    expect(
      reminderCopy({
        title: 'Standup',
        hostName: 'Ada',
        link: 'https://collab.example/?room=room-1',
        minutes: 30,
      }),
    ).toBe('Ada is starting Standup in 30 minutes.\n\nJoin: https://collab.example/?room=room-1');
  });

  it('keeps a public client link when no override is set', () => {
    expect(resolveInviteLink('room-1', 'https://pages.example/collab/?room=room-1')).toBe(
      'https://pages.example/collab/?room=room-1',
    );
  });
});
