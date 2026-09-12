import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CODE_LANGUAGES, LANGUAGE_LABELS, type CodeLanguage } from '../../code/languages';
import type { CodePresence } from '../../code/SharedCodeDocument';
import { colors } from '../../theme';
import { Button } from '../ui/Button';

export interface CodeControlsProps {
  language: CodeLanguage;
  onLanguageChange: (language: CodeLanguage) => void;
  stdin: string;
  onStdinChange: (stdin: string) => void;
  onRun: () => void;
  running: boolean;
  editors: CodePresence[];
}

/** Language, input and Run, shared by the editor on web and the viewer on native. */
export function CodeControls({
  language,
  onLanguageChange,
  stdin,
  onStdinChange,
  onRun,
  running,
  editors,
}: CodeControlsProps) {
  return (
    <View style={styles.bar}>
      <ScrollView horizontal contentContainerStyle={styles.languages}>
        {CODE_LANGUAGES.map((option) => (
          <Pressable
            key={option}
            style={[styles.language, option === language && styles.languageActive]}
            onPress={() => onLanguageChange(option)}
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${LANGUAGE_LABELS[option]}`}
          >
            <Text style={[styles.languageText, option === language && styles.languageTextActive]}>
              {LANGUAGE_LABELS[option]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <TextInput
        style={styles.stdin}
        value={stdin}
        onChangeText={onStdinChange}
        placeholder="Input (stdin)"
        placeholderTextColor={colors.textSubtle}
      />

      <Button
        label={running ? 'Running…' : 'Run'}
        icon={running ? 'hourglass-outline' : 'play'}
        compact
        disabled={running}
        onPress={onRun}
      />

      <View style={styles.editors}>
        {editors.map((editor) => (
          <View key={editor.clientId} style={[styles.editorDot, { backgroundColor: editor.color }]}>
            <Text style={styles.editorInitial}>{editor.displayName.slice(0, 1).toUpperCase()}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  languages: {
    gap: 6,
    alignItems: 'center',
  },
  language: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
  },
  languageActive: {
    backgroundColor: colors.primary,
  },
  languageText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  languageTextActive: {
    color: colors.text,
  },
  stdin: {
    flex: 1,
    minWidth: 120,
    color: colors.text,
    fontSize: 13,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  editors: {
    flexDirection: 'row',
    gap: 4,
  },
  editorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorInitial: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '800',
  },
});
