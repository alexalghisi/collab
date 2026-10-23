import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { openMicLevel } from '../webrtc/micMeter';

export interface MicMeterProps {
  track: MediaStreamTrack | undefined;
}

/** Live level of the local microphone, drawn on the self tile. */
export function MicMeter({ track }: MicMeterProps) {
  const [level, setLevel] = useState(0);
  const live = track !== undefined && track.readyState === 'live' && track.enabled;

  useEffect(() => {
    if (!live || !track) {
      return;
    }
    const meter = openMicLevel(track);
    if (!meter) {
      return;
    }
    let frame = 0;
    let shown = -1;
    const tick = (): void => {
      const next = meter.sample();
      const bucket = Math.round(next * 20);
      if (bucket !== shown) {
        shown = bucket;
        setLevel(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const resume = (): void => {
      void meter.resume();
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('touchstart', resume);
    window.addEventListener('keydown', resume);
    return () => {
      cancelAnimationFrame(frame);
      meter.stop();
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('touchstart', resume);
      window.removeEventListener('keydown', resume);
    };
  }, [live, track]);

  if (!live) {
    return null;
  }

  return (
    <View style={styles.track} pointerEvents="none">
      <View style={[styles.fill, { width: `${Math.round(level * 100)}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.success,
  },
});
