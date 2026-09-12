import { useEffect, useRef, type CSSProperties } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface VideoTileProps {
  label: string;
  stream?: MediaStream;
  /** Local preview: mirrored and muted so the user does not hear themselves. */
  mirror?: boolean;
}

const videoStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  backgroundColor: '#111827',
};

export function VideoTile({ label, stream, mirror = false }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = (stream?.getVideoTracks().length ?? 0) > 0;

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream ?? null;
    }
  }, [stream]);

  return (
    <View style={styles.tile}>
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={mirror}
          style={mirror ? { ...videoStyle, transform: 'scaleX(-1)' } : videoStyle}
        />
      )}
      {!hasVideo && (
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
    aspectRatio: 4 / 3,
    backgroundColor: '#111827',
    borderRadius: 16,
    overflow: 'hidden',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
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
