import { describe, expect, it } from 'vitest';
import { generateRoomId, normalizeRoomId, roomIdFromGuests, roomSlugFromText } from './roomId';

describe('roomSlugFromText', () => {
  it('uses the mailbox name and drops digits', () => {
    expect(roomSlugFromText('alexcoman711@gmail.com')).toBe('alexcoman');
  });

  it('turns a person name into a readable slug', () => {
    expect(roomSlugFromText('Matej Keveresan')).toBe('matej-keveresan');
  });

  it('keeps two given names from a spoken address', () => {
    expect(roomSlugFromText('alex coman')).toBe('alex-coman');
  });

  it('reads the guest out of a meeting title', () => {
    expect(roomSlugFromText('Meeting with Matej Keveresan')).toBe('matej-keveresan');
  });

  it('returns null for empty noise', () => {
    expect(roomSlugFromText('   ')).toBeNull();
    expect(roomSlugFromText('711')).toBeNull();
  });
});

describe('roomIdFromGuests', () => {
  it('prefers the first email guest', () => {
    expect(roomIdFromGuests(['alexcoman711@gmail.com', 'other@x.com'], 'Standup')).toBe(
      'alexcoman',
    );
  });

  it('falls back to the title when guests are only phone numbers', () => {
    expect(roomIdFromGuests(['+15551234567'], 'Call with Matej Keveresan')).toBe('matej-keveresan');
  });

  it('keeps a random style id when nothing readable exists', () => {
    const id = roomIdFromGuests([], '');
    expect(id).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
  });
});

describe('normalizeRoomId', () => {
  it('lets someone type the name they were invited with', () => {
    expect(normalizeRoomId('Matej Keveresan')).toBe('matej-keveresan');
  });

  it('still accepts the older segmented codes', () => {
    expect(normalizeRoomId('kqz-wrtm-pfa')).toBe('kqz-wrtm-pfa');
  });
});

describe('generateRoomId', () => {
  it('still returns three letter groups for instant calls', () => {
    expect(generateRoomId()).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  });
});
