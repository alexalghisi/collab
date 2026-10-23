import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PeerState } from '../signaling/events';
import { colors } from '../theme';
import { attachMediaStream } from '../webrtc/attachMedia';
import { cameraOn, microphoneOn } from '../webrtc/captureState';
import { MicMeter } from './MicMeter';
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
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  height: '100%',
  zIndex: 1,
  backgroundColor: 'transparent',
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const setVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoElement((current) => (current === node ? current : node));
  }, []);
  const presentation = videoPresentation(state, mirror);
  const videoTrack = stream?.getVideoTracks()[0];
  const trackKey = videoTrack ? `${videoTrack.id}:${videoTrack.readyState}` : '';

  useEffect(() => {
    const video = videoElement ?? videoRef.current;
    if (!video) {
      return;
    }
    const preview = stream?.getVideoTracks()[0];
    video.autoplay = true;
    video.playsInline = true;
    video.muted = mirror;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    if (mirror) {
      console.info('[collab] attach local preview', {
        video: preview?.id ?? 'none',
        readyState: preview?.readyState ?? 'none',
        live: cameraOn(stream),
        mic: microphoneOn(stream),
      });
    }
    return attachMediaStream(video, stream ?? null);
  }, [stream, videoRef, videoElement, trackKey, mirror]);

  return (
    <View style={styles.tile}>
      <video
        ref={setVideo}
        autoPlay
        playsInline
        muted={mirror}
        style={presentation.mirror ? mirroredStyle : fittedStyles[presentation.fit]}
      />
      {showsPlaceholder(state, stream) && (
        <View style={styles.placeholder}>
          <Text style={styles.avatar}>{label.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      {mirror && <MicMeter track={stream?.getAudioTracks()[0]} />}
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
    zIndex: 2,
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
