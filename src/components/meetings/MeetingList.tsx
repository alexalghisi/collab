import { StyleSheet, Text, View } from 'react-native';
import type { Meeting } from '../../meeting/types';
import { colors } from '../../theme';
import { MeetingRow } from './MeetingRow';

export interface MeetingListProps {
  title: string;
  meetings: Meeting[];
  emptyText: string;
  onStart: (meeting: Meeting) => void;
  onDelete: (meeting: Meeting) => void;
}

export function MeetingList({ title, meetings, emptyText, onStart, onDelete }: MeetingListProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {meetings.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        meetings.map((meeting) => (
          <MeetingRow key={meeting.id} meeting={meeting} onStart={onStart} onDelete={onDelete} />
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
