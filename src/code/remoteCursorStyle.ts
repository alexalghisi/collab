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
          background-color: ${editor.color}22;
        }
        .${klass}-label {
          border-left: 2px solid ${editor.color};
          pointer-events: none;
        }
        .${klass}-label::after {
          content: '${name}';
          position: absolute;
          transform: translateY(-110%);
          padding: 0 3px;
          font-size: 10px;
          line-height: 14px;
          white-space: nowrap;
          color: ${colors.background};
          background-color: ${editor.color}99;
          border-radius: 2px;
          pointer-events: none;
          opacity: 0.7;
        }`;
    })
    .join('\n');
}
