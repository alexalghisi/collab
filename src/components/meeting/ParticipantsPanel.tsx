import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CollabSession } from '../../hooks/useCollabSession';
import type { PeerState } from '../../signaling/events';
import { colors } from '../../theme';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { SidePanel } from './SidePanel';

export interface ParticipantRow {
  readonly peerId: string;
  readonly displayName: string;
  readonly state: PeerState;
  readonly isSelf: boolean;
  readonly isHost: boolean;
}

export type HostControls = Pick<
  CollabSession,
  | 'waiting'
  | 'settings'
  | 'admit'
  | 'deny'
  | 'muteParticipant'
  | 'removeParticipant'
  | 'updateSettings'
  | 'openBreakoutRooms'
  | 'closeBreakoutRooms'
>;

export interface ParticipantsPanelProps {
  rows: ParticipantRow[];
  /** Present only for the host. */
  host: HostControls | null;
  onClose: () => void;
}

const MIN_BREAKOUT_ROOMS = 2;
const MAX_BREAKOUT_ROOMS = 8;

function Avatar({ name }: { name: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function HostTools({ host, participantCount }: { host: HostControls; participantCount: number }) {
  const [roomCount, setRoomCount] = useState(MIN_BREAKOUT_ROOMS);
  const { breakoutOpen, waitingRoom } = host.settings;

  return (
    <View style={styles.tools}>
      <Text style={styles.sectionTitle}>Host tools</Text>
      <View style={styles.toolRow}>
        <Text style={styles.toolLabel}>Waiting room</Text>
        <Switch
          value={waitingRoom}
          onValueChange={(value) => host.updateSettings({ waitingRoom: value })}
          trackColor={{ true: colors.primary, false: colors.surfaceRaised }}
          accessibilityLabel="Waiting room"
        />
      </View>
      <View style={styles.toolRow}>
        <Text style={styles.toolLabel}>Everyone</Text>
        <Button
          label="Mute all"
          icon="mic-off"
          variant="secondary"
          compact
          disabled={participantCount === 0}
          onPress={() => host.muteParticipant(null)}
        />
      </View>
      <View style={styles.toolRow}>
        <Text style={styles.toolLabel}>Breakout rooms</Text>
        {breakoutOpen ? (
          <Button
            label="Close rooms"
            icon="arrow-undo"
            variant="secondary"
            compact
            onPress={host.closeBreakoutRooms}
          />
        ) : (
          <View style={styles.stepper}>
            <IconButton
              icon="remove"
              label="Fewer rooms"
              onPress={() => setRoomCount((count) => Math.max(MIN_BREAKOUT_ROOMS, count - 1))}
            />
            <Text style={styles.stepperValue}>{roomCount}</Text>
            <IconButton
              icon="add"
              label="More rooms"
              onPress={() => setRoomCount((count) => Math.min(MAX_BREAKOUT_ROOMS, count + 1))}
            />
            <Button
              label="Open"
              compact
              disabled={participantCount === 0}
              onPress={() => host.openBreakoutRooms(roomCount)}
            />
          </View>
        )}
      </View>
    </View>
  );
}

export function ParticipantsPanel({ rows, host, onClose }: ParticipantsPanelProps) {
  const waiting = host?.waiting ?? [];

  return (
    <SidePanel title={`Participants (${rows.length})`} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.list}>
        {waiting.length > 0 && host && (
          <>
            <Text style={styles.sectionTitle}>Waiting ({waiting.length})</Text>
            {waiting.map((peer) => (
              <View key={peer.peerId} style={styles.row}>
                <Avatar name={peer.displayName} />
                <Text style={[styles.name, styles.nameBlock]} numberOfLines={1}>
                  {peer.displayName}
                </Text>
                <View style={styles.icons}>
                  <IconButton
                    icon="checkmark"
                    label={`Admit ${peer.displayName}`}
                    color={colors.success}
                    onPress={() => host.admit(peer.peerId)}
                  />
                  <IconButton
                    icon="close"
                    label={`Deny ${peer.displayName}`}
                    color={colors.danger}
                    onPress={() => host.deny(peer.peerId)}
                  />
                </View>
              </View>
            ))}
            <Text style={styles.sectionTitle}>In the meeting</Text>
          </>
        )}
        {rows.map((row) => (
          <View key={row.peerId} style={styles.row}>
            <Avatar name={row.displayName} />
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
            {host && !row.isSelf && (
              <View style={styles.icons}>
                {!row.state.audioMuted && (
                  <IconButton
                    icon="mic-off"
                    label={`Mute ${row.displayName}`}
                    onPress={() => host.muteParticipant(row.peerId)}
                  />
                )}
                <IconButton
                  icon="person-remove-outline"
                  label={`Remove ${row.displayName}`}
                  color={colors.danger}
                  onPress={() => host.removeParticipant(row.peerId)}
                />
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      {host && <HostTools host={host} participantCount={rows.length - 1} />}
    </SidePanel>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: 8,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
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
    alignItems: 'center',
    gap: 10,
  },
  tools: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: 12,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toolLabel: {
    color: colors.text,
    fontSize: 14,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
  },
});
