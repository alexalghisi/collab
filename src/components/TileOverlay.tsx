import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PeerState } from '../signaling/events';
import { colors } from '../theme';
import { qualityLabel, type LinkQuality } from '../webrtc/linkQuality';
import { showsPlaceholder } from './tilePlaceholder';

export { showsPlaceholder };

export interface TileOverlayProps {
  label: string;
  state: PeerState;
  isHost: boolean;
  quality?: LinkQuality;
  /** Offered on tiles that can be enlarged. */
  onExpand?: () => void;
}

/** Status chrome drawn over a video tile: name, host badge, mute, hand, reaction. */
export function TileOverlay({ label, state, isHost, quality, onExpand }: TileOverlayProps) {
  return (
    <>
      <View style={styles.topRow} pointerEvents="none">
        {quality && (
          <View
            style={[styles.pill, styles.qualityPill]}
            accessibilityLabel={`Connection ${qualityLabel(quality)}`}
          >
            <View style={[styles.qualityDot, { backgroundColor: qualityColor(quality) }]} />
            <Text style={styles.pillText}>{qualityLabel(quality)}</Text>
          </View>
        )}
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

      {onExpand && (
        <Pressable
          style={styles.expand}
          onPress={onExpand}
          accessibilityRole="button"
          accessibilityLabel={`Expand ${label}`}
        >
          <Ionicons name="expand" size={18} color={colors.text} />
        </Pressable>
      )}

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

function qualityColor(quality: LinkQuality): string {
  if (quality === 'good') {
    return colors.success;
  }
  if (quality === 'fair') {
    return colors.warning;
  }
  return colors.danger;
}

/** Above the video element and the avatar placeholder, which sit at layers 1 and 2. */
const OVERLAY_LAYER = 3;

const styles = StyleSheet.create({
  topRow: {
    position: 'absolute',
    zIndex: OVERLAY_LAYER,
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
  qualityPill: {
    backgroundColor: 'rgba(17, 24, 39, 0.72)',
  },
  qualityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  expand: {
    position: 'absolute',
    zIndex: OVERLAY_LAYER,
    top: 6,
    right: 6,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.72)',
  },
  reaction: {
    ...StyleSheet.absoluteFillObject,
    zIndex: OVERLAY_LAYER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionText: {
    fontSize: 56,
  },
  footer: {
    position: 'absolute',
    zIndex: OVERLAY_LAYER,
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
