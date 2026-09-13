import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CodeLanguage } from '../../code/languages';
import type { CodePresence, SharedCodeDocument } from '../../code/SharedCodeDocument';
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

/**
 * Monaco is a DOM editor and does not run under React Native, so the phone gets
 * a live read-only view of the same document: it follows every edit, picks the
 * language, and runs the code, but typing happens on web or desktop. A plain
 * TextInput was the alternative and was rejected — it cannot express a remote
 * cursor, and replacing its whole value on each remote edit fights the CRDT over
 * the caret.
 */
export function CodePanel({ document: shared, runs, selfPeerId, onRun }: CodePanelProps) {
  const [text, setText] = useState(shared.text.toString());
  const [language, setLanguage] = useState<CodeLanguage>(shared.language);
  const [editors, setEditors] = useState<CodePresence[]>(shared.presence());
  const [stdin, setStdin] = useState('');

  useEffect(
    () =>
      shared.onChange(() => {
        setText(shared.text.toString());
        setLanguage(shared.language);
      }),
    [shared],
  );
  useEffect(() => shared.onPresence(() => setEditors(shared.presence())), [shared]);

  const running = runs.some((run) => run.running && run.byPeerId === selfPeerId);

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
      <ScrollView style={styles.viewer} contentContainerStyle={styles.viewerContent}>
        <Text style={styles.code}>{text === '' ? '// Nothing written yet.' : text}</Text>
      </ScrollView>
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
  viewer: {
    flex: 1,
  },
  viewerContent: {
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
