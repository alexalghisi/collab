import { StyleSheet, Text, View } from 'react-native';
import type { Meeting } from '../../meeting/types';
import { colors } from '../../theme';
import { MeetingRow, type MeetingInviteRequest } from './MeetingRow';

export interface MeetingListProps {
  title: string;
  meetings: Meeting[];
  emptyText: string;
  onStart: (meeting: Meeting) => void;
  onEdit?: (meeting: Meeting) => void;
  onDelete: (meeting: Meeting) => void;
  onInvite: (meeting: Meeting, invite: MeetingInviteRequest) => Promise<string>;
}

export function MeetingList({
  title,
  meetings,
  emptyText,
  onStart,
  onEdit,
  onDelete,
  onInvite,
}: MeetingListProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {meetings.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        meetings.map((meeting) => (
          <MeetingRow
            key={meeting.id}
            meeting={meeting}
            onStart={onStart}
            onEdit={onEdit}
            onDelete={onDelete}
            onInvite={onInvite}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  heading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  empty: {
    color: colors.textSubtle,
    fontSize: 14,
    paddingVertical: 8,
  },
});
