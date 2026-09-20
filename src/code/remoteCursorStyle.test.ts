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

  it('lets clicks through to the code under a remote caret and its label', () => {
    expect(remoteCursorCss([linus]).match(/pointer-events: none/g)).toHaveLength(2);
  });

  it('gives every participant a rule of their own', () => {
    const css = remoteCursorCss([
      linus,
      { ...linus, clientId: 9, displayName: 'Ada', color: '#f472b6' },
    ]);

    expect(css).toContain('.collab-cursor-7-label');
    expect(css).toContain('.collab-cursor-9-label');
    expect(css).toContain("content: 'Ada'");
  });

  it('draws nothing when no one else is in the document', () => {
    expect(remoteCursorCss([])).toBe('');
  });

  it('cannot be talked out of the declaration by a crafted name', () => {
    const css = remoteCursorCss([{ ...linus, displayName: "x'; } body { display: none" }]);

    expect(css).toContain("content: 'x; } body { display: none'");
    expect(css).not.toContain("x';");
  });
});
