import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { meetingEndsAt, type Meeting } from '../../meeting/types';
import { colors } from '../../theme';
import { Button } from '../ui/Button';
import { MeetingList } from './MeetingList';
import type { MeetingInviteRequest } from './MeetingRow';

export interface MeetingsScreenProps {
  meetings: Meeting[];
  onStart: (meeting: Meeting) => void;
  onEdit: (meeting: Meeting) => void;
  onDelete: (meeting: Meeting) => void;
  onInvite: (meeting: Meeting, invite: MeetingInviteRequest) => Promise<string>;
  onSchedule: () => void;
}

export function splitByTime(meetings: Meeting[], now = Date.now()) {
  const upcoming = meetings.filter((meeting) => meetingEndsAt(meeting) >= now);
  const past = meetings.filter((meeting) => meetingEndsAt(meeting) < now).reverse();
  return { upcoming, past };
}

export function MeetingsScreen({
  meetings,
  onStart,
  onEdit,
  onDelete,
  onInvite,
  onSchedule,
}: MeetingsScreenProps) {
  const { upcoming, past } = splitByTime(meetings);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Meetings</Text>
        <Button label="Schedule" icon="add" compact onPress={onSchedule} />
      </View>
      <MeetingList
        title="Upcoming"
        meetings={upcoming}
        emptyText="Nothing scheduled. Plan a meeting and share the invite link."
        onStart={onStart}
        onEdit={onEdit}
        onDelete={onDelete}
        onInvite={onInvite}
      />
      <MeetingList
        title="Past"
        meetings={past}
        emptyText="Meetings you host or join will show up here."
        onStart={onStart}
        onEdit={onEdit}
        onDelete={onDelete}
        onInvite={onInvite}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 28,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
});
