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
      {streamUrl ? (
        <RTCView
          streamURL={streamUrl}
          style={styles.video}
          objectFit={state.screenSharing ? 'contain' : 'cover'}
          mirror={mirror && !state.screenSharing}
        />
      ) : null}
      {(!streamUrl || showsPlaceholder(state, stream)) && (
        <View style={[styles.placeholder, streamUrl ? styles.cover : null]}>
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
  cover: {
    ...StyleSheet.absoluteFillObject,
  },
  avatar: {
    color: '#e5e7eb',
    fontSize: 40,
    fontWeight: '700',
  },
});
