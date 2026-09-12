import { describe, expect, it } from 'vitest';
import { chunkText } from './chunk';

describe('chunkText', () => {
  it('returns nothing for blank input', () => {
    expect(chunkText('   \n')).toEqual([]);
  });

  it('keeps a short passage as a single chunk', () => {
    expect(chunkText('Ship on Thursday.')).toEqual(['Ship on Thursday.']);
  });

  it('splits a long passage and overlaps so a cut sentence is not lost', () => {
    const text = 'alpha '.repeat(40).trim();
    const chunks = chunkText(text, 40, 10);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeLessThanOrEqual(40);
    expect(chunks.at(-1)?.endsWith('alpha')).toBe(true);
    // The tail of the first chunk is the head of the second.
    const overlap = chunks[0].slice(-10).trim();
    expect(chunks[1].startsWith(overlap.split(' ')[0])).toBe(true);
  });
});
