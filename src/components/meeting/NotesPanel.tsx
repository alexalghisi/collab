import { StyleSheet, Text, TextInput } from 'react-native';
import { colors } from '../../theme';
import { SidePanel } from './SidePanel';

export interface NotesPanelProps {
  notes: string;
  onChange: (text: string) => void;
  onClose: () => void;
}

/** One shared scratchpad per meeting; everyone edits the same text, last write wins. */
export function NotesPanel({ notes, onChange, onClose }: NotesPanelProps) {
  return (
    <SidePanel title="Shared notes" onClose={onClose}>
      <TextInput
        style={styles.editor}
        value={notes}
        onChangeText={onChange}
        placeholder="Agenda, decisions, action items — visible to everyone in the meeting."
        placeholderTextColor={colors.textSubtle}
        multiline
        textAlignVertical="top"
      />
      <Text style={styles.hint}>Notes live as long as the meeting room does.</Text>
    </SidePanel>
  );
}

const styles = StyleSheet.create({
  editor: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    padding: 16,
  },
  hint: {
    color: colors.textSubtle,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
