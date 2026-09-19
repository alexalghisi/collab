import { describe, expect, it } from 'vitest';
import type { CodePresence } from './SharedCodeDocument';
import { cursorClassOf, cursorStyleSheet } from './cursorStyles';

const presence = (patch: Partial<CodePresence> = {}): CodePresence => ({
  clientId: 7,
  peerId: 'peer-a',
  displayName: 'Ada',
  color: '#60a5fa',
  selection: { start: 0, end: 4 },
  ...patch,
});

describe('remote cursor styles', () => {
  it('tints the selection instead of painting over the code', () => {
    const css = cursorStyleSheet([presence()]);

    expect(css).toContain('.collab-cursor-7 {');
    // #60a5fa at 18%: the syntax colours underneath still read as themselves.
    expect(css).toContain('background-color: #60a5fa2e;');
  });

  it('keeps the name badge see-through so the line above stays readable', () => {
    const css = cursorStyleSheet([presence()]);
    const badge = css.slice(css.indexOf('-label::after'));

    expect(badge).toContain("content: 'Ada';");
    expect(badge).toContain('color: #60a5fa;');
    expect(badge).toContain('background-color: #0b11208c;');
    expect(badge).toContain('border: 1px solid #60a5fa80;');
  });

  it('lets clicks through to the code under a remote caret', () => {
    const css = cursorStyleSheet([presence()]);

    expect(css.match(/pointer-events: none;/g)).toHaveLength(2);
  });

  it('keeps the caret itself solid, so its position is never in doubt', () => {
    expect(cursorStyleSheet([presence()])).toContain('border-left: 2px solid #60a5fa;');
  });

  it('gives every participant their own rule', () => {
    const css = cursorStyleSheet([
      presence(),
      presence({ clientId: 9, displayName: 'Bea', color: '#f472b6' }),
    ]);

    expect(css).toContain('.collab-cursor-7-label');
    expect(css).toContain('.collab-cursor-9-label');
    expect(css).toContain("content: 'Bea';");
  });

  it('cannot be talked out of the declaration by a crafted name', () => {
    const css = cursorStyleSheet([presence({ displayName: "x'; } body { display: none" })]);

    expect(css).toContain("content: 'x; } body { display: none';");
    expect(css).not.toContain("x';");
  });

  it('leaves a colour it cannot add an alpha byte to alone', () => {
    const css = cursorStyleSheet([presence({ color: 'rebeccapurple' })]);

    expect(css).toContain('background-color: rebeccapurple;');
  });

  it('names a class per participant', () => {
    expect(cursorClassOf(presence())).toBe('collab-cursor-7');
  });
});
