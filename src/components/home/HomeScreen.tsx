import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatLongDay, formatTime } from '../../meeting/calendar';
import { generateRoomId } from '../../meeting/roomId';
import type { Meeting } from '../../meeting/types';
import { colors } from '../../theme';
import { MeetingList } from '../meetings/MeetingList';
import { splitByTime } from '../meetings/MeetingsScreen';
import { FilesCard } from './FilesCard';
import { Button } from '../ui/Button';
import type { IconName } from '../ui/icons';

export interface HomeScreenProps {
  displayName: string;
  ownerId: string;
  roomId: string;
  onRoomIdChange: (value: string) => void;
  onJoin: (roomId: string, video: boolean) => void;
  onSchedule: () => void;
  connecting: boolean;
  error: string | null;
  meetings: Meeting[];
  onStartMeeting: (meeting: Meeting) => void;
  onDeleteMeeting: (meeting: Meeting) => void;
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface ActionCardProps {
  icon: IconName;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}

function ActionCard({ icon, title, subtitle, color, onPress, disabled = false }: ActionCardProps) {
  return (
    <Pressable
      style={[styles.card, disabled && styles.cardDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.cardIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={26} color={colors.text} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

export function HomeScreen({
  displayName,
  ownerId,
  roomId,
  onRoomIdChange,
  onJoin,
  onSchedule,
  connecting,
  error,
  meetings,
  onStartMeeting,
  onDeleteMeeting,
}: HomeScreenProps) {
  const now = new Date();
  const hasName = displayName.trim().length > 0;
  const canJoin = hasName && roomId.trim().length > 0 && !connecting;
  const upNext = splitByTime(meetings).upcoming.slice(0, 3);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View>
        <Text style={styles.greeting}>
          {greeting(now.getHours())}
          {hasName ? `, ${displayName.trim()}` : ''}
        </Text>
        <Text style={styles.date}>
          {formatLongDay(now)} · {formatTime(now.getTime())}
        </Text>
      </View>

      <View style={styles.cards}>
        <ActionCard
          icon="videocam"
          title="New meeting"
          subtitle="Start now and invite others"
          color={colors.warning}
          onPress={() => onJoin(generateRoomId(), true)}
          disabled={!hasName || connecting}
        />
        <ActionCard
          icon="calendar"
          title="Schedule"
          subtitle="Plan ahead, add to your calendar"
          color={colors.primary}
          onPress={onSchedule}
        />
      </View>

      <View style={styles.joinCard}>
        <Text style={styles.joinTitle}>Join a meeting</Text>
        <TextInput
          style={[styles.input, styles.joinInput]}
          value={roomId}
          onChangeText={onRoomIdChange}
          placeholder="Meeting ID from an invite"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => canJoin && onJoin(roomId.trim(), true)}
        />
        <View style={styles.joinActions}>
          <Button
            label={connecting ? 'Connecting…' : 'Join with video'}
            icon="videocam"
            onPress={() => onJoin(roomId.trim(), true)}
            disabled={!canJoin}
          />
          <Button
            label="Join audio only"
            icon="call"
            variant="secondary"
            onPress={() => onJoin(roomId.trim(), false)}
            disabled={!canJoin}
          />
        </View>
        {connecting && (
          <Text style={styles.connecting}>
            Connecting… allow the camera and microphone if the browser asks.
          </Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <FilesCard ownerId={ownerId} />

      <MeetingList
        title="Up next"
        meetings={upNext}
        emptyText="No upcoming meetings. Schedule one to see it here."
        onStart={onStartMeeting}
        onDelete={onDeleteMeeting}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 20,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  greeting: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  date: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cards: {
    flexDirection: 'row',
    gap: 16,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 6,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  joinCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  joinInput: {
    backgroundColor: colors.background,
  },
  joinTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  joinActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  connecting: {
    color: colors.textMuted,
  },
  error: {
    color: '#f87171',
  },
});
