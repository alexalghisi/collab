import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CodeLanguage } from '../../code/languages';
import { LANGUAGE_LABELS } from '../../code/languages';
import {
  isWorkspaceFileName,
  normalizeWorkspaceFiles,
  type WorkspaceFile,
} from '../../code/workspaceFiles';
import { colors } from '../../theme';

const MAIN_ID = '__main__';

export interface CodeFileManagerProps {
  language: CodeLanguage;
  files: WorkspaceFile[];
  selected: string;
  onSelect: (id: string) => void;
  onChange: (files: WorkspaceFile[]) => void;
}

function sourceName(language: CodeLanguage): string {
  switch (language) {
    case 'javascript':
      return 'main.js';
    case 'typescript':
      return 'main.ts';
    case 'python':
      return 'main.py';
    case 'go':
      return 'main.go';
    case 'cpp':
      return 'main.cpp';
  }
}

function nextName(existing: readonly string[]): string {
  for (let index = 1; index < 100; index += 1) {
    const name = index === 1 ? 'file.txt' : `file${index}.txt`;
    if (!existing.includes(name)) {
      return name;
    }
  }
  return 'file99.txt';
}

function askFileName(existing: readonly string[]): string | null {
  const suggestion = nextName(existing);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const typed = window.prompt('File name', suggestion);
    if (typed === null) {
      return null;
    }
    const name = typed.trim();
    return isWorkspaceFileName(name) ? name : suggestion;
  }
  return suggestion;
}

function downloadFile(file: WorkspaceFile): void {
  if (typeof document === 'undefined') {
    return;
  }
  const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(href);
}

/** Sidebar of files that sit next to the program when it runs. */
export function CodeFileManager({
  language,
  files,
  selected,
  onSelect,
  onChange,
}: CodeFileManagerProps) {
  const createFile = (): void => {
    const names = files.map((file) => file.name);
    const name = askFileName(names);
    if (!name || names.includes(name)) {
      return;
    }
    const next = normalizeWorkspaceFiles([...files, { name, content: '' }]);
    onChange(next);
    onSelect(name);
  };

  const removeFile = (name: string): void => {
    const next = files.filter((file) => file.name !== name);
    onChange(next);
    if (selected === name) {
      onSelect(MAIN_ID);
    }
  };

  return (
    <View style={styles.sidebar}>
      <Text style={styles.heading}>Files</Text>
      <ScrollView contentContainerStyle={styles.list}>
        <Pressable
          style={[styles.row, selected === MAIN_ID && styles.rowSelected]}
          onPress={() => onSelect(MAIN_ID)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${sourceName(language)}`}
        >
          <Ionicons name="code-slash-outline" size={14} color={colors.text} />
          <Text style={styles.name} numberOfLines={1}>
            {sourceName(language)}
          </Text>
        </Pressable>
        {files.map((file) => (
          <View key={file.name} style={[styles.row, selected === file.name && styles.rowSelected]}>
            <Pressable
              style={styles.rowMain}
              onPress={() => onSelect(file.name)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${file.name}`}
            >
              <Ionicons name="document-text-outline" size={14} color={colors.textMuted} />
              <Text style={styles.name} numberOfLines={1}>
                {file.name}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => downloadFile(file)}
              accessibilityRole="button"
              accessibilityLabel={`Download ${file.name}`}
            >
              <Ionicons name="download-outline" size={14} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => removeFile(file.name)}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${file.name}`}
            >
              <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <Pressable
        style={styles.add}
        onPress={createFile}
        accessibilityRole="button"
        accessibilityLabel="New file"
      >
        <Ionicons name="add" size={16} color={colors.text} />
        <Text style={styles.addLabel}>New file</Text>
      </Pressable>
      <Text style={styles.hint}>
        {LANGUAGE_LABELS[language]} reads and writes these by name. Keyboard input goes to stdin.
      </Text>
    </View>
  );
}

export { MAIN_ID as CODE_MAIN_FILE };

const styles = StyleSheet.create({
  sidebar: {
    width: 200,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
  },
  heading: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
  },
  list: {
    paddingHorizontal: 6,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rowSelected: {
    backgroundColor: colors.surfaceRaised,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'monospace',
    flexShrink: 1,
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    margin: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
  },
  addLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  hint: {
    color: colors.textSubtle,
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});
