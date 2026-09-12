import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES } from '../../../src/files/attachments';
import { DEFAULT_FILE_LIMITS, FileStore } from './FileStore';

const upload = (overrides: Partial<Parameters<FileStore['put']>[0]> = {}) => ({
  roomId: 'room-1',
  sessionId: 'session-1',
  name: 'notes.txt',
  mimeType: 'text/plain',
  bytes: Buffer.from('hello'),
  ...overrides,
});

describe('FileStore', () => {
  it('serves back what it was given, under a url of its own choosing', () => {
    const store = new FileStore();

    const result = store.put(upload());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.attachment).toMatchObject({ name: 'notes.txt', mimeType: 'text/plain', size: 5 });
    expect(result.attachment.url).toBe(`/files/${result.attachment.id}`);
    expect(store.get(result.attachment.id)?.bytes.toString()).toBe('hello');
  });

  it('refuses a file over the cap', () => {
    const store = new FileStore();

    const result = store.put(upload({ bytes: Buffer.alloc(MAX_FILE_BYTES + 1) }));

    expect(result).toEqual({ ok: false, reason: 'file-too-large' });
  });

  it('refuses an empty file rather than storing nothing under a name', () => {
    const store = new FileStore();

    expect(store.put(upload({ bytes: Buffer.alloc(0) }))).toEqual({ ok: false, reason: 'no-file' });
  });

  it('caps what one room may hold in total', () => {
    const store = new FileStore({ ...DEFAULT_FILE_LIMITS, maxRoomBytes: 10 });

    expect(store.put(upload({ bytes: Buffer.alloc(6) })).ok).toBe(true);
    expect(store.put(upload({ bytes: Buffer.alloc(6) }))).toEqual({
      ok: false,
      reason: 'room-full',
    });
    // Another room has its own allowance.
    expect(store.put(upload({ roomId: 'room-2', bytes: Buffer.alloc(6) })).ok).toBe(true);
  });

  it('strips a path out of the name the sender chose', () => {
    const store = new FileStore();

    const result = store.put(upload({ name: '../../etc/passwd' }));

    expect(result.ok && result.attachment.name).toBe('passwd');
  });

  it('drops a room\u2019s files when the room goes, and keeps every other room\u2019s', () => {
    const store = new FileStore();
    const mine = store.put(upload());
    const theirs = store.put(upload({ roomId: 'room-2' }));

    store.clearRoom('room-1');

    expect(mine.ok && store.get(mine.attachment.id)).toBeUndefined();
    expect(theirs.ok && store.get(theirs.attachment.id)).toBeDefined();
    expect(store.bytesInRoom('room-1')).toBe(0);
  });
});
