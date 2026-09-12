import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { CodeLanguage } from '../../code/languages';
import type { CodePresence, SharedCodeDocument } from '../../code/SharedCodeDocument';
import {
  MonacoTextBinding,
  decorationsFor,
  type DecorationsCollection,
  type EditorApi,
  type MonacoApi,
} from '../../code/monacoBinding';
import type { CodeRun } from '../../hooks/useCollabSession';
import { colors } from '../../theme';
import { CodeControls } from './CodeControls';
import { CodeOutput } from './CodeOutput';

export interface CodePanelProps {
  document: SharedCodeDocument;
  runs: CodeRun[];
  selfPeerId: string | null;
  onRun: (stdin: string) => void;
}

const STYLE_ELEMENT_ID = 'collab-remote-cursors';

const cursorClass = (presence: CodePresence): string => `collab-cursor-${presence.clientId}`;

/**
 * Monaco styles decorations through CSS, so each remote participant needs a rule
 * of their own: their colour, and their name pinned to the caret the way a
 * shared document does it.
 */
function ensureCursorStyles(editors: CodePresence[]): void {
  const sheet =
    document.getElementById(STYLE_ELEMENT_ID) ??
    document.head.appendChild(
      Object.assign(document.createElement('style'), { id: STYLE_ELEMENT_ID }),
    );
  sheet.textContent = editors
    .map(
      (editor) => `
        .${cursorClass(editor)} {
          background-color: ${editor.color}44;
          border-left: 2px solid ${editor.color};
        }
        .${cursorClass(editor)}::after {
          content: '${editor.displayName.replace(/['\\]/g, '')}';
          position: absolute;
          transform: translateY(-100%);
          padding: 0 4px;
          font-size: 11px;
          white-space: nowrap;
          color: ${colors.background};
          background-color: ${editor.color};
          border-radius: 3px;
        }`,
    )
    .join('\n');
}

/** The shared editor: Monaco bound to the room's document, cursors and all. */
export function CodePanel({ document: shared, runs, selfPeerId, onRun }: CodePanelProps) {
  const [language, setLanguage] = useState<CodeLanguage>(shared.language);
  const [editors, setEditors] = useState<CodePresence[]>(shared.presence());
  const [stdin, setStdin] = useState('');
  const bindingRef = useRef<MonacoTextBinding | null>(null);
  const decorationsRef = useRef<DecorationsCollection | null>(null);
  const editorRef = useRef<EditorApi | null>(null);
  const monacoRef = useRef<MonacoApi | null>(null);

  const running = runs.some((run) => run.running && run.byPeerId === selfPeerId);

  useEffect(() => shared.onChange(() => setLanguage(shared.language)), [shared]);
  useEffect(() => shared.onPresence(() => setEditors(shared.presence())), [shared]);
  useEffect(() => () => bindingRef.current?.destroy(), []);

  useEffect(() => {
    ensureCursorStyles(editors);
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (editor && monaco && model) {
      decorationsRef.current?.set(decorationsFor(editors, model, monaco, cursorClass));
    }
  }, [editors]);

  const mount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      bindingRef.current = new MonacoTextBinding(shared, editor, monaco);
      decorationsRef.current = editor.createDecorationsCollection([]);
    },
    [shared],
  );

  return (
    <View style={styles.panel}>
      <CodeControls
        language={language}
        onLanguageChange={(next) => shared.setLanguage(next)}
        stdin={stdin}
        onStdinChange={setStdin}
        onRun={() => onRun(stdin)}
        running={running}
        editors={editors}
      />
      <View style={styles.editor}>
        <Editor
          language={language}
          theme="vs-dark"
          defaultValue=""
          onMount={mount}
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      </View>
      <CodeOutput runs={runs} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: colors.background,
  },
  editor: {
    flex: 1,
    overflow: 'hidden',
  },
});
