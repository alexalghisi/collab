import { StyleSheet, Text, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useSpeaking } from '../hooks/useSpeaking';
import { colors } from '../theme';
import { TileOverlay, showsPlaceholder } from './TileOverlay';
import type { VideoTileProps } from './VideoTile';
import { videoPresentation } from './videoPresentation';

export function VideoTile({
  label,
  state,
  stream,
  isHost = false,
  mirror = false,
  quality,
}: VideoTileProps) {
  const streamUrl = stream ? (stream as unknown as { toURL: () => string }).toURL() : undefined;
  const presentation = videoPresentation(state, mirror);
  const speaking = useSpeaking(stream?.getAudioTracks()[0], !state.audioMuted);

  return (
    <View style={[styles.tile, speaking && styles.speaking]}>
      {streamUrl ? (
        <RTCView
          streamURL={streamUrl}
          style={styles.video}
          objectFit={presentation.fit}
          mirror={presentation.mirror}
        />
      ) : null}
      {(!streamUrl || showsPlaceholder(state, stream)) && (
        <View style={[styles.placeholder, streamUrl ? styles.cover : null]}>
          <Text style={styles.avatar}>{label.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <TileOverlay label={label} state={state} isHost={isHost} quality={quality} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    aspectRatio: 3 / 4,
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  speaking: {
    borderColor: colors.success,
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
