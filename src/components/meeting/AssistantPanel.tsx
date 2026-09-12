import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AssistantThread } from '../../hooks/useCollabSession';
import { colors } from '../../theme';
import { SidePanel } from './SidePanel';

export interface AssistantPanelProps {
  turns: AssistantThread[];
  onAsk: (question: string) => void;
  onClose: () => void;
}

export function AssistantPanel({ turns, onAsk, onClose }: AssistantPanelProps) {
  const [draft, setDraft] = useState('');
  const pending = turns.some((turn) => turn.pending);

  const submit = (): void => {
    const question = draft.trim();
    if (!question || pending) {
      return;
    }
    onAsk(question);
    setDraft('');
  };

  return (
    <SidePanel title="Assistant" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.list}>
        {turns.length === 0 && (
          <Text style={styles.empty}>
            Ask what the room decided, who owns a follow-up, or where a topic came up. Answers use
            the live transcript, notes and chat.
          </Text>
        )}
        {turns.map((turn) => (
          <View key={turn.requestId} style={styles.block}>
            <Text style={styles.question}>{turn.question}</Text>
            {turn.pending && !turn.text && <Text style={styles.pending}>Thinking…</Text>}
            {turn.text !== '' && <Text style={styles.answer}>{turn.text}</Text>}
            {turn.actions.map((action, index) => (
              <Text key={`${turn.requestId}-${index}`} style={styles.action}>
                {action.type === 'decision' ? 'Decision' : 'Action'}
                {action.owner ? ` · ${action.owner}` : ''}: {action.text}
              </Text>
            ))}
            {turn.error && <Text style={styles.error}>{turn.error}</Text>}
          </View>
        ))}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          placeholder={pending ? 'Waiting for an answer…' : 'Ask about this meeting'}
          placeholderTextColor={colors.textSubtle}
          editable={!pending}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.send, (!draft.trim() || pending) && styles.sendDisabled]}
          onPress={submit}
          disabled={!draft.trim() || pending}
          accessibilityRole="button"
          accessibilityLabel="Ask the assistant"
        >
          <Ionicons name="send" size={18} color={colors.text} />
        </Pressable>
      </View>
    </SidePanel>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
    gap: 16,
  },
  empty: {
    color: colors.textSubtle,
    fontSize: 14,
    lineHeight: 20,
  },
  block: {
    gap: 6,
  },
  question: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  pending: {
    color: colors.textSubtle,
    fontSize: 14,
  },
  answer: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  action: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: '#f87171',
    fontSize: 13,
    lineHeight: 18,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendDisabled: {
    backgroundColor: colors.primaryDisabled,
  },
});
