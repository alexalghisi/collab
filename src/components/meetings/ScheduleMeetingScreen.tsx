import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { parseDateTime, toDateInput, toTimeInput } from '../../meeting/calendar';
import { generateRoomId } from '../../meeting/roomId';
import type { MeetingDraft } from '../../meeting/types';
import { colors } from '../../theme';
import { Button } from '../ui/Button';

const DURATIONS = [15, 30, 45, 60, 90, 120];

export interface ScheduleMeetingScreenProps {
  /** Pre-selected start (e.g. the day picked in the calendar). */
  initialStart: Date;
  onSave: (draft: MeetingDraft) => void;
  onCancel: () => void;
}

export function ScheduleMeetingScreen({
  initialStart,
  onSave,
  onCancel,
}: ScheduleMeetingScreenProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => toDateInput(initialStart));
  const [time, setTime] = useState(() => toTimeInput(initialStart));
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [description, setDescription] = useState('');
  const [roomId, setRoomId] = useState(generateRoomId);

  const startsAt = parseDateTime(date, time);
  const ready = title.trim().length > 0 && startsAt !== null;

  const save = () => {
    if (startsAt === null) {
      return;
    }
    onSave({
      title: title.trim(),
      roomId,
      startsAt,
      durationMinutes,
      description: description.trim(),
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Schedule a meeting</Text>

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
        <Button label="Save meeting" icon="checkmark" onPress={save} disabled={!ready} />
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
