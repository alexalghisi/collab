import { StyleSheet, Text, View } from 'react-native';

export interface VideoTileProps {
  label: string;
  stream?: MediaStream;
  mirror?: boolean;
}

export function VideoTile({ label, stream }: VideoTileProps) {
  const videoTracks = stream?.getVideoTracks() ?? [];
  const isLive = videoTracks.length > 0 && (videoTracks[0]?.enabled ?? false);

  return (
    <View style={styles.tile}>
      <View style={styles.placeholder}>
        <Text style={styles.avatar}>{label.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.footer}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <View style={[styles.badge, isLive ? styles.badgeLive : styles.badgeIdle]}>
          <Text style={styles.badgeText}>{isLive ? 'LIVE' : 'AUDIO'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    aspectRatio: 3 / 4,
    backgroundColor: '#111827',
    borderRadius: 16,
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
  },
  avatar: {
    color: '#e5e7eb',
    fontSize: 40,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: {
    color: '#f9fafb',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeLive: {
    backgroundColor: '#16a34a',
  },
  badgeIdle: {
    backgroundColor: '#4b5563',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
});
