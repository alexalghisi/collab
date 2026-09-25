import { describe, expect, it } from 'vitest';
import type { Stroke } from '../signaling/events';
import { BOARD_LETTERS, describeMark, sanitizeStroke } from './marks';

const size = { width: 200, height: 100 };

function stroke(overrides: Partial<Stroke> = {}): Stroke {
  return {
    id: 's1',
    peerId: 'peer',
    color: '#111',
    width: 3,
    points: [0, 0, 1, 1],
    ...overrides,
  };
}

describe('sanitizeStroke', () => {
  it('keeps a freehand stroke and forgets no tool', () => {
    expect(sanitizeStroke(stroke())).toEqual(stroke());
  });

  it('keeps a straight line as the drag from start to end', () => {
    expect(
      sanitizeStroke(stroke({ kind: 'line', points: [0.1, 0.2, 0.3, 0.4, 0.8, 0.9] })),
    ).toEqual(stroke({ kind: 'line', points: [0.1, 0.2, 0.8, 0.9] }));
  });

  it('keeps a letter stamp only when it is one of the predefined letters', () => {
    expect(BOARD_LETTERS).toEqual(['A', 'B', 'C', '✓', '?', '!']);
    expect(
      sanitizeStroke(stroke({ kind: 'letter', text: 'A', points: [0.2, 0.4, 0.9, 0.9] })),
    ).toEqual(stroke({ kind: 'letter', text: 'A', points: [0.2, 0.4] }));
    expect(sanitizeStroke(stroke({ kind: 'letter', text: 'hello' }))).toBeNull();
  });

  it('rejects a tool this board does not know', () => {
    expect(sanitizeStroke(stroke({ kind: 'spray' as Stroke['kind'] }))).toBeNull();
  });
});

describe('describeMark', () => {
  it('draws a straight line between the two ends', () => {
    const drawing = describeMark(stroke({ kind: 'line', points: [0, 0, 1, 1] }), size);

    expect(drawing.label).toBeNull();
    expect(drawing.d).toBe('M0 0 L200 100');
  });

  it('draws an arrow that ends at the drag point', () => {
    const drawing = describeMark(stroke({ kind: 'arrow', points: [0, 0.5, 1, 0.5] }), size);

    expect(drawing.d?.startsWith('M0 50 L200 50')).toBe(true);
    expect(drawing.d).toContain('M200 50 L');
  });

  it('places a predefined letter on the point that was tapped', () => {
    const drawing = describeMark(stroke({ kind: 'letter', text: '✓', points: [0.5, 0.5] }), size);

    expect(drawing.d).toBeNull();
    expect(drawing.label).toMatchObject({ text: '✓', x: 100, y: 50 });
  });
});
