import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { parseDateTime, toDateInput, toTimeInput } from '../../meeting/calendar';
import { parseContactList } from '../../meeting/contact';
import { generateRoomId } from '../../meeting/roomId';
import type { Meeting, MeetingDraft } from '../../meeting/types';
import { colors } from '../../theme';
import { Button } from '../ui/Button';

const DURATIONS = [15, 30, 45, 60, 90, 120];

export interface ScheduleMeetingScreenProps {
  /** Pre-selected start (e.g. the day picked in the calendar). Used when creating. */
  initialStart: Date;
  /** When set, the form edits this meeting instead of creating a new one. */
  initialMeeting?: Meeting | null;
  onSave: (draft: MeetingDraft) => void;
  onCancel: () => void;
}

export function ScheduleMeetingScreen({
  initialStart,
  initialMeeting,
  onSave,
  onCancel,
}: ScheduleMeetingScreenProps) {
  const editing = Boolean(initialMeeting);
  const start = initialMeeting ? new Date(initialMeeting.startsAt) : initialStart;
  const [title, setTitle] = useState(initialMeeting?.title ?? '');
  const [date, setDate] = useState(() => toDateInput(start));
  const [time, setTime] = useState(() => toTimeInput(start));
  const [durationMinutes, setDurationMinutes] = useState(
    initialMeeting && initialMeeting.durationMinutes > 0 ? initialMeeting.durationMinutes : 30,
  );
  const [description, setDescription] = useState(initialMeeting?.description ?? '');
  const [roomId, setRoomId] = useState(() => initialMeeting?.roomId ?? generateRoomId());
  const [attendees, setAttendees] = useState(() => (initialMeeting?.guests ?? []).join(', '));
  const [reminderMinutes, setReminderMinutes] = useState<15 | 30>(
    initialMeeting?.reminderMinutes ?? 15,
  );

  const startsAt = parseDateTime(date, time);
  const ready = title.trim().length > 0 && startsAt !== null;
  const parsedContacts = parseContactList(attendees);

  const save = () => {
    if (startsAt === null) {
      return;
    }
    const guests = parsedContacts.map((c) => c.value);
    onSave({
      title: title.trim(),
      roomId,
      startsAt,
      durationMinutes,
      description: description.trim(),
      guests: guests.length > 0 ? guests : undefined,
      reminderMinutes,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>{editing ? 'Edit meeting' : 'Schedule a meeting'}</Text>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Weekly sync"
        placeholderTextColor={colors.textSubtle}
        autoFocus
      />

      <View style={styles.inline}>
        <View style={styles.field}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSubtle}
            autoCorrect={false}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Time</Text>
          <TextInput
            style={styles.input}
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            placeholderTextColor={colors.textSubtle}
            autoCorrect={false}
          />
        </View>
      </View>
      {startsAt === null && <Text style={styles.hint}>Use YYYY-MM-DD and 24-hour HH:MM.</Text>}

      <Text style={styles.label}>Duration</Text>
      <View style={styles.chips}>
        {DURATIONS.map((minutes) => {
          const selected = minutes === durationMinutes;
          return (
            <Pressable
              key={minutes}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setDurationMinutes(minutes)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={styles.chipText}>
                {minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Agenda, links, notes for attendees"
        placeholderTextColor={colors.textSubtle}
        multiline
      />

      <View style={styles.sectionHeader}>
        <Text style={styles.label}>Attendees (emails or phone numbers)</Text>
        <View style={styles.autoInviteBadge}>
          <Ionicons name="sparkles" size={12} color={colors.primary} />
          <Text style={styles.autoInviteBadgeText}>Auto-invites enabled</Text>
        </View>
      </View>
      <TextInput
        style={styles.input}
        value={attendees}
        onChangeText={setAttendees}
        placeholder="alex@example.com, +1 555 123 4567, linus@kernel.org"
        placeholderTextColor={colors.textSubtle}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {parsedContacts.length > 0 ? (
        <View style={styles.attendeeChips}>
          {parsedContacts.map((c) => (
            <View key={`${c.kind}:${c.value}`} style={styles.attendeeChip}>
              <Ionicons
                name={c.kind === 'email' ? 'mail-outline' : 'call-outline'}
                size={14}
                color={colors.primary}
              />
              <Text style={styles.attendeeChipText}>{c.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.helperText}>
        Invites with direct join links and reminders will be dispatched automatically upon saving.
      </Text>

      <Text style={styles.label}>Send reminder before start</Text>
      <View style={styles.chips}>
        {([15, 30] as const).map((mins) => {
          const selected = mins === reminderMinutes;
          return (
            <Pressable
              key={mins}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setReminderMinutes(mins)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={styles.chipText}>{mins} min before</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Meeting ID</Text>
      <View style={styles.inline}>
        <Text style={[styles.input, styles.roomId]}>{roomId}</Text>
        <Pressable
          style={styles.regenerate}
          onPress={() => setRoomId(generateRoomId())}
          accessibilityRole="button"
          accessibilityLabel="Generate a new meeting ID"
        >
          <Ionicons name="shuffle" size={18} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
        <Button
          label={editing ? 'Save changes' : 'Save meeting'}
          icon="checkmark"
          onPress={save}
          disabled={!ready}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 10,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 12,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  autoInviteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  autoInviteBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  attendeeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  attendeeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  attendeeChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  helperText: {
    color: colors.textSubtle,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  inline: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    flex: 1,
    gap: 10,
  },
  hint: {
    color: colors.warning,
    fontSize: 13,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontWeight: '600',
  },
  roomId: {
    flex: 1,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  regenerate: {
    width: 52,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
});
