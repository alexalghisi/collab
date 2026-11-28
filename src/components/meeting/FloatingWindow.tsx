import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import {
  FLOATING_TITLE_HEIGHT,
  clampWindow,
  initialWindow,
  movedWindow,
  resizedWindow,
  windowHeight,
  type WindowBounds,
  type WindowRect,
} from './floatingWindow';

export interface FloatingWindowProps {
  title: string;
  expandLabel?: string;
  bounds: WindowBounds;
  initialWidth?: number;
  children: ReactNode;
  onExpand?: () => void;
  onDock?: () => void;
}

export function FloatingWindow({
  title,
  expandLabel = 'Expand',
  bounds,
  initialWidth,
  children,
  onExpand,
  onDock,
}: FloatingWindowProps) {
  const [rect, setRect] = useState<WindowRect>(() => initialWindow(bounds, initialWidth));
  const [dragging, setDragging] = useState(false);
  const rectRef = useRef(rect);
  const originRef = useRef(rect);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const apply = (next: WindowRect): void => {
    rectRef.current = next;
    setRect(next);
  };

  useEffect(() => {
    apply(clampWindow(rectRef.current, { width: bounds.width, height: bounds.height }));
  }, [bounds.width, bounds.height]);

  const move = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          originRef.current = rectRef.current;
          setDragging(true);
        },
        onPanResponderMove: (_event, gesture) =>
          apply(movedWindow(originRef.current, gesture.dx, gesture.dy, boundsRef.current)),
        onPanResponderRelease: () => setDragging(false),
        onPanResponderTerminate: () => setDragging(false),
      }),
    [],
  );

  const resize = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          originRef.current = rectRef.current;
          setDragging(true);
        },
        onPanResponderMove: (_event, gesture) =>
          apply(
            resizedWindow(originRef.current, Math.max(gesture.dx, gesture.dy), boundsRef.current),
          ),
        onPanResponderRelease: () => setDragging(false),
        onPanResponderTerminate: () => setDragging(false),
      }),
    [],
  );

  return (
    <View
      style={[
        styles.window,
        dragging && styles.windowDragging,
        { left: rect.x, top: rect.y, width: rect.width, height: windowHeight(rect.width) },
      ]}
      accessibilityLabel={`${title}, movable window`}
    >
      <View style={styles.bar}>
        <View style={styles.grip} {...move.panHandlers} accessibilityLabel="Drag to move">
          <Ionicons name="move" size={15} color={colors.textMuted} />
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {onExpand && (
          <Pressable
            style={styles.button}
            onPress={onExpand}
            accessibilityRole="button"
            accessibilityLabel={expandLabel}
          >
            <Ionicons name="expand" size={15} color={colors.text} />
          </Pressable>
        )}
        {onDock && (
          <Pressable
            style={styles.button}
            onPress={onDock}
            accessibilityRole="button"
            accessibilityLabel="Return to the tile strip"
          >
            <Ionicons name="remove" size={17} color={colors.text} />
          </Pressable>
        )}
      </View>
      <View style={styles.body}>
        {children}
        {dragging && <View style={styles.shield} />}
      </View>
      <View style={styles.corner} {...resize.panHandlers} accessibilityLabel="Drag to resize">
        <Ionicons name="resize" size={14} color={colors.text} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    position: 'absolute',
    zIndex: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
  },
  windowDragging: {
    borderColor: colors.primary,
  },
  bar: {
    height: FLOATING_TITLE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 4,
    backgroundColor: colors.surface,
  },
  grip: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    userSelect: 'none',
  },
  button: {
    width: 28,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  shield: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  corner: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    zIndex: 6,
    width: 26,
    height: 26,
    borderTopLeftRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
  },
});
