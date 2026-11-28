import { useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { PANEL_DRAG_THRESHOLD, PanelDockContext, otherSide, sideAfterDrop } from './panelDock';

export interface SidePanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function SidePanel({ title, onClose, children }: SidePanelProps) {
  const dock = useContext(PanelDockContext);
  const { width } = useWindowDimensions();
  const [shift, setShift] = useState(0);
  const dockRef = useRef(dock);
  dockRef.current = dock;
  const widthRef = useRef(width);
  widthRef.current = width;

  const drag = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          dockRef.current !== null && Math.abs(gesture.dx) > PANEL_DRAG_THRESHOLD,
        onPanResponderMove: (_event, gesture) => setShift(gesture.dx),
        onPanResponderRelease: (_event, gesture) => {
          setShift(0);
          dockRef.current?.setSide(sideAfterDrop(gesture.moveX, widthRef.current));
        },
        onPanResponderTerminate: () => setShift(0),
      }),
    [],
  );

  const target = dock ? otherSide(dock.side) : 'left';

  return (
    <View
      style={[
        styles.panel,
        dock?.side === 'left' ? styles.panelLeft : styles.panelRight,
        shift !== 0 && styles.panelDragging,
        shift !== 0 && { transform: [{ translateX: shift }] },
      ]}
    >
      <View style={styles.header} {...(dock ? drag.panHandlers : {})}>
        {dock && <Ionicons name="reorder-two" size={18} color={colors.textSubtle} />}
        <Text style={styles.title}>{title}</Text>
        {dock && (
          <Pressable
            onPress={() => dock.setSide(target)}
            accessibilityRole="button"
            accessibilityLabel={`Move panel to the ${target}`}
          >
            <Ionicons
              name={target === 'left' ? 'arrow-back' : 'arrow-forward'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        )}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close panel">
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    height: '100%',
    minHeight: 0,
    backgroundColor: colors.surface,
  },
  panelRight: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  panelLeft: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  panelDragging: {
    opacity: 0.9,
    boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    userSelect: 'none',
  },
});
