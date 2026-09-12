import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PeerState } from '../signaling/events';
import { colors } from '../theme';

export interface TileOverlayProps {
  label: string;
  state: PeerState;
  isHost: boolean;
}

/** A tile falls back to the avatar when the camera is off, unless it shows a shared screen. */
export function showsPlaceholder(state: PeerState, stream: MediaStream | undefined): boolean {
  const hasVideo = (stream?.getVideoTracks().length ?? 0) > 0;
  return !hasVideo || (state.videoOff && !state.screenSharing);
}

/** Status chrome drawn over a video tile: name, host badge, mute, hand, reaction. */
export function TileOverlay({ label, state, isHost }: TileOverlayProps) {
  return (
    <>
      <View style={styles.topRow} pointerEvents="none">
        {state.handRaised && (
          <View style={[styles.pill, styles.pillWarning]}>
            <Ionicons name="hand-left" size={14} color={colors.background} />
          </View>
        )}
        {state.screenSharing && (
          <View style={[styles.pill, styles.pillInfo]}>
            <Ionicons name="desktop-outline" size={14} color={colors.text} />
            <Text style={styles.pillText}>Sharing</Text>
          </View>
        )}
      </View>

      {state.reaction && (
        <View style={styles.reaction} pointerEvents="none">
          <Text style={styles.reactionText}>{state.reaction}</Text>
        </View>
      )}

      <View style={styles.footer} pointerEvents="none">
        {state.audioMuted && <Ionicons name="mic-off" size={16} color={colors.danger} />}
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {isHost && (
          <View style={[styles.pill, styles.pillHost]}>
            <Text style={styles.pillText}>Host</Text>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  topRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillWarning: {
    backgroundColor: colors.warning,
  },
  pillInfo: {
    backgroundColor: 'rgba(37, 99, 235, 0.85)',
  },
  pillHost: {
    backgroundColor: colors.surfaceRaised,
  },
  pillText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  reaction: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionText: {
    fontSize: 56,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
  },
  label: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
