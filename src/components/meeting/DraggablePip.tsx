import { useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

export interface DraggablePipProps {
  children: ReactNode;
  width?: number;
}

const DEFAULT_WIDTH = 120;
/**
 * Where the thumbnail starts: near the bottom-right corner, but above the row of
 * buttons that sits at the bottom of the editor and of the problem view.
 */
const INSET_X = 12;
const INSET_Y = 120;

/**
 * A small video thumbnail that follows a finger or a pointer. It is anchored to
 * the bottom-right corner, so offsets are zero or negative.
 */
export function DraggablePip({ children, width = DEFAULT_WIDTH }: DraggablePipProps) {
  const position = useRef({ x: -INSET_X, y: -INSET_Y });
  const origin = useRef({ x: -INSET_X, y: -INSET_Y });
  const [offset, setOffset] = useState(position.current);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          origin.current = position.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const next = {
            x: Math.min(0, origin.current.x + gesture.dx),
            y: Math.min(0, origin.current.y + gesture.dy),
          };
          position.current = next;
          setOffset(next);
        },
      }),
    [],
  );

  return (
    <View
      style={[
        styles.pip,
        { width, transform: [{ translateX: offset.x }, { translateY: offset.y }] },
      ]}
      {...responder.panHandlers}
      accessibilityLabel="Video preview"
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pip: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    zIndex: 6,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  },
});
