import { describe, expect, it } from 'vitest';
import type { CodePresence } from './SharedCodeDocument';
import { cursorClass, cursorLanes, remoteCursorCss } from './remoteCursorStyle';

const linus: CodePresence = {
  clientId: 7,
  peerId: 'b',
  displayName: 'Linus',
  color: '#60a5fa',
  selection: { start: 0, end: 0 },
  editing: false,
};

describe('remoteCursorCss', () => {
  it('tints the selection lightly so the code under it stays readable', () => {
    const css = remoteCursorCss([linus]);

    expect(cursorClass(linus)).toBe('collab-cursor-7');
    expect(css).toContain('background-color: #60a5fa21');
    expect(css).toContain('pointer-events: none');
    expect(css).toContain("content: 'Linus'");
    expect(css).toContain('.monaco-editor .collab-cursor-7-caret');
    expect(css).toContain('top: 0px');
    expect(css).toContain('left: 3px');
  });

  it('leaves the name badge see-through, so the code behind it still reads', () => {
    const css = remoteCursorCss([linus]);

    expect(css).toContain('background-color: #60a5fa99');
    expect(css).toContain('opacity: 0.45');
  });

  it('shows the badge of whoever is typing at full strength', () => {
    const css = remoteCursorCss([{ ...linus, editing: true }]);

    expect(css).toContain('opacity: 1');
    expect(css).not.toContain('opacity: 0.45');
  });

  it('keeps the caret stroke solid, since that is what has to be seen', () => {
    expect(remoteCursorCss([linus])).toContain('border-left: 2px solid #60a5fa');
  });

  it('pays for the caret stroke on both sides, so the code does not shift', () => {
    const css = remoteCursorCss([linus]);

    expect(css).toContain('margin-left: -1px');
    expect(css).toContain('margin-right: -1px');
  });

  it('clips a name that would otherwise cover the line it sits on', () => {
    const css = remoteCursorCss([{ ...linus, displayName: 'Someone With A Very Long Name' }]);

    expect(css).toContain('max-width: 150px');
    expect(css).toContain('text-overflow: ellipsis');
  });

  it('lifts a badge onto the row its lane asks for', () => {
    const css = remoteCursorCss([linus], () => 2);

    expect(css).toContain('top: -30px');
  });

  it('lets clicks through to the code under a remote caret and its label', () => {
    expect(remoteCursorCss([linus]).match(/pointer-events: none/g)).toHaveLength(2);
  });

  it('gives every participant a rule of their own', () => {
    const css = remoteCursorCss([
      linus,
      { ...linus, clientId: 9, displayName: 'Ada', color: '#f472b6' },
    ]);

    expect(css).toContain('.collab-cursor-7-caret');
    expect(css).toContain('.collab-cursor-9-caret');
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

describe('cursorLanes', () => {
  /** Ten columns to a line, which is enough to put carets near or far apart. */
  const positionOf = (offset: number) => ({
    lineNumber: Math.floor(offset / 10) + 1,
    column: (offset % 10) + 1,
  });
  const at = (clientId: number, offset: number, displayName = 'Linus'): CodePresence => ({
    ...linus,
    clientId,
    displayName,
    selection: { start: offset, end: offset, head: offset },
  });

  it('leaves everyone on their own line beside their caret', () => {
    const lanes = cursorLanes([at(7, 0), at(9, 10), at(11, 20)], positionOf);

    expect([...lanes.values()]).toEqual([0, 0, 0]);
  });

  it('stacks two names that would print over each other', () => {
    const lanes = cursorLanes([at(7, 1), at(9, 3)], positionOf);

    expect(lanes.get(7)).toBe(0);
    expect(lanes.get(9)).toBe(1);
  });

  it('keeps the lower row for a caret far enough along the same line', () => {
    const lanes = cursorLanes([at(7, 0, 'Jo'), at(9, 8)], positionOf);

    expect(lanes.get(7)).toBe(0);
    expect(lanes.get(9)).toBe(0);
  });

  it('reuses a row once the badge above it has ended', () => {
    const lanes = cursorLanes([at(7, 0, 'Jo'), at(9, 5), at(11, 1)], positionOf);

    expect(lanes.get(7)).toBe(0);
    expect(lanes.get(11)).toBe(1);
    expect(lanes.get(9)).toBe(0);
  });

  it('ranks the carets by position rather than by arrival', () => {
    const lanes = cursorLanes([at(9, 3), at(7, 1)], positionOf);

    expect(lanes.get(7)).toBe(0);
    expect(lanes.get(9)).toBe(1);
  });

  it('skips a participant who has no cursor yet', () => {
    const lanes = cursorLanes([{ ...linus, selection: null }], positionOf);

    expect(lanes.size).toBe(0);
  });
});
