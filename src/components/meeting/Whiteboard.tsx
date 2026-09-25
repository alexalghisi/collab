import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import type { FileAttachment } from '../../files/attachments';
import { AttachmentError, type UploadableFile, type UploadProgress } from '../../files/upload';
import type { BoardFile, Stroke } from '../../signaling/events';
import { colors } from '../../theme';
import { previewSize } from '../../whiteboard/boardFiles';
import {
  BOARD_LETTERS,
  describeMark,
  type BoardLetter,
  type ShapeMark,
} from '../../whiteboard/marks';
import { BoardFilePreview } from './BoardFilePreview';
import { BoardSurface } from './BoardSurface';

export interface WhiteboardProps {
  strokes: Stroke[];
  boardFiles: BoardFile[];
  selfPeerId: string | null;
  onAddStroke: (stroke: Omit<Stroke, 'id' | 'peerId'>) => void;
  onRemoveStrokes: (strokeIds: string[]) => void;
  onAddBoardFile: (item: Omit<BoardFile, 'id' | 'peerId'>) => void;
  onRemoveBoardFiles: (ids: string[]) => void;
  onUploadFile: (file: UploadableFile, onProgress: UploadProgress) => Promise<FileAttachment>;
}

const PALETTE = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#f59e0b'];
const WIDTHS = [3, 8];
const SHAPES: readonly { readonly kind: ShapeMark; readonly label: string }[] = [
  { kind: 'line', label: 'Line' },
  { kind: 'arrow', label: 'Arrow' },
  { kind: 'rect', label: 'Box' },
  { kind: 'ellipse', label: 'Oval' },
];

type DrawTool = 'pen' | ShapeMark;

interface Size {
  readonly width: number;
  readonly height: number;
}

function openHref(href: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(href);
}

