import { Linking, StyleSheet, Text, View } from 'react-native';
import { buildIcs, googleCalendarUrl } from '../../meeting/calendarExport';
import { formatDay, formatTime } from '../../meeting/calendar';
import { downloadTextFile } from '../../meeting/download';
import { buildInviteLink, shareInvite } from '../../meeting/invite';
import { describeInvitees, meetingEndsAt, type Meeting } from '../../meeting/types';
import { colors } from '../../theme';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

export interface MeetingRowProps {
  meeting: Meeting;
  onStart: (meeting: Meeting) => void;
  onDelete: (meeting: Meeting) => void;
}

function describeWhen(meeting: Meeting): string {
  const start = `${formatDay(meeting.startsAt)} · ${formatTime(meeting.startsAt)}`;
  return meeting.durationMinutes > 0 ? `${start} – ${formatTime(meetingEndsAt(meeting))}` : start;
}

export function MeetingRow({ meeting, onStart, onDelete }: MeetingRowProps) {
  const upcoming = meetingEndsAt(meeting) >= Date.now();
  const inviteLink = buildInviteLink(meeting.roomId);

  return (
    <View style={styles.row}>
      <View style={styles.details}>
        <Text style={styles.title} numberOfLines={1}>
          {meeting.title}
        </Text>
        <Text style={styles.when}>{describeWhen(meeting)}</Text>
        <Text style={styles.people} numberOfLines={2}>
          {describeInvitees(meeting.invitees)}
        </Text>
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
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
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
  people: {
    color: colors.textMuted,
    fontSize: 13,
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
