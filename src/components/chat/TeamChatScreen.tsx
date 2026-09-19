import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TeamChat } from '../../chat/useTeamChat';
import { colors } from '../../theme';
import { SIDEBAR_MIN_WIDTH } from '../shell/AppShell';
import { IconButton } from '../ui/IconButton';
import { MessageThread } from './MessageThread';

export interface TeamChatScreenProps {
  chat: TeamChat;
  selfId: string | null;
}

export function TeamChatScreen({ chat, selfId }: TeamChatScreenProps) {
  const { width } = useWindowDimensions();
  const twoColumns = width >= SIDEBAR_MIN_WIDTH;
  const [newChannel, setNewChannel] = useState('');
  const active = chat.channels.find((channel) => channel.id === chat.activeChannelId) ?? null;

  if (!chat.enabled) {
    return (
      <View style={styles.disabled}>
        <Ionicons name="chatbubbles-outline" size={40} color={colors.textSubtle} />
        <Text style={styles.disabledTitle}>Team chat needs a shared backend</Text>
        <Text style={styles.disabledText}>
          Channels are stored in Firestore. Configure the Firebase project and sign in to chat with
          your team outside of meetings.
        </Text>
      </View>
    );
  }

  const submitChannel = () => {
    const name = newChannel.trim();
    if (name) {
      void chat.createChannel(name);
      setNewChannel('');
    }
  };

  const list = (
    <View style={[styles.channels, twoColumns && styles.channelsColumn]}>
      <Text style={styles.heading}>Channels</Text>
      <ScrollView contentContainerStyle={styles.channelList}>
        {chat.channels.length === 0 && (
          <Text style={styles.empty}>No channels yet. Create the first one below.</Text>
        )}
        {chat.channels.map((channel) => {
          const selected = channel.id === chat.activeChannelId;
          return (
            <Pressable
              key={channel.id}
              style={[styles.channel, selected && styles.channelSelected]}
              onPress={() => chat.selectChannel(channel.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={styles.hash}>#</Text>
              <Text style={[styles.channelName, selected && styles.channelNameSelected]}>
                {channel.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.newChannel}>
        <TextInput
          style={styles.input}
          value={newChannel}
          onChangeText={setNewChannel}
          onSubmitEditing={submitChannel}
          placeholder="New channel name"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
        />
        <IconButton icon="add" label="Create channel" onPress={submitChannel} color={colors.text} />
      </View>
    </View>
  );

  const thread = active && (
    <View style={styles.thread}>
      <View style={styles.threadHeader}>
        {!twoColumns && (
          <IconButton
            icon="chevron-back"
            label="Back to channels"
            onPress={() => chat.selectChannel(null)}
          />
        )}
        <Text style={styles.threadTitle}># {active.name}</Text>
      </View>
      <MessageThread
        messages={chat.messages}
        selfId={selfId}
        onSend={({ text }) => void chat.send(text)}
        onEdit={(id, text) => void chat.edit(id, text)}
        onDelete={(id) => void chat.remove(id)}
        placeholder={`Message #${active.name}`}
        emptyText="This channel is quiet. Start the conversation."
      />
    </View>
  );

  if (!twoColumns) {
    return <View style={styles.screen}>{thread ?? list}</View>;
  }

  return (
    <View style={[styles.screen, styles.row]}>
      {list}
      {thread ?? (
        <View style={styles.placeholder}>
          <Text style={styles.empty}>Pick a channel to start chatting.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
  },
  disabled: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  disabledTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  disabledText: {
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 20,
  },
  channels: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  channelsColumn: {
    flex: 0,
    width: 280,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  heading: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  channelList: {
    gap: 4,
  },
  empty: {
    color: colors.textSubtle,
    textAlign: 'center',
    marginTop: 16,
  },
  channel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  channelSelected: {
    backgroundColor: colors.surfaceRaised,
  },
  hash: {
    color: colors.textSubtle,
    fontSize: 16,
    fontWeight: '700',
  },
  channelName: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  channelNameSelected: {
    color: colors.text,
  },
  newChannel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  thread: {
    flex: 1,
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  threadTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
  },
});
