import { colors } from '../theme';
import type { CodePresence } from './SharedCodeDocument';

/**
 * Monaco styles decorations through CSS, so each remote participant needs a rule
 * of their own: their colour, and their name pinned to the caret the way a
 * shared document does it.
 *
 * Everything a remote cursor draws sits on top of code somebody is reading — the
 * name badge covers the line above the caret, the selection covers the text it
 * spans. So both are see-through, and neither takes the pointer: a click lands
 * on the code, not on somebody else's label.
 */
export const CURSOR_STYLE_ELEMENT_ID = 'collab-remote-cursors';

export const cursorClassOf = (presence: CodePresence): string =>
  `collab-cursor-${presence.clientId}`;

/** Light enough that the syntax colours underneath still read as themselves. */
const SELECTION_OPACITY = 0.18;
/** The badge is a tint over the editor, not a sticker on it. */
const LABEL_BACKGROUND_OPACITY = 0.55;
const LABEL_BORDER_OPACITY = 0.5;

/** `#rrggbb` plus an alpha byte. A colour in any other notation is left alone. */
function translucent(color: string, opacity: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }
  const alpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${alpha}`;
}

export function cursorStyleSheet(editors: readonly CodePresence[]): string {
  return editors
    .map((editor) => {
      const className = cursorClassOf(editor);
      return `
        .${className} {
          background-color: ${translucent(editor.color, SELECTION_OPACITY)};
          border-radius: 2px;
        }
        .${className}-label {
          border-left: 2px solid ${editor.color};
          pointer-events: none;
        }
        .${className}-label::after {
          content: '${editor.displayName.replace(/['\\]/g, '')}';
          position: absolute;
          transform: translateY(-100%);
          padding: 0 4px;
          font-size: 11px;
          line-height: 1.4;
          white-space: nowrap;
          color: ${editor.color};
          background-color: ${translucent(colors.background, LABEL_BACKGROUND_OPACITY)};
          border: 1px solid ${translucent(editor.color, LABEL_BORDER_OPACITY)};
          border-radius: 3px;
          pointer-events: none;
        }`;
    })
    .join('\n');
}
