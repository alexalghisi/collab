import { describe, expect, it } from 'vitest';
import type { CodePresence } from './SharedCodeDocument';
import { cursorClass, remoteCursorCss } from './remoteCursorStyle';

const linus: CodePresence = {
  clientId: 7,
  peerId: 'b',
  displayName: 'Linus',
  color: '#60a5fa',
  selection: { start: 0, end: 0 },
};

describe('remoteCursorCss', () => {
  it('tints the selection lightly so the code under it stays readable', () => {
    const css = remoteCursorCss([linus]);

    expect(cursorClass(linus)).toBe('collab-cursor-7');
    expect(css).toContain('background-color: #60a5fa22');
    expect(css).toContain('background-color: #60a5fa99');
    expect(css).toContain('opacity: 0.7');
    expect(css).toContain('pointer-events: none');
    expect(css).toContain("content: 'Linus'");
  });
});
