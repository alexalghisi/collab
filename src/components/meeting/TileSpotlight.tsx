import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

export interface TileSpotlightProps {
  title: string;
  micOn: boolean;
  onClose: () => void;
  onToggleMic: () => void;
  children: ReactNode;
}

function leaveBrowserFullscreen(): void {
  if (typeof document !== 'undefined' && document.fullscreenElement) {
    void document.exitFullscreen();
  }
}

function canGoFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

/** One participant's video over the whole call, including the panels beside it. */
export function TileSpotlight({
  title,
  micOn,
  onClose,
  onToggleMic,
  children,
}: TileSpotlightProps) {
  const root = useRef<View>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => leaveBrowserFullscreen, []);

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      leaveBrowserFullscreen();
      return;
    }
    void (root.current as unknown as HTMLElement).requestFullscreen();
  };

  return (
    <View ref={root} style={styles.root}>
      <View style={styles.bar}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <SpotlightButton
          icon={micOn ? 'mic' : 'mic-off'}
          label={micOn ? 'Mute microphone' : 'Unmute microphone'}
          onPress={onToggleMic}
        />
        {canGoFullscreen() && (
          <SpotlightButton icon="scan" label="Full screen" onPress={toggleFullscreen} />
        )}
        <SpotlightButton icon="contract" label="Exit expanded view" onPress={onClose} />
      </View>
      <View style={styles.stage}>{children}</View>
    </View>
  );
}

function SpotlightButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: colors.background,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  stage: {
    flex: 1,
    minHeight: 0,
  },
});
