import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { buildIcs, googleCalendarUrl } from '../../meeting/calendarExport';
import { formatDay, formatTime } from '../../meeting/calendar';
import { downloadTextFile } from '../../meeting/download';
import { buildInviteLink, shareInvite } from '../../meeting/invite';
import { meetingEndsAt, type Meeting } from '../../meeting/types';
import { colors } from '../../theme';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

export interface MeetingInviteRequest {
  readonly emails: string;
  readonly reminderMinutes: 15 | 30;
}

export interface MeetingRowProps {
  meeting: Meeting;
  onStart: (meeting: Meeting) => void;
  onDelete: (meeting: Meeting) => void;
  onInvite: (meeting: Meeting, invite: MeetingInviteRequest) => Promise<string>;
}

function describeWhen(meeting: Meeting): string {
  const start = `${formatDay(meeting.startsAt)} · ${formatTime(meeting.startsAt)}`;
  return meeting.durationMinutes > 0 ? `${start} – ${formatTime(meetingEndsAt(meeting))}` : start;
}

export function MeetingRow({ meeting, onStart, onDelete, onInvite }: MeetingRowProps) {
  const upcoming = meetingEndsAt(meeting) >= Date.now();
  const inviteLink = buildInviteLink(meeting.roomId);
  const [inviting, setInviting] = useState(false);
  const [emails, setEmails] = useState(() => (meeting.guests ?? []).join(', '));
  const [reminderMinutes, setReminderMinutes] = useState<15 | 30>(meeting.reminderMinutes ?? 15);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendInvite = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      setStatus(await onInvite(meeting, { emails, reminderMinutes }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The invite could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.details}>
          <Text style={styles.title} numberOfLines={1}>
            {meeting.title}
          </Text>
          <Text style={styles.when}>{describeWhen(meeting)}</Text>
          <Text style={styles.roomId}>ID {meeting.roomId}</Text>
        </View>
        <View style={styles.actions}>
          <Button
            label={upcoming ? 'Start' : 'Rejoin'}
            icon="videocam"
            compact
            variant={upcoming ? 'primary' : 'secondary'}
            onPress={() => onStart(meeting)}
          />
          {upcoming ? (
            <Button
              label="Invite"
              icon="mail-outline"
              compact
              variant="secondary"
              onPress={() => setInviting((open) => !open)}
            />
          ) : null}
          <IconButton
            icon="link"
            label="Copy invite link"
            onPress={() => void shareInvite(meeting.roomId)}
          />
          {upcoming && (
            <>
              <IconButton
                icon="logo-google"
                label="Add to Google Calendar"
                onPress={() => void Linking.openURL(googleCalendarUrl(meeting, inviteLink))}
              />
              <IconButton
                icon="download-outline"
                label="Download .ics"
                onPress={() =>
                  downloadTextFile(
                    `${meeting.roomId}.ics`,
                    buildIcs(meeting, inviteLink),
                    'text/calendar',
                  )
                }
              />
            </>
          )}
          <IconButton
            icon="trash-outline"
            label="Delete meeting"
            color={colors.danger}
            onPress={() => onDelete(meeting)}
          />
        </View>
      </View>
      {inviting ? (
        <View style={styles.invite}>
          <TextInput
            style={styles.inviteInput}
            value={emails}
            onChangeText={setEmails}
            onSubmitEditing={() => void sendInvite()}
            placeholder="name@email.com, other@email.com"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <View style={styles.reminders}>
            {([15, 30] as const).map((minutes) => (
              <Button
                key={minutes}
                label={`${minutes} min before`}
                compact
                variant={reminderMinutes === minutes ? 'primary' : 'secondary'}
                onPress={() => setReminderMinutes(minutes)}
              />
            ))}
            <Button
              label={busy ? 'Sending…' : 'Send invite'}
              icon="send"
              compact
              onPress={() => void sendInvite()}
              disabled={busy}
            />
          </View>
          {status ? <Text style={styles.inviteStatus}>{status}</Text> : null}
          {error ? <Text style={styles.inviteError}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  invite: {
    width: '100%',
    gap: 8,
  },
  inviteInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reminders: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  inviteStatus: {
    color: colors.success,
    fontSize: 13,
  },
  inviteError: {
    color: colors.danger,
    fontSize: 13,
  },
  details: {
    flex: 1,
    minWidth: 180,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  when: {
    color: colors.textMuted,
    fontSize: 14,
  },
  roomId: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
