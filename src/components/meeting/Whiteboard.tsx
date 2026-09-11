import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import type { Stroke } from '../../signaling/events';
import { colors } from '../../theme';

export interface WhiteboardProps {
  strokes: Stroke[];
  selfPeerId: string | null;
  onAddStroke: (stroke: Omit<Stroke, 'id' | 'peerId'>) => void;
  onRemoveStrokes: (strokeIds: string[]) => void;
}

const PALETTE = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#f59e0b'];
const WIDTHS = [3, 8];

interface Size {
  readonly width: number;
  readonly height: number;
}

/** Normalised points → SVG path in the current canvas size. */
function toPath(points: number[], { width, height }: Size): string {
  const segments: string[] = [];
  for (let index = 0; index < points.length; index += 2) {
    const command = index === 0 ? 'M' : 'L';
    segments.push(`${command}${points[index] * width} ${points[index + 1] * height}`);
  }
  // A single tap still draws a dot.
  return points.length === 2 ? `${segments[0]} l0.1 0` : segments.join(' ');
}

export function Whiteboard({ strokes, selfPeerId, onAddStroke, onRemoveStrokes }: WhiteboardProps) {
  const [size, setSize] = useState<Size>({ width: 1, height: 1 });
  const [color, setColor] = useState(PALETTE[0]);
  const [width, setWidth] = useState(WIDTHS[0]);
  const [draft, setDraft] = useState<number[] | null>(null);
  const draftRef = useRef<number[]>([]);
  const canvasRef = useRef<View>(null);

  // onLayout only reports later resizes on web, so take the initial measurement ourselves.
  useEffect(() => {
    canvasRef.current?.measure((_x, _y, width, height) => setSize({ width, height }));
  }, []);

  const pointOf = (event: GestureResponderEvent): number[] => {
    const { locationX, locationY } = event.nativeEvent;
    return [locationX / size.width, locationY / size.height];
  };

  const begin = (event: GestureResponderEvent) => {
    draftRef.current = pointOf(event);
    setDraft(draftRef.current);
  };

  const extend = (event: GestureResponderEvent) => {
    draftRef.current = [...draftRef.current, ...pointOf(event)];
    setDraft(draftRef.current);
  };

  const finish = () => {
    if (draftRef.current.length >= 2) {
      onAddStroke({ color, width, points: draftRef.current });
    }
    draftRef.current = [];
    setDraft(null);
  };

  const ownStrokes = strokes.filter((stroke) => stroke.peerId === selfPeerId);

  return (
    <View style={styles.container}>
      <View style={styles.tools}>
        {PALETTE.map((entry) => (
          <Pressable
            key={entry}
            style={[
              styles.swatch,
              { backgroundColor: entry },
              entry === color && styles.swatchActive,
            ]}
            onPress={() => setColor(entry)}
            accessibilityRole="button"
            accessibilityLabel={`Colour ${entry}`}
            accessibilityState={{ selected: entry === color }}
          />
        ))}
        <View style={styles.divider} />
        {WIDTHS.map((entry) => (
          <Pressable
            key={entry}
            style={[styles.tool, entry === width && styles.toolActive]}
            onPress={() => setWidth(entry)}
            accessibilityRole="button"
            accessibilityLabel={entry === WIDTHS[0] ? 'Thin pen' : 'Thick pen'}
            accessibilityState={{ selected: entry === width }}
          >
            <View style={[styles.penPreview, { height: entry, borderRadius: entry / 2 }]} />
          </Pressable>
        ))}
        <View style={styles.divider} />
        <Pressable
          style={[styles.tool, ownStrokes.length === 0 && styles.toolDisabled]}
          disabled={ownStrokes.length === 0}
          onPress={() => onRemoveStrokes([ownStrokes[ownStrokes.length - 1].id])}
          accessibilityRole="button"
          accessibilityLabel="Undo my last stroke"
        >
          <Ionicons name="arrow-undo" size={18} color={colors.text} />
        </Pressable>
        <Pressable
          style={[styles.tool, strokes.length === 0 && styles.toolDisabled]}
          disabled={strokes.length === 0}
          onPress={() => onRemoveStrokes(strokes.map((stroke) => stroke.id))}
          accessibilityRole="button"
          accessibilityLabel="Clear whiteboard"
        >
          <Ionicons name="trash-outline" size={18} color={colors.text} />
          <Text style={styles.toolLabel}>Clear</Text>
        </Pressable>
      </View>

      <View
        ref={canvasRef}
        style={styles.canvas}
        onLayout={({ nativeEvent: { layout } }) =>
          setSize({ width: layout.width, height: layout.height })
        }
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={begin}
        onResponderMove={extend}
        onResponderRelease={finish}
        onResponderTerminate={finish}
      >
        <Svg width="100%" height="100%">
          {strokes.map((stroke) => (
            <Path
              key={stroke.id}
              d={toPath(stroke.points, size)}
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {draft && (
            <Path
              d={toPath(draft, size)}
              stroke={color}
              strokeWidth={width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    margin: 6,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
  },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.border,
  },
  swatchActive: {
    borderColor: colors.text,
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 36,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'center',
  },
  toolActive: {
    backgroundColor: colors.primary,
  },
  toolDisabled: {
    opacity: 0.4,
  },
  toolLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  penPreview: {
    width: 18,
    backgroundColor: colors.text,
  },
  canvas: {
    flex: 1,
  },
});
