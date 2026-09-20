import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { applyFormattedCode } from '../../code/formatSource';
import type { CodeLanguage } from '../../code/languages';
import type { CodePresence, SharedCodeDocument } from '../../code/SharedCodeDocument';
import type { WorkspaceFile } from '../../code/workspaceFiles';
import type { CodeRun } from '../../hooks/useCollabSession';
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

/**
 * Monaco is a DOM editor and does not run under React Native, so the phone gets
 * a live read-only view of the same document: it follows every edit, picks the
 * language, and runs the code, but typing happens on web or desktop. A plain
 * TextInput was the alternative and was rejected — it cannot express a remote
 * cursor, and replacing its whole value on each remote edit fights the CRDT over
 * the caret.
 */
export function CodePanel({
  document: shared,
  runs,
  files,
  selfPeerId,
  onRun,
  onFilesChange,
}: CodePanelProps) {
  const [text, setText] = useState(shared.text.toString());
  const [language, setLanguage] = useState<CodeLanguage>(shared.language);
  const [editors, setEditors] = useState<CodePresence[]>(shared.presence());
  const [stdin, setStdin] = useState('');
  const [selected, setSelected] = useState(CODE_MAIN_FILE);

  useEffect(
    () =>
      shared.onChange(() => {
        setText(shared.text.toString());
        setLanguage(shared.language);
      }),
    [shared],
  );
  useEffect(() => shared.onPresence(() => setEditors(shared.presence())), [shared]);
  useEffect(() => {
    if (selected !== CODE_MAIN_FILE && !files.some((file) => file.name === selected)) {
      setSelected(CODE_MAIN_FILE);
    }
  }, [files, selected]);

  const running = runs.some((run) => run.running && run.byPeerId === selfPeerId);
  const openFile = files.find((file) => file.name === selected) ?? null;

  return (
    <View style={styles.panel}>
      <CodeControls
        language={language}
        onLanguageChange={(next) => shared.setLanguage(next)}
        stdin={stdin}
        onStdinChange={setStdin}
        onFormat={() => applyFormattedCode(language, shared, files, openFile, onFilesChange)}
        onRun={() => onRun(stdin, files, text)}
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
        {openFile ? (
          <TextInput
            style={styles.fileEditor}
            value={openFile.content}
            onChangeText={(content) =>
              onFilesChange(
                files.map((file) => (file.name === openFile.name ? { ...file, content } : file)),
              )
            }
            multiline
            textAlignVertical="top"
          />
        ) : (
          <ScrollView style={styles.viewer} contentContainerStyle={styles.viewerContent}>
            <Text style={styles.code}>{text === '' ? '// Nothing written yet.' : text}</Text>
          </ScrollView>
        )}
      </View>
      <Text style={styles.hint}>Editing is available on web and desktop.</Text>
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
  viewer: {
    flex: 1,
  },
  viewerContent: {
    padding: 12,
  },
  fileEditor: {
    flex: 1,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 12,
  },
  code: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  hint: {
    color: colors.textSubtle,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
});
