import { colors } from '../theme';
import type { CodePresence } from './SharedCodeDocument';

export const cursorClass = (presence: CodePresence): string => `collab-cursor-${presence.clientId}`;

export function remoteCursorCss(editors: readonly CodePresence[]): string {
  return editors
    .map((editor) => {
      const name = editor.displayName.replace(/['\\]/g, '');
      const klass = cursorClass(editor);
      return `
        .${klass} {
          background-color: ${editor.color}33;
        }
        .monaco-editor .${klass}-caret {
          border-left: 2px solid ${editor.color};
          margin-left: -1px;
          position: relative;
          pointer-events: none;
          z-index: 10;
        }
        .monaco-editor .${klass}-caret::after {
          content: '${name}';
          position: absolute;
          top: 0;
          left: 2px;
          padding: 0 4px;
          font-size: 11px;
          line-height: 16px;
          font-weight: 700;
          white-space: nowrap;
          color: ${colors.background};
          background-color: ${editor.color};
          border-radius: 3px;
          pointer-events: none;
          z-index: 20;
        }`;
    })
    .join('\n');
}
