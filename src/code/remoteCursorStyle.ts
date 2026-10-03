import { colors } from '../theme';
import type { CodePresence } from './SharedCodeDocument';

export const cursorClass = (presence: CodePresence): string => `collab-cursor-${presence.clientId}`;

/** Height of a name badge, and therefore the step between two stacked ones. */
const BADGE_HEIGHT = 15;

/** A badge is clipped past this, so a long name cannot blanket a line of code. */
const BADGE_MAX_WIDTH = 150;

/**
 * Roughly how many characters of code a badge covers. The badge is 11px over
 * 13px code, so each letter is a little narrower than a column, and the padding
 * and the gap after the caret add about two more.
 */
function badgeColumns(displayName: string): number {
  const shown = Math.min(displayName.length, Math.floor(BADGE_MAX_WIDTH / 7));
  return Math.ceil(shown * 0.9) + 2;
}

function caretOffset(presence: CodePresence): number | null {
  const selection = presence.selection;
  if (!selection) {
    return null;
  }
  return selection.head ?? selection.end;
}

/**
 * Decides which row each name badge sits on. Two carets on the same line would
 * otherwise print one name over the other, so a badge that would land on top of
 * one already placed is lifted a row, and the code keeps showing through
 * between them. Everyone who has a line to themselves stays on row zero, beside
 * their own caret.
 */
export function cursorLanes(
  editors: readonly CodePresence[],
  positionOf: (offset: number) => { readonly lineNumber: number; readonly column: number },
): Map<number, number> {
  const lanes = new Map<number, number>();
  /** Per line, the column each occupied row has been filled up to. */
  const filled = new Map<number, number[]>();
  const placed = editors
    .map((editor) => ({ editor, offset: caretOffset(editor) }))
    .filter((entry): entry is { editor: CodePresence; offset: number } => entry.offset !== null)
    .sort((left, right) => left.offset - right.offset);
  for (const { editor, offset } of placed) {
    const { lineNumber, column } = positionOf(offset);
    const ends = filled.get(lineNumber) ?? [];
    const free = ends.findIndex((end) => end <= column);
    const lane = free === -1 ? ends.length : free;
    ends[lane] = column + badgeColumns(editor.displayName);
    filled.set(lineNumber, ends);
    lanes.set(editor.clientId, lane);
  }
  return lanes;
}

/**
 * Rules for the remote carets, rewritten whenever presence changes. Only the
 * caret stroke is solid: the selection is a 13% tint and the name badge is its
 * owner's colour at 60% alpha, dimmed further while they are only reading, so
 * what is underneath stays legible. A badge at full strength means that person
 * is typing at this moment.
 */
export function remoteCursorCss(
  editors: readonly CodePresence[],
  laneOf: (presence: CodePresence) => number = () => 0,
): string {
  return editors
    .map((editor) => {
      const name = editor.displayName.replace(/['\\]/g, '');
      const klass = cursorClass(editor);
      const lift = laneOf(editor) * BADGE_HEIGHT;
      return `
        .${klass} {
          background-color: ${editor.color}21;
          border-radius: 2px;
        }
        .monaco-editor .${klass}-caret {
          border-left: 2px solid ${editor.color};
          /* Negative on both sides: the stroke costs no width, so nobody
             else's caret nudges the characters out from under the reader. */
          margin-left: -1px;
          margin-right: -1px;
          position: relative;
          pointer-events: none;
          z-index: 10;
        }
        .monaco-editor .${klass}-caret::after {
          content: '${name}';
          position: absolute;
          top: ${-lift}px;
          left: 3px;
          max-width: ${BADGE_MAX_WIDTH}px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 0 4px;
          font-size: 11px;
          line-height: ${BADGE_HEIGHT}px;
          font-weight: 700;
          color: ${colors.text};
          background-color: ${editor.color}99;
          opacity: ${editor.editing ? '1' : '0.45'};
          transition: opacity 120ms ease-out;
          border-radius: 3px;
          pointer-events: none;
          z-index: 20;
        }`;
    })
    .join('\n');
}
