import { useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

export interface DraggablePipProps {
  children: ReactNode;
}

/** A small video thumbnail that follows a finger or a pointer. */
export function DraggablePip({ children }: DraggablePipProps) {
  const position = useRef({ x: 12, y: 12 });
  const origin = useRef({ x: 12, y: 12 });
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
            x: Math.max(0, origin.current.x + gesture.dx),
            y: Math.max(0, origin.current.y + gesture.dy),
          };
          position.current = next;
          setOffset(next);
        },
      }),
    [],
  );

  return (
    <View
      style={[styles.pip, { transform: [{ translateX: offset.x }, { translateY: offset.y }] }]}
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
    top: 0,
    left: 0,
    width: 148,
    zIndex: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