export function Whiteboard({
  strokes,
  boardFiles,
  selfPeerId,
  onAddStroke,
  onRemoveStrokes,
  onAddBoardFile,
  onRemoveBoardFiles,
  onUploadFile,
}: WhiteboardProps) {
  const [size, setSize] = useState<Size>({ width: 1, height: 1 });
  const [color, setColor] = useState(PALETTE[0]);
  const [width, setWidth] = useState(WIDTHS[0]);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [letter, setLetter] = useState<BoardLetter | null>(null);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef<number[]>([]);
  const canvasRef = useRef<View>(null);

  useEffect(() => {
    canvasRef.current?.measure((_x, _y, nextWidth, nextHeight) =>
      setSize({ width: nextWidth, height: nextHeight }),
    );
  }, []);

  const placeFiles = useCallback(
    async (files: UploadableFile[], point: { x: number; y: number }) => {
      if (files.length === 0) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        for (const [index, file] of files.entries()) {
          const attachment = await onUploadFile(file, () => {});
          const box = previewSize(attachment.mimeType);
          const offset = index * 0.04;
          onAddBoardFile({
            file: attachment,
            x: point.x - box.w / 2 + offset,
            y: point.y - box.h / 2 + offset,
            w: box.w,
            h: box.h,
          });
        }
      } catch (cause) {
        setError(
          cause instanceof AttachmentError
            ? cause.message
            : 'The file could not be added to the board.',
        );
      } finally {
        setBusy(false);
      }
    },
    [onAddBoardFile, onUploadFile],
  );

  const pointOf = (event: GestureResponderEvent): number[] => {
    const { locationX, locationY } = event.nativeEvent;
    return [locationX / size.width, locationY / size.height];
  };

  const selectLetter = (next: BoardLetter) => {
    setLetter((current) => (current === next ? null : next));
    setTool('pen');
  };

  const selectTool = (next: DrawTool) => {
    setTool(next);
    setLetter(null);
  };

  const begin = (event: GestureResponderEvent) => {
    const point = pointOf(event);
    if (letter) {
      onAddStroke({ color, width, points: point, kind: 'letter', text: letter });
      draftRef.current = [];
      setDraft(null);
      return;
    }
    draftRef.current = tool === 'pen' ? point : [...point, ...point];
    setDraft(draftRef.current);
  };

  const extend = (event: GestureResponderEvent) => {
    if (letter || draftRef.current.length === 0) {
      return;
    }
    const point = pointOf(event);
    draftRef.current =
      tool === 'pen'
        ? [...draftRef.current, ...point]
        : [...draftRef.current.slice(0, 2), ...point];
    setDraft(draftRef.current);
  };

  const finish = () => {
    if (!letter && draftRef.current.length >= 2) {
      onAddStroke(
        tool === 'pen'
          ? { color, width, points: draftRef.current }
          : { color, width, points: draftRef.current.slice(0, 4), kind: tool },
      );
    }
    draftRef.current = [];
    setDraft(null);
  };

  const draftStroke: Stroke | null = draft
    ? {
        id: 'draft',
        peerId: selfPeerId ?? 'self',
        color,
        width,
        points: draft,
        ...(tool === 'pen' ? {} : { kind: tool }),
      }
    : null;

  const ownStrokes = strokes.filter((stroke) => stroke.peerId === selfPeerId);
  const empty = strokes.length === 0 && boardFiles.length === 0;

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
        <Pressable
          style={[styles.tool, tool === 'pen' && !letter && styles.toolActive]}
          onPress={() => selectTool('pen')}
          accessibilityRole="button"
          accessibilityLabel="Pen"
          accessibilityState={{ selected: tool === 'pen' && !letter }}
        >
          <Text style={styles.toolLabel}>Pen</Text>
        </Pressable>
        {SHAPES.map((entry) => (
          <Pressable
            key={entry.kind}
            style={[styles.tool, tool === entry.kind && !letter && styles.toolActive]}
            onPress={() => selectTool(entry.kind)}
            accessibilityRole="button"
            accessibilityLabel={entry.label}
            accessibilityState={{ selected: tool === entry.kind && !letter }}
          >
            <Text style={styles.toolLabel}>{entry.label}</Text>
          </Pressable>
        ))}
        <View style={styles.divider} />
        {BOARD_LETTERS.map((entry) => (
          <Pressable
            key={entry}
            style={[styles.tool, letter === entry && styles.toolActive]}
            onPress={() => selectLetter(entry)}
            accessibilityRole="button"
            accessibilityLabel={`Letter ${entry}`}
            accessibilityState={{ selected: letter === entry }}
          >
            <Text style={styles.toolLabel}>{entry}</Text>
          </Pressable>
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
          style={[styles.tool, empty && styles.toolDisabled]}
          disabled={empty}
          onPress={() =>
            onRemoveStrokes([
              ...strokes.map((stroke) => stroke.id),
              ...boardFiles.map((item) => item.id),
            ])
          }
          accessibilityRole="button"
          accessibilityLabel="Clear whiteboard"
        >
          <Ionicons name="trash-outline" size={18} color={colors.text} />
          <Text style={styles.toolLabel}>Clear</Text>
        </Pressable>
        <Text style={styles.hint}>
          {busy
            ? 'Adding file…'
            : letter
              ? `Tap the board to place ${letter}`
              : 'Paste or drop images and PDFs'}
        </Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <BoardSurface onFiles={placeFiles} disabled={busy}>
        <View
          ref={canvasRef}
          style={styles.canvas}
          onLayout={({ nativeEvent: { layout } }) =>
            setSize({ width: layout.width, height: layout.height })
          }
        >
          <View
            style={styles.drawLayer}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={begin}
            onResponderMove={extend}
            onResponderRelease={finish}
            onResponderTerminate={finish}
          >
            <Svg width="100%" height="100%">
              {[...strokes, ...(draftStroke ? [draftStroke] : [])].map((stroke) => {
                const drawing = describeMark(stroke, size);
                return (
                  <Fragment key={stroke.id}>
                    {drawing.d ? (
                      <Path
                        d={drawing.d}
                        stroke={stroke.color}
                        strokeWidth={stroke.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    ) : null}
                    {drawing.label ? (
                      <SvgText
                        x={drawing.label.x}
                        y={drawing.label.y}
                        fill={stroke.color}
                        fontSize={drawing.label.fontSize}
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        {drawing.label.text}
                      </SvgText>
                    ) : null}
                  </Fragment>
                );
              })}
            </Svg>
          </View>
          {boardFiles.map((item) => (
            <BoardFilePreview
              key={item.id}
              item={item}
              owned={item.peerId === selfPeerId}
              onOpen={openHref}
              onRemove={(id) => onRemoveBoardFiles([id])}
            />
          ))}
        </View>
      </BoardSurface>
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
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    marginLeft: 4,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: colors.surface,
  },
  penPreview: {
    width: 18,
    backgroundColor: colors.text,
  },
  canvas: {
    flex: 1,
    position: 'relative',
  },
  drawLayer: {
    ...StyleSheet.absoluteFillObject,
  },
});
