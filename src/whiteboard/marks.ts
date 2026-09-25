import type { Stroke } from '../signaling/events';

/** Tools that place a finished shape from the drag, rather than a freehand trail. */
export const SHAPE_MARKS = ['line', 'arrow', 'rect', 'ellipse'] as const;

export type ShapeMark = (typeof SHAPE_MARKS)[number];

/** Stamps both people can drop on the board without drawing the glyph by hand. */
export const BOARD_LETTERS = ['A', 'B', 'C', '✓', '?', '!'] as const;

export type BoardLetter = (typeof BOARD_LETTERS)[number];

export type BoardMarkKind = 'free' | ShapeMark | 'letter';

export interface MarkSize {
  readonly width: number;
  readonly height: number;
}

export interface MarkLabel {
  readonly text: BoardLetter;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
}

export interface MarkDrawing {
  readonly d: string | null;
  readonly label: MarkLabel | null;
}

const KIND_SET = new Set<string>(['free', ...SHAPE_MARKS, 'letter']);
const LETTER_SET = new Set<string>(BOARD_LETTERS);

function isLetter(value: unknown): value is BoardLetter {
  return typeof value === 'string' && LETTER_SET.has(value);
}

function isKind(value: unknown): value is BoardMarkKind {
  return typeof value === 'string' && KIND_SET.has(value);
}

function finitePoints(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length % 2 !== 0) {
    return null;
  }
  if (!value.every((point) => typeof point === 'number' && Number.isFinite(point))) {
    return null;
  }
  return value;
}

/**
 * A stroke the room is willing to keep. Unknown tools are dropped, and a letter
 * has to be one of the stamps, so a client cannot put arbitrary text on the board.
 */
export function sanitizeStroke(value: unknown): Stroke | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const stroke = value as Partial<Stroke>;
  const points = finitePoints(stroke.points);
  if (
    typeof stroke.id !== 'string' ||
    stroke.id === '' ||
    typeof stroke.peerId !== 'string' ||
    typeof stroke.color !== 'string' ||
    typeof stroke.width !== 'number' ||
    !Number.isFinite(stroke.width) ||
    !points
  ) {
    return null;
  }
  const base = {
    id: stroke.id,
    peerId: stroke.peerId,
    color: stroke.color,
    width: stroke.width,
  };
  if (stroke.kind === undefined || stroke.kind === 'free') {
    return { ...base, points };
  }
  if (!isKind(stroke.kind)) {
    return null;
  }
  if (stroke.kind === 'letter') {
    if (!isLetter(stroke.text)) {
      return null;
    }
    return { ...base, points: [points[0], points[1]], kind: 'letter', text: stroke.text };
  }
  if (points.length < 4) {
    return null;
  }
  const end = points.length;
  return {
    ...base,
    kind: stroke.kind,
    points: [points[0], points[1], points[end - 2], points[end - 1]],
  };
}

function scale(points: readonly number[], size: MarkSize): number[] {
  const scaled: number[] = [];
  for (let index = 0; index < points.length; index += 2) {
    scaled.push(points[index] * size.width, points[index + 1] * size.height);
  }
  return scaled;
}

function freehand(points: readonly number[]): string {
  const segments: string[] = [];
  for (let index = 0; index < points.length; index += 2) {
    const command = index === 0 ? 'M' : 'L';
    segments.push(`${command}${points[index]} ${points[index + 1]}`);
  }
  return points.length === 2 ? `${segments[0]} l0.1 0` : segments.join(' ');
}

function arrowHead(x1: number, y1: number, x2: number, y2: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = 14;
  const left = angle + Math.PI * 0.75;
  const right = angle - Math.PI * 0.75;
  const lx = x2 + length * Math.cos(left);
  const ly = y2 + length * Math.sin(left);
  const rx = x2 + length * Math.cos(right);
  const ry = y2 + length * Math.sin(right);
  return `M${x1} ${y1} L${x2} ${y2} M${x2} ${y2} L${lx} ${ly} M${x2} ${y2} L${rx} ${ry}`;
}

function rectangle(x1: number, y1: number, x2: number, y2: number): string {
  return `M${x1} ${y1} H${x2} V${y2} H${x1} Z`;
}

function ellipse(x1: number, y1: number, x2: number, y2: number): string {
  const rx = Math.max(Math.abs(x2 - x1) / 2, 0.5);
  const ry = Math.max(Math.abs(y2 - y1) / 2, 0.5);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`;
}

/** Pixel path (and optional stamp) for a stroke on a board of `size`. */
export function describeMark(stroke: Stroke, size: MarkSize): MarkDrawing {
  const points = scale(stroke.points, size);
  if (stroke.kind === 'letter' && isLetter(stroke.text)) {
    return {
      d: null,
      label: {
        text: stroke.text,
        x: points[0],
        y: points[1],
        fontSize: Math.max(22, stroke.width * 8),
      },
    };
  }
  if (points.length < 4 || stroke.kind === undefined || stroke.kind === 'free') {
    return { d: freehand(points), label: null };
  }
  const [x1, y1, x2, y2] = points;
  if (stroke.kind === 'line') {
    return { d: `M${x1} ${y1} L${x2} ${y2}`, label: null };
  }
  if (stroke.kind === 'arrow') {
    return { d: arrowHead(x1, y1, x2, y2), label: null };
  }
  if (stroke.kind === 'rect') {
    return { d: rectangle(x1, y1, x2, y2), label: null };
  }
  return { d: ellipse(x1, y1, x2, y2), label: null };
}
