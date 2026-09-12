import { describe, expect, it } from 'vitest';
import { MAX_SEGMENT_CHARS, normalizeTranscriptSegment } from './segments';

const valid = {
  id: 'seg-1',
  peerId: 'ada',
  displayName: 'Ada',
  text: 'Let’s take a look at the queue.',
  startedAt: 1_000,
  endedAt: 2_500,
};

describe('normalizeTranscriptSegment', () => {
  it('keeps a well-formed turn', () => {
    expect(normalizeTranscriptSegment(valid)).toEqual(valid);
  });

  it('fills in a missing display name rather than dropping the turn', () => {
    expect(normalizeTranscriptSegment({ ...valid, displayName: '  ' })).toMatchObject({
      displayName: 'Guest',
      text: valid.text,
    });
  });

  it('rejects an empty turn, a missing id, or a reversed time span', () => {
    expect(normalizeTranscriptSegment({ ...valid, text: '   ' })).toBeNull();
    expect(normalizeTranscriptSegment({ ...valid, id: '' })).toBeNull();
    expect(normalizeTranscriptSegment({ ...valid, endedAt: 500 })).toBeNull();
    expect(normalizeTranscriptSegment(null)).toBeNull();
  });

  it('clips a turn that would drown the room log', () => {
    const text = 'x'.repeat(MAX_SEGMENT_CHARS + 40);
    const segment = normalizeTranscriptSegment({ ...valid, text });
    expect(segment?.text).toHaveLength(MAX_SEGMENT_CHARS);
  });
});
