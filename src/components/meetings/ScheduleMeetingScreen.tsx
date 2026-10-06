import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { parseDateTime, toDateInput, toTimeInput } from '../../meeting/calendar';
import { parseContactList } from '../../meeting/contact';
import { generateRoomId } from '../../meeting/roomId';
import {
  meetingInviteContacts,
  type Meeting,
  type MeetingDraft,
  type MeetingInvitee,
} from '../../meeting/types';
import { colors } from '../../theme';
import { Button } from '../ui/Button';

const DURATIONS = [15, 30, 45, 60, 90, 120];

function extraGuestText(meeting: Meeting | null | undefined): string {
  if (!meeting) {
    return '';
  }
  const named = new Set(
    (meeting.invitees ?? []).map((person) => person.email.trim().toLowerCase()),
  );
  return (meeting.guests ?? [])
    .filter((guest) => !named.has(guest.trim().toLowerCase()))
    .join(', ');
}

export interface ScheduleMeetingScreenProps {
  /** Pre-selected start (e.g. the day picked in the calendar). Used when creating. */
  initialStart: Date;
  /** When set, the form edits this meeting instead of creating a new one. */
  initialMeeting?: Meeting | null;
  hostName?: string;
  /** Signed-up people, so the host can pick attendees by name. */
  directory?: readonly MeetingInvitee[];
  /** Hide the current user from the picker; they already own the meeting. */
  selfUid?: string;
  onSave: (draft: MeetingDraft) => void;
  onCancel: () => void;
}

export function ScheduleMeetingScreen({
  initialStart,
  initialMeeting,
  hostName = '',
  directory = [],
  selfUid,
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
  const [roomId, setRoomId] = useState(() => initialMeeting?.roomId ?? generateRoomId(hostName));
  const [invitees, setInvitees] = useState<MeetingInvitee[]>(() => [
    ...(initialMeeting?.invitees ?? []),
  ]);
  const [attendees, setAttendees] = useState(() => extraGuestText(initialMeeting));
  const [reminderMinutes, setReminderMinutes] = useState<15 | 30>(
    initialMeeting?.reminderMinutes ?? 15,
  );

  const startsAt = parseDateTime(date, time);
  const ready = title.trim().length > 0 && startsAt !== null;
  const parsedContacts = parseContactList(attendees);
  const people = directory.filter((person) => person.uid !== selfUid);
  const selectedIds = new Set(invitees.map((person) => person.uid));

  useEffect(() => {
    if (directory.length === 0) {
      return;
    }
    const byEmail = new Map(directory.map((person) => [person.email.toLowerCase(), person]));
    const promoted: MeetingInvitee[] = [];
    for (const guest of initialMeeting?.guests ?? []) {
      const person = byEmail.get(guest.trim().toLowerCase());
      if (!person || person.uid === selfUid) {
        continue;
      }
      promoted.push(person);
    }
    if (promoted.length === 0) {
      return;
    }
    setInvitees((current) => {
      const have = new Set(current.map((person) => person.uid));
      return [...current, ...promoted.filter((person) => !have.has(person.uid))];
    });
    const promotedEmails = new Set(promoted.map((person) => person.email.toLowerCase()));
    setAttendees((current) =>
      parseContactList(current)
        .filter((contact) => !promotedEmails.has(contact.value.toLowerCase()))
        .map((contact) => contact.value)
        .join(', '),
    );
  }, [directory, initialMeeting, selfUid]);

  const toggleInvitee = (person: MeetingInvitee) => {
    setInvitees((current) =>
      current.some((entry) => entry.uid === person.uid)
        ? current.filter((entry) => entry.uid !== person.uid)
        : [...current, person],
    );
  };

  const save = () => {
    if (startsAt === null) {
      return;
    }
    const extra = parsedContacts.map((contact) => contact.value);
    const guests = meetingInviteContacts({ invitees, guests: extra });
    onSave({
      title: title.trim(),
      roomId,
      startsAt,
      durationMinutes,
      description: description.trim(),
      guests: guests.length > 0 ? guests : undefined,
      invitees: invitees.length > 0 ? invitees : undefined,
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
        <Text style={styles.label}>People</Text>
        <View style={styles.autoInviteBadge}>
          <Ionicons name="sparkles" size={12} color={colors.primary} />
          <Text style={styles.autoInviteBadgeText}>Auto-invites enabled</Text>
        </View>
      </View>
      {people.length > 0 ? (
        <View style={styles.peopleList}>
          {people.map((person) => {
            const selected = selectedIds.has(person.uid);
            return (
              <Pressable
                key={person.uid}
                style={[styles.personChip, selected && styles.personChipSelected]}
                onPress={() => toggleInvitee(person)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${person.displayName}, ${person.email}`}
              >
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'person-outline'}
                  size={16}
                  color={selected ? colors.text : colors.primary}
                />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{person.displayName}</Text>
                  <Text style={styles.personEmail}>{person.email}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.helperText}>
          Accounts that sign in here will show up by name. You can still add emails below.
        </Text>
      )}

      <Text style={styles.label}>Other emails or phone numbers</Text>
      <TextInput
        style={styles.input}
        value={attendees}
        onChangeText={setAttendees}
        placeholder="alex@example.com, +1 555 123 4567"
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
          onPress={() => setRoomId(generateRoomId(title.trim() || hostName))}
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
  peopleList: {
    gap: 8,
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  personChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  personCopy: {
    flex: 1,
    gap: 1,
  },
  personName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  personEmail: {
    color: colors.textMuted,
    fontSize: 12,
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
