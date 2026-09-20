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
  onFormat: () => void;
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
  onFormat,
  onRun,
  running,
  editors,
}: CodeControlsProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <ScrollView
          horizontal
          style={styles.languageScroll}
          contentContainerStyle={styles.languages}
        >
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

        <Button
          label="Format"
          icon="code-slash-outline"
          variant="secondary"
          compact
          onPress={onFormat}
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
            <View
              key={editor.clientId}
              style={[styles.editorDot, { backgroundColor: editor.color }]}
            >
              <Text style={styles.editorInitial}>
                {editor.displayName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <TextInput
        style={styles.stdin}
        value={stdin}
        onChangeText={onStdinChange}
        placeholder="Standard input (stdin)"
        placeholderTextColor={colors.textSubtle}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Standard input"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  languageScroll: {
    flex: 1,
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
    marginHorizontal: 12,
    marginBottom: 12,
    minHeight: 120,
    maxHeight: 240,
    color: colors.text,
    fontSize: 13,
    fontFamily: 'monospace',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
