import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PeerState } from '../../signaling/events';
import { colors } from '../../theme';
import { SidePanel } from './SidePanel';

export interface ParticipantRow {
  readonly peerId: string;
  readonly displayName: string;
  readonly state: PeerState;
  readonly isSelf: boolean;
  readonly isHost: boolean;
}

export interface ParticipantsPanelProps {
  rows: ParticipantRow[];
  onClose: () => void;
}

export function ParticipantsPanel({ rows, onClose }: ParticipantsPanelProps) {
  return (
    <SidePanel title={`Participants (${rows.length})`} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.list}>
        {rows.map((row) => (
          <View key={row.peerId} style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{row.displayName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.nameBlock}>
              <Text style={styles.name} numberOfLines={1}>
                {row.displayName}
                {row.isSelf ? ' (You)' : ''}
              </Text>
              {row.isHost && <Text style={styles.role}>Host</Text>}
            </View>
            <View style={styles.icons}>
              {row.state.handRaised && (
                <Ionicons name="hand-left" size={18} color={colors.warning} />
              )}
              {row.state.screenSharing && (
                <Ionicons name="desktop-outline" size={18} color={colors.primary} />
              )}
              <Ionicons
                name={row.state.audioMuted ? 'mic-off' : 'mic'}
                size={18}
                color={row.state.audioMuted ? colors.danger : colors.textMuted}
              />
              <Ionicons
                name={row.state.videoOff ? 'videocam-off' : 'videocam'}
                size={18}
                color={row.state.videoOff ? colors.danger : colors.textMuted}
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </SidePanel>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  avatarText: {
    color: colors.text,
    fontWeight: '700',
  },
  nameBlock: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  role: {
    color: colors.textMuted,
    fontSize: 12,
  },
  icons: {
    flexDirection: 'row',
    gap: 10,
  },
});
