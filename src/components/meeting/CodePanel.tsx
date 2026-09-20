import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Editor, { type OnMount } from '@monaco-editor/react';
import { applyFormattedCode } from '../../code/formatSource';
import type { CodeLanguage } from '../../code/languages';
import type { CodePresence, SharedCodeDocument } from '../../code/SharedCodeDocument';
import {
  MonacoTextBinding,
  decorationsFor,
  type DecorationsCollection,
  type EditorApi,
  type MonacoApi,
} from '../../code/monacoBinding';
import { cursorClass, remoteCursorCss } from '../../code/remoteCursorStyle';
import type { CodeRun } from '../../hooks/useCollabSession';
import { cppSidecarsIfNeeded, type WorkspaceFile } from '../../code/workspaceFiles';
import { colors } from '../../theme';
import { CodeControls } from './CodeControls';
import { CodeFileManager, CODE_MAIN_FILE } from './CodeFileManager';
import { CodeOutput } from './CodeOutput';

export interface CodePanelProps {
  document: SharedCodeDocument;
  runs: CodeRun[];
  files: WorkspaceFile[];
  selfPeerId: string | null;
  onRun: (stdin: string, files: WorkspaceFile[], source?: string) => void;
  onFilesChange: (files: WorkspaceFile[]) => void;
}

const STYLE_ELEMENT_ID = 'collab-remote-cursors';

function ensureCursorStyles(editors: CodePresence[]): void {
  const sheet =
    document.getElementById(STYLE_ELEMENT_ID) ??
    document.head.appendChild(
      Object.assign(document.createElement('style'), { id: STYLE_ELEMENT_ID }),
    );
  sheet.textContent = remoteCursorCss(editors);
}

/** The shared editor: Monaco bound to the room's document, cursors and all. */
export function CodePanel({
  document: shared,
  runs,
  files,
  selfPeerId,
  onRun,
  onFilesChange,
}: CodePanelProps) {
  const [language, setLanguage] = useState<CodeLanguage>(shared.language);
  const [editors, setEditors] = useState<CodePresence[]>(shared.presence());
  const [stdin, setStdin] = useState('');
  const [selected, setSelected] = useState(CODE_MAIN_FILE);
  const bindingRef = useRef<MonacoTextBinding | null>(null);
  const decorationsRef = useRef<DecorationsCollection | null>(null);
  const editorRef = useRef<EditorApi | null>(null);
  const monacoRef = useRef<MonacoApi | null>(null);

  const running = runs.some((run) => run.running && run.byPeerId === selfPeerId);
  const openFile = files.find((file) => file.name === selected) ?? null;

  const editFile = (content: string): void => {
    if (!openFile) {
      return;
    }
    onFilesChange(files.map((file) => (file.name === openFile.name ? { ...file, content } : file)));
  };

  const paintCursors = useCallback(() => {
    const next = shared.presence();
    setEditors(next);
    if (typeof document === 'undefined') {
      return;
    }
    ensureCursorStyles(next);
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (editor && monaco && model) {
      decorationsRef.current?.set(decorationsFor(next, model, monaco, cursorClass));
    }
  }, [shared]);

  useEffect(
    () =>
      shared.onChange(() => {
        setLanguage(shared.language);
        paintCursors();
      }),
    [shared, paintCursors],
  );
  useEffect(() => shared.onPresence(paintCursors), [shared, paintCursors]);
  useEffect(() => () => bindingRef.current?.destroy(), []);
  useEffect(() => {
    if (selected !== CODE_MAIN_FILE && !files.some((file) => file.name === selected)) {
      setSelected(CODE_MAIN_FILE);
    }
  }, [files, selected]);
  useEffect(() => {
    const next = cppSidecarsIfNeeded(language, files);
    if (next) {
      onFilesChange(next);
    }
  }, [language, files, onFilesChange]);
  useEffect(() => {
    paintCursors();
  }, [paintCursors]);

  const mount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      bindingRef.current?.destroy();
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
        onFormat={() => applyFormattedCode(language, shared, files, openFile, onFilesChange)}
        onRun={() =>
          onRun(
            stdin,
            cppSidecarsIfNeeded(language, files) ?? files,
            editorRef.current?.getModel()?.getValue() ?? shared.text.toString(),
          )
        }
        running={running}
        editors={editors}
      />
      <View style={styles.body}>
        <CodeFileManager
          language={language}
          files={files}
          selected={selected}
          onSelect={setSelected}
          onChange={onFilesChange}
        />
        <View style={[styles.editor, openFile ? styles.hidden : null]}>
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
        {openFile && (
          <TextInput
            style={styles.fileEditor}
            value={openFile.content}
            onChangeText={editFile}
            multiline
            textAlignVertical="top"
            placeholder={`Contents of ${openFile.name}`}
            placeholderTextColor={colors.textSubtle}
          />
        )}
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
  body: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  editor: {
    flex: 1,
    overflow: 'hidden',
  },
  hidden: {
    width: 0,
    height: 0,
    flex: 0,
    overflow: 'hidden',
  },
  fileEditor: {
    flex: 1,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 12,
    textAlignVertical: 'top',
  },
});
