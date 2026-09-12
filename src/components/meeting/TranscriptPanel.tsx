import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatTime } from '../../meeting/calendar';
import { colors } from '../../theme';
import type { TranscriptSegment } from '../../transcript/segments';
import { SidePanel } from './SidePanel';

export interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  captionsOn: boolean;
  error: string | null;
  onClose: () => void;
}

export function TranscriptPanel({ segments, captionsOn, error, onClose }: TranscriptPanelProps) {
  return (
    <SidePanel title="Captions" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.list}>
        {error && <Text style={styles.error}>{error}</Text>}
        {segments.length === 0 && !error && (
          <Text style={styles.empty}>
            {captionsOn
              ? 'Listening. Spoken turns will appear here for everyone in the room.'
              : 'Captions are off. Turn them on from the toolbar to contribute.'}
          </Text>
        )}
        {segments.map((segment) => (
          <View key={segment.id} style={styles.turn}>
            <View style={styles.meta}>
              <Text style={styles.author}>{segment.displayName}</Text>
              <Text style={styles.time}>{formatTime(segment.startedAt)}</Text>
            </View>
            <Text style={styles.text}>{segment.text}</Text>
          </View>
        ))}
      </ScrollView>
    </SidePanel>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
    gap: 14,
  },
  empty: {
    color: colors.textSubtle,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: '#f87171',
    fontSize: 13,
    lineHeight: 18,
  },
  turn: {
    gap: 4,
  },
  meta: {
    flexDirection: 'row',
    gap: 8,
  },
  author: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  time: {
    color: colors.textMuted,
    fontSize: 12,
  },
  text: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
});
