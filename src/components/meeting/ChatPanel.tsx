import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage } from '../../signaling/events';
import { colors } from '../../theme';
import { SidePanel } from './SidePanel';

export interface ChatPanelProps {
  messages: ChatMessage[];
  selfPeerId: string | null;
  onSend: (text: string) => void;
  onClose: () => void;
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatPanel({ messages, selfPeerId, onSend, onClose }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<ScrollView>(null);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const submit = (): void => {
    const text = draft.trim();
    if (text) {
      onSend(text);
      setDraft('');
    }
  };

  return (
    <SidePanel title="Chat" onClose={onClose}>
      <ScrollView ref={listRef} contentContainerStyle={styles.list}>
        {messages.length === 0 && (
          <Text style={styles.empty}>No messages yet. Say hello to everyone.</Text>
        )}
        {messages.map((message) => {
          const mine = message.peerId === selfPeerId;
          return (
            <View key={message.id} style={[styles.message, mine && styles.messageMine]}>
              <View style={styles.meta}>
                <Text style={styles.author}>{mine ? 'You' : message.displayName}</Text>
                <Text style={styles.time}>{formatTime(message.sentAt)}</Text>
              </View>
              <Text style={styles.text}>{message.text}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          placeholder="Message everyone"
          placeholderTextColor={colors.textSubtle}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <Pressable
          style={[styles.send, !draft.trim() && styles.sendDisabled]}
          onPress={submit}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send message"
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
    gap: 12,
  },
  empty: {
    color: colors.textSubtle,
    textAlign: 'center',
    marginTop: 24,
  },
  message: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  messageMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  meta: {
    flexDirection: 'row',
    gap: 8,
  },
  author: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  time: {
    color: 'rgba(249, 250, 251, 0.7)',
    fontSize: 12,
  },
  text: {
    color: colors.text,
    fontSize: 14,
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
