import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, Stroke } from '../signaling/events';
import type { TranscriptSegment } from '../transcript/segments';
import { loadChatHistory } from '../chat/history';
import { loadRoomSnapshot, mergeStrokes, mergeTranscript, saveRoomSnapshot } from './snapshot';

const memory = new Map<string, string>();

const message = (id: string, sentAt: number, text = id): ChatMessage => ({
  id,
  peerId: 'peer',
  displayName: 'Ada',
  text,
  sentAt,
  file: null,
});

const stroke = (id: string): Stroke => ({
  id,
  peerId: 'peer',
  color: '#111111',
  width: 2,
  points: [0, 0, 1, 1],
});

const turn = (id: string, startedAt: number): TranscriptSegment => ({
  id,
  peerId: 'peer',
  displayName: 'Ada',
  text: id,
  startedAt,
  endedAt: startedAt + 1,
});

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('room snapshot', () => {
  it('restores chat, notes, board, and captions for the same room after a reload', () => {
    const thread = [message('a', 1, 'hello')];
    const board = [stroke('s1')];
    const captions = [turn('t1', 10)];

    saveRoomSnapshot('room-1', {
      messages: thread,
      notes: 'agenda',
      strokes: board,
      transcript: captions,
    });

    expect(loadRoomSnapshot('room-1')).toEqual({
      messages: thread,
      notes: 'agenda',
      strokes: board,
      transcript: captions,
    });
    expect(loadChatHistory('room-1')).toEqual(thread);
    expect(loadRoomSnapshot('room-2')).toEqual({
      messages: [],
      notes: '',
      strokes: [],
      transcript: [],
    });
  });

  it('keeps existing notes when only the chat is updated', () => {
    saveRoomSnapshot('room-1', { notes: 'agenda', messages: [message('a', 1)] });
    saveRoomSnapshot('room-1', { messages: [message('a', 1), message('b', 2)] });

    expect(loadRoomSnapshot('room-1').notes).toBe('agenda');
    expect(loadRoomSnapshot('room-1').messages.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('drops malformed strokes and merges the rest by id', () => {
    expect(
      mergeStrokes([stroke('a')], undefined, [{ id: 'bad' } as Stroke], [stroke('b')]),
    ).toEqual([stroke('a'), stroke('b')]);
  });

  it('keeps a line and a letter stamp and drops a letter that is not a stamp', () => {
    const line: Stroke = { ...stroke('line'), kind: 'line', points: [0, 0, 1, 1] };
    const stamp: Stroke = { ...stroke('stamp'), kind: 'letter', text: 'A', points: [0.2, 0.3] };

    expect(mergeStrokes([line, stamp, { ...stamp, id: 'nope', text: 'hello' }])).toEqual([
      line,
      stamp,
    ]);
  });

  it('merges captions by id and ignores a missing list', () => {
    const first = turn('a', 1);
    const extra = turn('b', 2);

    expect(mergeTranscript([first], undefined, [first, extra])).toEqual([first, extra]);
  });
});
