import { StyleSheet, Text, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import type { VideoTileProps } from './VideoTile';

export function VideoTile({ label, stream, mirror = false }: VideoTileProps) {
  const streamUrl = stream ? (stream as unknown as { toURL: () => string }).toURL() : undefined;

  return (
    <View style={styles.tile}>
      {streamUrl ? (
        <RTCView streamURL={streamUrl} style={styles.video} objectFit="cover" mirror={mirror} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.avatar}>{label.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.footer}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
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
  video: {
    flex: 1,
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
  },
  label: {
    color: '#f9fafb',
    fontSize: 14,
    fontWeight: '600',
  },
});
