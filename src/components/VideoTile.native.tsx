import { StyleSheet, Text, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { colors } from '../theme';
import { TileOverlay, showsPlaceholder } from './TileOverlay';
import type { VideoTileProps } from './VideoTile';

export function VideoTile({
  label,
  state,
  stream,
  isHost = false,
  mirror = false,
}: VideoTileProps) {
  const streamUrl = stream ? (stream as unknown as { toURL: () => string }).toURL() : undefined;

  return (
    <View style={styles.tile}>
      {streamUrl && !showsPlaceholder(state, stream) ? (
        <RTCView
          streamURL={streamUrl}
          style={styles.video}
          objectFit="cover"
          mirror={mirror && !state.screenSharing}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.avatar}>{label.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <TileOverlay label={label} state={state} isHost={isHost} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    aspectRatio: 3 / 4,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surfaceRaised,
  },
  avatar: {
    color: '#e5e7eb',
    fontSize: 40,
    fontWeight: '700',
  },
});
