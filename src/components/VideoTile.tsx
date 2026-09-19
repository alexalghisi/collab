import { useEffect, useRef, type CSSProperties } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PeerState } from '../signaling/events';
import { colors } from '../theme';
import { attachMediaStream } from '../webrtc/attachMedia';
import { TileOverlay, showsPlaceholder } from './TileOverlay';
import { videoPresentation, type VideoFit } from './videoPresentation';

export interface VideoTileProps {
  label: string;
  state: PeerState;
  stream?: MediaStream;
  isHost?: boolean;
  /** Local preview: mirrored and muted so the user does not hear themselves. */
  mirror?: boolean;
}

const videoStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  backgroundColor: colors.surface,
};

const fittedStyles: Record<VideoFit, CSSProperties> = {
  cover: { ...videoStyle, objectFit: 'cover' },
  contain: { ...videoStyle, objectFit: 'contain' },
};

const mirroredStyle: CSSProperties = { ...fittedStyles.cover, transform: 'scaleX(-1)' };

export function VideoTile({
  label,
  state,
  stream,
  isHost = false,
  mirror = false,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const presentation = videoPresentation(state, mirror);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    return attachMediaStream(video, stream ?? null);
  }, [stream]);

  return (
    <View style={styles.tile}>
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={presentation.mirror ? mirroredStyle : fittedStyles[presentation.fit]}
        />
      )}
      {showsPlaceholder(state, stream) && (
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
    aspectRatio: 4 / 3,
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
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
